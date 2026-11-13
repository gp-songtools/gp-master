# GP Mastering separation server: set up or update it on Modal (Windows).
# Run from this folder:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
# 'Continue', not 'Stop': Windows PowerShell 5.1 turns any message a program prints to stderr
# into an error under 'Stop'. Each step checks the program's exit code instead.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

# Find Python 3.10+. "python" on Windows can be a shortcut to the Microsoft Store, so test each one.
$py = $null
foreach ($c in @('py', 'python', 'python3')) {
  if (Get-Command $c -ErrorAction SilentlyContinue) {
    & $c -c "import sys; sys.exit(sys.version_info < (3, 10))" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $py = $c; break }
  }
}
if (-not $py) {
  Write-Host "Python 3.10 or newer is needed. Install it from https://www.python.org/downloads/"
  Write-Host "(tick 'Add python.exe to PATH' in the installer), then run this again."
  exit 1
}
function Run { & $py @args; if ($LASTEXITCODE -ne 0) { throw "This step failed: $py $($args -join ' ')" } }

Write-Host "== 1/4  Installing Modal's command-line tool"
Run -m pip install --quiet --upgrade "modal==1.6.4"

Write-Host "== 2/4  Signing in to Modal"
if (-not $env:MODAL_TOKEN_ID -and -not (Test-Path (Join-Path $HOME '.modal.toml'))) {
  Write-Host "A browser window opens: sign in to Modal (or create a free account) and approve."
  Run -m modal setup
} else { Write-Host "Already signed in." }

Write-Host "== 3/4  Access token"
$tokFile = Join-Path $PSScriptRoot 'access-token.txt'
if ((Test-Path $tokFile) -and (Get-Content $tokFile -Raw).Trim()) {
  $token = (Get-Content $tokFile -Raw).Trim()
  Write-Host "Using the token saved in access-token.txt."
} else {
  $token = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  Set-Content -Path $tokFile -Value $token -NoNewline
  Write-Host "Made a new token and saved it in access-token.txt."
}
Run -m modal secret create gpm-sep "GPM_TOKEN=$token" --force | Out-Null

Write-Host "== 4/4  Deploying (the first time takes a few minutes)"
$env:PYTHONIOENCODING = 'utf-8'
$lines = & $py -m modal deploy modal_app.py 2>&1 | ForEach-Object { $s = "$_"; Write-Host $s; $s }
if ($LASTEXITCODE -ne 0) { throw "The deploy failed; see the messages above." }
$url = ($lines | Select-String -Pattern 'https://[A-Za-z0-9.-]+\.modal\.run' | Select-Object -First 1).Matches.Value

Write-Host ""
Write-Host "Done. In GP Mastering, under Stem balance, choose Separate on: My server and enter:"
if ($url) { Write-Host "  Address: $url" } else { Write-Host "  Address: (see the web function on the deployment page linked above)" }
Write-Host "  Token:   $token"
