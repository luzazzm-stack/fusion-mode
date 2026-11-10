// Fusion: the model you are using is the boss (plans, checks); ONE free model you pick is the worker (writes code).
// Helper used by /fusion in Claude Code and in opencode. MIT License. Runs only when called; nothing in the background.
//   node fusion.mjs models                         working free worker models, as JSON {provider: [{id, name}]}
//   node fusion.mjs run --model P/M --brief FILE [--cwd DIR] [--timeout SECONDS]
//       runs ONE worker task with opencode (agent "fusion-worker", restricted permissions) and prints its report,
//       the files that changed, anything it deleted, and how to undo the task.
//       Exit 0 = finished, 3 = the model is unavailable (limit, busy, gone), 1 = error.
//   node fusion.mjs undo --snapshot ID [--cwd DIR]  put back every file the task changed or deleted
// Before each task the folder is saved as a snapshot (git: a hidden commit; no git: a backup copy), because a list of
// blocked commands can always be dodged (2026-11-11 test: rm was blocked, the model used del instead).
// opencode's own Zen models (provider "opencode") are never offered: opencode treats scripted use of its free tier
// as abuse. More providers to hide: FUSION_SKIP=a,b. Another opencode binary: FUSION_OPENCODE=path.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url';

const HOME = os.homedir();
const SELF = fileURLToPath(import.meta.url).split(path.sep).join('/');
const OPENCODE = [process.env.FUSION_OPENCODE, path.join(HOME, '.opencode/bin/opencode.exe'), path.join(HOME, '.opencode/bin/opencode')]
  .find((p) => p && fs.existsSync(p)) || 'opencode';
const CONFIG = path.join(HOME, '.config/opencode/opencode.json');
const SKIP = new Set(['opencode', 'opencode-free', ...(process.env.FUSION_SKIP || '').split(',').map((x) => x.trim()).filter(Boolean)]);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const slash = (p) => p.split(path.sep).join('/');

function models() {
  const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const out = {};
  for (const [id, p] of Object.entries(c.provider || {})) {
    if (SKIP.has(id) || !p.models) continue;
    out[id] = Object.entries(p.models).map(([m, v]) => ({ id: `${id}/${m}`, name: v.name || m }));
  }
  console.log(JSON.stringify(out, null, 1));
}

const UNAVAILABLE = /\b429\b|rate.?limit|too many requests|quota|capacity|exclusive to subscription|insufficient (credit|balance)|model not found|no longer available|\b410\b|\b50[0234]\b|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i;

function git(cwd, args, env = {}) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } });
}

function snapshot(cwd) {
  if (git(cwd, ['rev-parse', '--is-inside-work-tree']).status === 0) {
    const idx = path.join(os.tmpdir(), 'fusion-index-' + process.pid);     // a separate index: the user's staging is untouched
    const env = { GIT_INDEX_FILE: idx };
    git(cwd, ['read-tree', 'HEAD'], env);
    git(cwd, ['add', '-A'], env);
    const tree = git(cwd, ['write-tree'], env).stdout.trim();
    fs.rmSync(idx, { force: true });
    const who = { GIT_AUTHOR_NAME: 'fusion', GIT_AUTHOR_EMAIL: 'fusion@local', GIT_COMMITTER_NAME: 'fusion', GIT_COMMITTER_EMAIL: 'fusion@local' };
    const sha = tree && git(cwd, ['commit-tree', tree, '-m', 'fusion snapshot'], who).stdout.trim();
    if (sha) { git(cwd, ['update-ref', 'refs/fusion/' + sha.slice(0, 12), sha]); return 'git:' + sha; }
  }
  let size = 0;
  const skip = (name) => name === 'node_modules' || name === '.git';
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else size += fs.statSync(p).size;
      if (size > 300e6) throw new Error('too big');
    }
  };
  try { walk(cwd); } catch { return null; }
  const dest = path.join(HOME, '.fusion', 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.cpSync(cwd, dest, { recursive: true, filter: (p) => !p.split(path.sep).some(skip) });
  return 'copy:' + slash(dest);
}

function undo() {
  const cwd = path.resolve(arg('cwd', process.cwd())); const id = arg('snapshot', '');
  if (id.startsWith('git:')) {
    // checkout also writes the files into git's staging list; keep the user's staging exactly as it was
    const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']).stdout.trim();
    const index = path.join(gitDir, 'index'); const keep = index + '.fusion-keep';
    if (fs.existsSync(index)) fs.copyFileSync(index, keep);
    const r = git(cwd, ['checkout', id.slice(4), '--', '.']);
    if (fs.existsSync(keep)) { fs.copyFileSync(keep, index); fs.rmSync(keep); }
    console.log(r.status === 0 ? 'Done: changed and deleted files are back as they were. Files the task CREATED are still there.' : 'Undo failed: ' + r.stderr);
  } else if (id.startsWith('copy:')) {
    fs.cpSync(id.slice(5), cwd, { recursive: true, force: true });
    console.log('Done: files from the backup copy are back. Files the task CREATED are still there.');
  } else console.log('usage: undo --snapshot ID [--cwd DIR]');
}

function changed(cwd) {
  const g = git(cwd, ['status', '--short']);
  if (g.status !== 0) return null;
  const d = git(cwd, ['diff', '--stat']);
  return (g.stdout.trim() || '(no changes)') + (d.stdout.trim() ? '\n' + d.stdout.trim() : '');
}

async function run() {
  const model = arg('model'); const brief = arg('brief'); const cwd = path.resolve(arg('cwd', process.cwd()));
  const limit = Number(arg('timeout', 900)) * 1000;
  if (!model || !brief || !fs.existsSync(brief)) { console.log('usage: run --model provider/model --brief FILE [--cwd DIR]'); process.exit(1); }
  if (SKIP.has(model.split('/')[0])) { console.log('WORKER_UNAVAILABLE: opencode free models are not used as workers'); process.exit(3); }
  const snap = snapshot(cwd);
  if (!snap) { console.log('NOT STARTED: this folder has no git and is over 300 MB, so no safety copy can be made. Ask the user.'); process.exit(1); }
  const before = changed(cwd);
  const text = fs.readFileSync(brief, 'utf8');
  // --standalone: a private opencode process, so memory plugins in the shared background service don't record the
  // worker's runs (HYPNOS_DISABLE tells the Hypnos memory plugin the same).
  const child = spawn(OPENCODE, ['run', '--standalone', '--agent', 'fusion-worker', '--auto', '-m', model, text],
    { cwd, env: { ...process.env, HYPNOS_DISABLE: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: OPENCODE === 'opencode' && process.platform === 'win32' });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true });
    else child.kill('SIGKILL');
  }, limit);
  const code = await new Promise((r) => child.on('close', r));
  clearTimeout(timer);
  const tail = out.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-6000);
  const at = tail.lastIndexOf('RESULT');
  console.log(`MODEL: ${model}\nEXIT: ${timedOut ? 'timeout after ' + limit / 1000 + ' s' : code}\n`);
  console.log((at >= 0 ? tail.slice(Math.max(0, at - 4)) : tail.slice(-2500)) || '(the worker printed nothing)');
  const now = changed(cwd);
  if (now !== null) {
    console.log('\nFILES CHANGED NOW (git):\n' + now);
    if (before && before !== '(no changes)') console.log('\nALREADY CHANGED BEFORE THIS TASK:\n' + before);
    const deleted = now.split('\n').filter((l) => /^ ?D /.test(l)).map((l) => l.replace(/^ ?D\s+/, ''));
    if (deleted.length) console.log('\nDELETED BY THE WORKER (check this!): ' + deleted.join(', '));
  } else console.log('\n(no git here: compare with the backup copy below to see what changed)');
  console.log(`\nSNAPSHOT: ${snap}\nUNDO this task: node "${SELF}" undo --snapshot ${snap} --cwd "${slash(cwd)}"`);
  if (timedOut || (at < 0 && UNAVAILABLE.test(tail))) {
    console.log(`\nWORKER_UNAVAILABLE: ${timedOut ? 'no answer in time' : (tail.match(UNAVAILABLE) || ['error'])[0]}`);
    process.exit(3);
  }
  process.exit(code === 0 ? 0 : 1);
}

if (process.argv[2] === 'models') models();
else if (process.argv[2] === 'run') await run();
else if (process.argv[2] === 'undo') undo();
else console.log('usage: node fusion.mjs models | run --model provider/model --brief FILE [--cwd DIR] [--timeout SECONDS] | undo --snapshot ID [--cwd DIR]');
