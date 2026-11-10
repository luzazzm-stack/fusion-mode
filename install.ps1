# Installs Fusion for Claude Code and/or opencode on Windows. Safe to run again.
# Uninstall: .\install.ps1 -Uninstall
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$oc = Join-Path $HOME '.config\opencode'
if ($Uninstall) {
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $HOME '.fusion\fusion.mjs'), (Join-Path $oc 'command\fusion.md'), (Join-Path $oc 'agents\fusion-worker.md')
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $HOME '.claude\skills\fusion')
  Write-Host 'Fusion removed (backup copies in ~\.fusion\backups are kept).'; return
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'Fusion needs Node.js 18 or newer: https://nodejs.org'; return }
if (-not (Get-Command opencode -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $HOME '.opencode\bin\opencode.exe'))) {
  Write-Host 'Note: the worker runs through opencode (https://opencode.ai). Install it before using /fusion.' }
New-Item -ItemType Directory -Force (Join-Path $HOME '.fusion') | Out-Null
Copy-Item (Join-Path $here 'fusion.mjs') (Join-Path $HOME '.fusion\fusion.mjs') -Force
if (Test-Path (Join-Path $HOME '.claude')) {
  $sk = Join-Path $HOME '.claude\skills\fusion'; New-Item -ItemType Directory -Force $sk | Out-Null
  Copy-Item (Join-Path $here 'claude-code\skills\fusion\SKILL.md') $sk -Force; Write-Host 'Claude Code: /fusion installed' }
New-Item -ItemType Directory -Force (Join-Path $oc 'command'), (Join-Path $oc 'agents') | Out-Null
Copy-Item (Join-Path $here 'opencode\command\fusion.md') (Join-Path $oc 'command') -Force
Copy-Item (Join-Path $here 'opencode\agents\fusion-worker.md') (Join-Path $oc 'agents') -Force
Write-Host 'opencode: /fusion and the fusion-worker agent installed'
Write-Host 'Done. Restart Claude Code / opencode, then type /fusion.'
