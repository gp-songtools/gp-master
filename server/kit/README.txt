GP Mastering - your own stem separation server
==============================================

This kit sets up a small server on Modal (modal.com) that separates stems for
GP Mastering on a GPU: a whole song takes about a minute and a half instead of
tens of minutes in the browser. It runs the same three models (vocals, drums,
bass) with the same settings, so the stems are the same.

The server is yours: it runs under your own Modal account, and only you have
its access token.


What it costs
-------------
Modal's free Starter plan includes monthly credits. One song uses about a cent
of GPU time. The server shuts down two minutes after the last song, so an idle
server costs nothing. Modal may ask for a card when you sign up.


What you need
-------------
- Python 3.10 or newer: https://www.python.org/downloads/
  On Windows, tick "Add python.exe to PATH" in the installer.
- A Modal account. The setup opens a browser window to sign in or sign up.


Set it up
---------
1. Unzip this kit (on Windows: right-click the zip, Extract All).

2. Run the setup from inside the unzipped folder.

   Windows: open the folder, right-click an empty spot, choose
   "Open in Terminal", and run:
       powershell -ExecutionPolicy Bypass -File .\setup.ps1

   macOS or Linux: open a terminal in the folder and run:
       bash setup.sh

   It installs Modal's command-line tool, signs you in, makes an access
   token, and deploys the server. The first deploy takes a few minutes.

3. At the end it prints an Address and a Token. In GP Mastering, under
   Stem balance, set "Separate on" to "My server", paste both, and press Test.

The token is also saved in access-token.txt in this folder. Keep it private:
anyone with the address and the token can use your server.


Models
------
In GP Mastering you choose the model for each stem:
- Standard: the same models as in the browser, so the same stems.
- Demucs (vocals, drums, bass): Meta's Hybrid Transformer Demucs (htdemucs_ft,
  MIT licence). Often crisper drums.
- RoFormer (vocals only): BS-RoFormer, viperx edition, a newer vocal model,
  distributed by Ultimate Vocal Remover on the same terms as the standard
  models (credit, free, never in anything paid). Its code is ZFTurbo's Music
  Source Separation Training (MIT licence).
Modal downloads Demucs and RoFormer (about 1 GB together) while it builds the
server, so the first deploy takes a few minutes longer. The first song that
uses one of them waits a little longer while it loads.


The standard models
-------------------
By default Modal downloads the three model files (123 MB) from the GP Mastering
site while it builds your server, so this kit stays small.

To use your own copy instead (for example if the site is unavailable), make a
folder named "models" inside this folder and put these three files in it,
with exactly these names:

    https://gp-songtools.github.io/gp-master/models/Kim_Vocal_2.onnx
    https://gp-songtools.github.io/gp-master/models/kuielab_a_drums.onnx
    https://gp-songtools.github.io/gp-master/models/kuielab_a_bass.onnx

    gpm-sep-server/
        models/
            Kim_Vocal_2.onnx
            kuielab_a_drums.onnx
            kuielab_a_bass.onnx
        modal_app.py
        setup.ps1
        ...

Then run the setup again. The deploy uploads them from your computer, which
takes longer on a slow connection. The files are checked either way: a wrong or
damaged file stops the deploy with a message instead of producing bad stems.

The models are Kim_Vocal_2 by Kimberley Jensen and kuielab_a_drums and
kuielab_a_bass from KUIELab-MDX-Net by KUIELab, distributed by Ultimate Vocal
Remover. They carry no licence of their own: they are used with credit, free of
charge, and never in anything paid. Please keep it that way.


Updating, stopping, removing
----------------------------
- Update: download a new kit from GP Mastering, copy access-token.txt (and your
  models folder, if you made one) into it, and run the setup again. The address
  and token stay the same.
- New token: delete access-token.txt and run the setup again, then paste the
  new token into GP Mastering.
- Stop the server:     python -m modal app stop gpm-sep
  (use "py -m modal" on Windows if "python" is not found)
- Your usage and logs: https://modal.com/apps


Privacy
-------
When you separate on your server, GP Mastering uploads the section you chose
to it as 16-bit audio and gets the stems back. Nothing else is stored; Modal
keeps a finished job's result for a limited time so the page can fetch it. The
token is sent only in the Authorization header.
