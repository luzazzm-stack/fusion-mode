# Installs Fusion for Claude Code, Codex and/or opencode on Windows. Safe to run again.
# Uninstall: .\install.ps1 -Uninstall
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$oc = Join-Path $HOME '.config\opencode'
if ($Uninstall) {
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $HOME '.fusion\fusion.mjs'), (Join-Path $oc 'command\fusion.md'), (Join-Path $oc 'agents\fusion-worker.md')
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $HOME '.claude\skills\fusion'), (Join-Path $HOME '.codex\skills\fusion')
  Write-Host 'Fusion removed (backup copies in ~\.fusion\backups are kept).'; return
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'Fusion needs Node.js 18 or newer: https://nodejs.org'; return }
if (-not (Get-Command opencode -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $HOME '.opencode\bin\opencode.exe'))) {
  Write-Host 'Note: API-model workers run through opencode (https://opencode.ai); without it they are called directly (text answers only).' }
New-Item -ItemType Directory -Force (Join-Path $HOME '.fusion') | Out-Null
Copy-Item (Join-Path $here 'fusion.mjs') (Join-Path $HOME '.fusion\fusion.mjs') -Force
if (Test-Path (Join-Path $HOME '.claude')) {
  $sk = Join-Path $HOME '.claude\skills\fusion'; New-Item -ItemType Directory -Force $sk | Out-Null
  Copy-Item (Join-Path $here 'claude-code\skills\fusion\SKILL.md') $sk -Force; Write-Host 'Claude Code: /fusion installed' }
if (Test-Path (Join-Path $HOME '.codex')) {
  $cs = Join-Path $HOME '.codex\skills\fusion'; New-Item -ItemType Directory -Force $cs | Out-Null
  Copy-Item (Join-Path $here 'codex\skills\fusion\SKILL.md') $cs -Force; Write-Host 'Codex: fusion skill installed' }
New-Item -ItemType Directory -Force (Join-Path $oc 'command'), (Join-Path $oc 'agents') | Out-Null
Copy-Item (Join-Path $here 'opencode\command\fusion.md') (Join-Path $oc 'command') -Force
Copy-Item (Join-Path $here 'opencode\agents\fusion-worker.md') (Join-Path $oc 'agents') -Force
Write-Host 'opencode: /fusion and the fusion-worker agent installed'
Write-Host 'Done. Restart Claude Code / Codex / opencode, then type /fusion (first run walks you through setup).'
