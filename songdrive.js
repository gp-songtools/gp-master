/* songdrive v1.1.0 — Google Drive for the GP Song Tools: one folder per song, the song spec in it.
 * Canonical copy: gp-songtools/toolsmenu/songspec/songdrive.js. Tools keep a byte-identical copy
 * next to their songspec.js; never edit a copy, change this file and copy it again. Format: songspec/SPEC.md, section 8.
 * No dependencies. Works as a classic <script> (global SongDrive) and from Node (tests inject a fake fetch).
 *
 * - Only the `drive.file` scope: the tools see just the files and folders the GP Song Tools created.
 * - Nothing is loaded or requested until the first sign-in call, and that call must come straight from a click
 *   (Google's sign-in popup is blocked otherwise).
 * - The access token (one hour) is kept in localStorage, shared by every tool on the address. It never goes
 *   into a URL, a log or an error message.
 * - A tool with its own Google sign-in can hand its token over: configure({ auth: { token, signIn, signOut? } }), where
 *   token() returns the current access token (or null), signIn(opts) starts the tool's own sign-in (songdrive calls it
 *   synchronously from signIn(), so a popup still opens from the click) and signOut() is optional. With auth set,
 *   songdrive never loads Google's script, never stores or revokes a token, and reads auth.token() on every request.
 *   configure({ auth: null }) restores the built-in sign-in.
 * - Files and folders: move(fileId, toFolderId, {fromFolderId}), rename(fileId, name), trash(fileId),
 *   findFolder(parentId, name) (exact name, not trashed, or null) and children(folderId, {foldersOnly, filesOnly, q}).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SongDrive = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.1.0';
  let CLIENT_ID = '514325867394-f0mnkc7h7849iictdpbpb2pov8qp08fc.apps.googleusercontent.com'; // Lyricpad's; only names the app to Google
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const GIS_URL = 'https://accounts.google.com/gsi/client';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const ROOT_NAME = 'GP Song Tools';
  const SUBFOLDERS = ['lyrics', 'audio', 'images', 'clips', 'exports', 'projects'];
  const TOKEN_KEY = 'gpsongtools.drive.token';
  const SYNC_KEY = 'gpsongtools.drive.synced';
  const FOLDER = 'application/vnd.google-apps.folder';
  const SPEC_EXT = '.songspec.md';
  const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,version';
  const META_FIELDS = 'id,name,parents,mimeType,modifiedTime,version';

  let fetchImpl = null;
  let auth = null; // a tool's own sign-in: { token, signIn, signOut }
  let chunkSize = 8 * 1024 * 1024; // a multiple of 256 KiB
  let sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class SongDriveError extends Error {
    constructor(message, { code = 'http', status = 0 } = {}) {
      super(message);
      this.name = 'SongDriveError';
      this.code = code;
      this.status = status;
    }
  }

  /**
   * Override the client id, the fetch function (tests), the upload chunk size or the retry pause (tests), or hand over
   * the tool's own sign-in with `auth` ({ token(), signIn(opts), signOut?() }; null restores the built-in one).
   */
  function configure({ clientId, fetch: f, chunk, sleep: s, auth: a } = {}) {
    if (clientId) CLIENT_ID = clientId;
    if (a !== undefined) {
      if (a !== null && (typeof a !== 'object' || typeof a.token !== 'function' || typeof a.signIn !== 'function')) {
        throw new SongDriveError('auth needs token() and signIn() functions.', { code: 'auth' });
      }
      auth = a;
    }
    if (f) fetchImpl = f;
    if (chunk) chunkSize = chunk;
    if (s) sleep = s;
  }
  const doFetch = (...a) => (fetchImpl || globalThis.fetch)(...a);
  const SS = () => globalThis.SongSpec || require('./songspec.js');

  // ---------- storage (every access guarded) ----------
  const lsGet = (k) => { try { return globalThis.localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v == null ? globalThis.localStorage.removeItem(k) : globalThis.localStorage.setItem(k, v); } catch { /* ignore */ } };
  const getToken = () => { try { return JSON.parse(lsGet(TOKEN_KEY)); } catch { return null; } };
  const setToken = (t) => lsSet(TOKEN_KEY, t ? JSON.stringify(t) : null);

  /** True when a token is stored that has more than a minute left. */
  function signedIn() {
    if (auth) return !!auth.token();
    const t = getToken();
    return !!(t && t.value && t.expires > Date.now() + 60_000);
  }

  // ---------- sign-in (Google Identity Services, loaded only when first needed) ----------
  let gisLoading = null, tokenClient = null, waiter = null, signing = null;

  function loadGis() {
    if (globalThis.google?.accounts?.oauth2) return null;
    gisLoading ||= new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject(new SongDriveError("Google sign-in isn't available here.", { code: 'auth' }));
      const s = document.createElement('script');
      s.src = GIS_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; reject(new SongDriveError("Couldn't load Google sign-in. Check your connection.", { code: 'network' })); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }

  function startSignIn(prompt) {
    const oauth = globalThis.google.accounts.oauth2;
    if (!tokenClient) {
      tokenClient = oauth.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (resp) => {
          const w = waiter; waiter = null;
          if (!w) return;
          if (!resp || resp.error) return w.reject(new SongDriveError(resp?.error === 'access_denied'
            ? 'Google Drive access was not allowed. Click again and allow it when Google asks.'
            : 'Google sign-in failed. Click again to try once more.', { code: 'auth' }));
          if (oauth.hasGrantedAllScopes && !oauth.hasGrantedAllScopes(resp, SCOPE)) {
            return w.reject(new SongDriveError('The GP Song Tools need permission to save files to your Drive. Click again and allow it.', { code: 'auth' }));
          }
          setToken({ value: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 });
          w.resolve();
        },
        error_callback: (err) => {
          const w = waiter; waiter = null;
          if (w) w.reject(new SongDriveError(err?.type === 'popup_closed' || err?.type === 'popup_failed_to_open'
            ? 'The Google sign-in window was closed or blocked. Click again to sign in.'
            : 'Google sign-in failed. Click again to try once more.', { code: 'popup' }));
        },
      });
    }
    return new Promise((resolve, reject) => { waiter = { resolve, reject }; tokenClient.requestAccessToken({ prompt: prompt ?? '' }); });
  }

  /** Make sure there is a token. Call it straight from a click: with Google's script already loaded, the popup opens at once. */
  function signIn(opts = {}) {
    if (auth) {
      if (auth.token()) return Promise.resolve();
      return Promise.resolve(auth.signIn(opts)).then(() => { // auth.signIn runs synchronously, in the click
        if (!auth.token()) throw new SongDriveError('Google sign-in did not finish. Click again to sign in.', { code: 'auth' });
      });
    }
    const { prompt } = opts || {};
    if (signedIn()) return Promise.resolve();
    if (signing) return signing;
    const loading = loadGis();
    signing = (loading ? loading.then(() => startSignIn(prompt)) : startSignIn(prompt));
    const done = () => { signing = null; };
    signing.then(done, done);
    return signing;
  }

  /** Sign out of Drive on this device: revoke the token and forget the sync notes. */
  async function signOut() {
    if (auth) {
      lsSet(SYNC_KEY, null);
      if (typeof auth.signOut === 'function') await auth.signOut();
      return;
    }
    const t = getToken();
    try { if (t?.value && globalThis.google?.accounts?.oauth2?.revoke) globalThis.google.accounts.oauth2.revoke(t.value, () => {}); } catch { /* ignore */ }
    setToken(null);
    lsSet(SYNC_KEY, null);
  }

  // ---------- requests ----------
  const authErr = () => new SongDriveError('Google sign-in expired. Click again to sign in.', { code: 'auth', status: 401 });

  /**
   * One authorised request. Retries 5xx, 429 and network failures with a pause unless retry is false.
   * 401 clears the stored token (not a tool's own token from `auth`). Statuses in `allow` (e.g. 308) are returned like successes.
   */
  async function request(url, init = {}, { retry = true, allow = [] } = {}) {
    for (let attempt = 0; ; attempt++) {
      const tok = auth ? auth.token() : getToken()?.value;
      if (!tok) throw authErr();
      let res;
      try {
        res = await doFetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${tok}` } });
      } catch (e) {
        if (e && e.name === 'AbortError') throw new SongDriveError('Cancelled.', { code: 'cancelled' });
        if (retry && attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
        throw new SongDriveError("Couldn't reach Google Drive. Check your connection.", { code: 'network' });
      }
      if (res.ok || allow.includes(res.status)) return res;
      if (res.status === 401) { if (!auth) setToken(null); throw authErr(); }
      if ((res.status >= 500 || res.status === 429) && retry && attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
      let detail = '';
      try { detail = (await res.json())?.error?.message || ''; } catch { /* no body */ }
      if (res.status === 404) throw new SongDriveError('That file or folder is not on your Google Drive any more.', { code: 'notfound', status: 404 });
      throw new SongDriveError(`Google Drive said no (${res.status})${detail ? `: ${detail}` : ''}.`, { code: 'http', status: res.status });
    }
  }
  const json = async (url, init, opts) => (await request(url, init, opts)).json();
  const qs = (o) => new URLSearchParams(o).toString();
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // ---------- folders ----------

  /** A Drive-safe folder name from the title: no control characters or / \ : * ? " < > |, one space between words, 100 characters at most. */
  function folderName(title) {
    return String(title ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\/\\:*?"<>|]/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, 100).trim();
  }

  async function listPages(q, extra = {}) {
    const out = [];
    let pageToken = '';
    do {
      const params = { q, fields: `nextPageToken,files(${FILE_FIELDS},parents)`, pageSize: '1000', orderBy: 'name', ...extra };
      if (pageToken) params.pageToken = pageToken;
      const r = await json(`${API}/files?${qs(params)}`);
      out.push(...(r.files || []));
      pageToken = r.nextPageToken || '';
    } while (pageToken);
    return out;
  }
  const folderByName = async (name, parentId) =>
    (await listPages(`name = '${esc(name)}' and mimeType = '${FOLDER}' and '${esc(parentId)}' in parents and trashed = false`))[0] || null;
  const makeFolder = (name, parentId) => json(`${API}/files?${qs({ fields: 'id,name' })}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });

  /** The "GP Song Tools" folder in My Drive: {id, name} or null (when missing and create is false). */
  async function rootFolder({ create = true } = {}) {
    await signIn();
    const f = await folderByName(ROOT_NAME, 'root');
    if (f) return { id: f.id, name: f.name };
    if (create === false) return null;
    const c = await makeFolder(ROOT_NAME, 'root');
    return { id: c.id, name: c.name };
  }

  /**
   * The Drive folder for this song (doc = parsed song spec): the one named by `drive_folder`, else one named from the
   * title under GP Song Tools. If a folder of that name already exists and `confirm(name)` is given, it is asked whether
   * to reuse it (true) or make "<name> (2)" (false). Returns {id, name, created}, or null when create is false and none exists.
   */
  async function songFolder(doc, { create = true, confirm } = {}) {
    await signIn();
    const SpecLib = SS();
    const known = SpecLib.setting(doc, 'drive_folder');
    if (known) {
      try {
        const f = await json(`${API}/files/${encodeURIComponent(known)}?${qs({ fields: 'id,name,trashed,mimeType' })}`);
        if (!f.trashed && f.mimeType === FOLDER) return { id: f.id, name: f.name, created: false };
      } catch (e) { if (e.code !== 'notfound') throw e; }
    }
    const name = folderName(SpecLib.setting(doc, 'title'));
    if (!name) throw new SongDriveError('Give the song a title first: its Drive folder is named after it.', { code: 'notitle' });
    const root = await rootFolder({ create });
    if (!root) return null;
    const found = await folderByName(name, root.id);
    let useName = name;
    if (found) {
      if (!confirm || (await confirm(name))) return { id: found.id, name: found.name, created: false };
      for (let n = 2; ; n++) {
        useName = `${name} (${n})`;
        if (!(await folderByName(useName, root.id))) break;
      }
    }
    if (!create) return null;
    const c = await makeFolder(useName, root.id);
    return { id: c.id, name: c.name, created: true };
  }

  /** One of the song folder's subfolders (lyrics, audio, images, clips, exports, projects), made when missing. */
  async function subfolder(songFolderId, name, { create = true } = {}) {
    if (!SUBFOLDERS.includes(name)) throw new SongDriveError(`"${name}" is not a GP Song Tools subfolder.`, { code: 'http' });
    await signIn();
    const f = await folderByName(name, songFolderId);
    if (f) return { id: f.id, name: f.name };
    if (create === false) return null;
    const c = await makeFolder(name, songFolderId);
    return { id: c.id, name: c.name };
  }

  /** Files (not folders, not trashed) in a folder: {id, name, mimeType, size, modifiedTime, version}. */
  async function list(folderId, { mimePrefix } = {}) {
    await signIn();
    let q = `'${esc(folderId)}' in parents and trashed = false and mimeType != '${FOLDER}'`;
    if (mimePrefix) q += ` and mimeType contains '${esc(mimePrefix)}'`;
    return (await listPages(q)).map(({ parents, ...f }) => f);
  }

  async function download(fileId) {
    await signIn();
    return (await request(`${API}/files/${encodeURIComponent(fileId)}?alt=media`)).blob();
  }
  async function downloadText(fileId) {
    await signIn();
    return (await request(`${API}/files/${encodeURIComponent(fileId)}?alt=media`)).text();
  }

  // ---------- upload (resumable) ----------

  /**
   * Upload a Blob. New file in folderId, or a new version of fileId. Sent in chunks, resumed after a network error or
   * a 5xx (4 retries). onProgress(sent, total); signal aborts with code 'cancelled'. Returns Drive's file record.
   */
  async function upload(folderId, name, blob, { mimeType, fileId, onProgress, signal } = {}) {
    await signIn();
    const total = blob.size;
    const type = mimeType || blob.type || 'application/octet-stream';
    const q = qs({ uploadType: 'resumable', fields: FILE_FIELDS });
    const init = await request(fileId ? `${UPLOAD}/files/${encodeURIComponent(fileId)}?${q}` : `${UPLOAD}/files?${q}`, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(total) },
      body: JSON.stringify(fileId ? { name } : { name, parents: [folderId] }),
      signal,
    });
    const session = init.headers.get('Location');
    if (!session) throw new SongDriveError('Google Drive did not start the upload.', { code: 'http' });
    const put = (headers, body) => request(session, { method: 'PUT', headers, body, signal }, { retry: false, allow: [308] });
    const resumable = (e) => e.code === 'network' || e.status === 429 || e.status >= 500;

    if (total === 0) {
      const r = await put({ 'Content-Range': 'bytes */0' });
      if (onProgress) onProgress(0, 0);
      return r.json();
    }
    let offset = 0, tries = 0;
    for (;;) {
      if (signal?.aborted) throw new SongDriveError('Cancelled.', { code: 'cancelled' });
      const end = Math.min(offset + chunkSize, total);
      let res;
      try {
        res = await put({ 'Content-Range': `bytes ${offset}-${end - 1}/${total}` }, blob.slice(offset, end));
      } catch (e) {
        if (!(e instanceof SongDriveError) || !resumable(e) || ++tries > 4) throw e;
        await sleep(500 * 2 ** (tries - 1));
        // Ask Drive how much it has, then carry on from there (or finish if it already has it all).
        for (;;) {
          try {
            const s = await put({ 'Content-Range': `bytes */${total}` });
            if (s.status === 308) { const m = /bytes=0-(\d+)/.exec(s.headers.get('Range') || ''); offset = m ? Number(m[1]) + 1 : 0; break; }
            if (onProgress) onProgress(total, total);
            return s.json();
          } catch (e2) {
            if (!(e2 instanceof SongDriveError) || !resumable(e2) || ++tries > 4) throw e2;
            await sleep(500 * 2 ** (tries - 1));
          }
        }
        continue;
      }
      if (res.status === 308) {
        const m = /bytes=0-(\d+)/.exec(res.headers.get('Range') || '');
        offset = m ? Number(m[1]) + 1 : offset;
        if (onProgress) onProgress(offset, total);
        continue;
      }
      if (onProgress) onProgress(total, total);
      return res.json();
    }
  }

  // ---------- the song spec in its folder ----------

  const readSync = () => { try { return JSON.parse(lsGet(SYNC_KEY)) || {}; } catch { return {}; } };
  /** Remember the version of each spec file this browser last saved or read, so a newer Drive copy is noticed. */
  function noteSync(fileId, version) {
    const m = readSync();
    delete m[fileId];
    m[fileId] = String(version);
    const keys = Object.keys(m);
    for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete m[k];
    lsSet(SYNC_KEY, JSON.stringify(m));
  }
  const specsIn = async (folderId) => (await list(folderId)).filter((f) => f.name.endsWith(SPEC_EXT))
    .sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));

  /**
   * Songs on Drive that have a song spec: [{folderId, folderName, fileId, fileName, modifiedTime, version}], newest first.
   */
  async function listSongs() {
    await signIn();
    const root = await rootFolder({ create: false });
    if (!root) return [];
    const folders = await listPages(`'${esc(root.id)}' in parents and trashed = false and mimeType = '${FOLDER}'`);
    const out = [];
    for (let i = 0; i < folders.length; i += 20) {
      const batch = folders.slice(i, i + 20);
      const q = `(${batch.map((f) => `'${esc(f.id)}' in parents`).join(' or ')}) and trashed = false and mimeType != '${FOLDER}'`;
      const files = (await listPages(q)).filter((f) => f.name.endsWith(SPEC_EXT));
      for (const f of batch) {
        const mine = files.filter((x) => (x.parents || []).includes(f.id)).sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''))[0];
        if (mine) out.push({ folderId: f.id, folderName: f.name, fileId: mine.id, fileName: mine.name, modifiedTime: mine.modifiedTime, version: mine.version });
      }
    }
    return out.sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
  }

  /** Read a song's spec (an entry from listSongs): {text, folderId, fileId}. Notes the version it read. */
  async function openSpec(entry) {
    await signIn();
    const meta = await json(`${API}/files/${encodeURIComponent(entry.fileId)}?${qs({ fields: 'id,version,parents' })}`);
    const text = await downloadText(entry.fileId);
    noteSync(entry.fileId, meta.version);
    return { text, folderId: entry.folderId || (meta.parents || [])[0] || '', fileId: entry.fileId };
  }

  /**
   * Save the song spec (text, or the browser copy) into its Drive song folder, making the folder if needed, and write
   * `drive_folder` into it. Asks `confirm('reuse-folder', name)` when a folder of that name exists, and
   * `confirm('replace-newer', name)` when the Drive copy changed since this browser last saved or opened it.
   * Returns {folderId, fileId, fileName, created}.
   */
  async function saveSpec({ text, confirm } = {}) {
    const signed = signIn(); // first thing, so the popup opens from the click
    const Spec = SS();
    const fromStore = text == null;
    if (fromStore) text = Spec.store.load();
    await signed;
    let doc = Spec.parse(text || Spec.create());
    const folder = await songFolder(doc, { create: true, confirm: confirm ? (n) => confirm('reuse-folder', n) : undefined });
    if (Spec.setting(doc, 'drive_folder') !== folder.id) {
      if (fromStore) doc = Spec.store.update((d) => Spec.setSetting(d, 'drive_folder', folder.id, { by: 'person' }));
      else Spec.setSetting(doc, 'drive_folder', folder.id, { by: 'person' });
    }
    const body = Spec.serialize(doc);
    const existing = (await specsIn(folder.id))[0];
    if (existing && readSync()[existing.id] !== String(existing.version)) {
      if (!confirm || !(await confirm('replace-newer', existing.name))) {
        throw new SongDriveError('The Drive copy changed since this browser last saved or opened it.', { code: 'cancelled' });
      }
    }
    const fileName = existing ? existing.name : Spec.fileName(doc);
    const f = await upload(folder.id, fileName, new Blob([body], { type: 'text/markdown' }), { mimeType: 'text/markdown', fileId: existing?.id });
    noteSync(f.id, f.version);
    return { folderId: folder.id, fileId: f.id, fileName: f.name || fileName, created: !existing };
  }

  // ---------- files and folders ----------

  const patch = (fileId, query, body) => json(`${API}/files/${encodeURIComponent(fileId)}?${qs({ fields: META_FIELDS, ...query })}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body),
  });

  /** Move a file or folder into toFolderId. Leaves fromFolderId (or, when not given, every folder it is in). Returns Drive's file record. */
  async function move(fileId, toFolderId, { fromFolderId } = {}) {
    await signIn();
    let remove = fromFolderId ? [fromFolderId] : null;
    if (!remove) {
      const meta = await json(`${API}/files/${encodeURIComponent(fileId)}?${qs({ fields: 'id,parents' })}`);
      remove = (meta.parents || []).filter((p) => p !== toFolderId);
    }
    const query = { addParents: toFolderId };
    if (remove.length) query.removeParents = remove.join(',');
    return patch(fileId, query, {});
  }

  /** Rename a file or folder. Returns Drive's file record. */
  async function rename(fileId, name) {
    await signIn();
    return patch(fileId, {}, { name });
  }

  /** Move a file or folder to Drive's trash (it can be restored there). Returns Drive's file record. */
  async function trash(fileId) {
    await signIn();
    return patch(fileId, {}, { trashed: true });
  }

  /** The folder named exactly `name` (not trashed) inside parentId: {id, name} or null. parentId 'root' is My Drive. */
  async function findFolder(parentId, name) {
    await signIn();
    const f = await folderByName(name, parentId);
    return f ? { id: f.id, name: f.name } : null;
  }

  /**
   * What is in a folder (not trashed): {id, name, mimeType, size, modifiedTime, version}. foldersOnly: just subfolders;
   * filesOnly: just files (what list() does); q: an extra Drive query clause, ANDed in.
   */
  async function children(folderId, { foldersOnly, filesOnly, q } = {}) {
    await signIn();
    let query = `'${esc(folderId)}' in parents and trashed = false`;
    if (foldersOnly) query += ` and mimeType = '${FOLDER}'`;
    else if (filesOnly) query += ` and mimeType != '${FOLDER}'`;
    if (q) query += ` and (${q})`;
    return (await listPages(query)).map(({ parents, ...f }) => f);
  }

  return {
    VERSION, SCOPE, ROOT_NAME, SUBFOLDERS, TOKEN_KEY, SYNC_KEY, SongDriveError,
    configure, signedIn, signIn, signOut, folderName,
    rootFolder, songFolder, subfolder, list, download, downloadText, upload,
    listSongs, openSpec, saveSpec,
    move, rename, trash, findFolder, children,
  };
});
