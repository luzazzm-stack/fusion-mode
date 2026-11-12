// Fusion v2: the model you are chatting with is the BOSS (plans, splits, checks). WORKERS do the work:
//   native  = the host harness's own other models (the boss starts these itself; the helper only lists them)
//   harness = another coding CLI in one-shot mode (codex exec, claude -p, opencode run, agy -p, hermes chat -q ...)
//   api     = a provider model (OpenRouter, NVIDIA, Groq ...) run through opencode's restricted "fusion-worker" agent,
//             or, if opencode is missing, called directly (returns text; the boss applies it)
// MIT License. Runs only when called; nothing in the background, nothing scheduled.
//
//   node fusion.mjs scan                       harnesses on this machine + API providers + key names (JSON)
//   node fusion.mjs catalog                    every known harness with its install command (JSON)
//   node fusion.mjs key list | key set NAME    keys in ~/.fusion/keys.env (value read from stdin, never printed)
//   node fusion.mjs health                     check each found worker (no model calls, no tokens) -> workers.json
//   node fusion.mjs workers                    print the registry (workers.json)
//   node fusion.mjs models                     API models per provider (from opencode config)
//   node fusion.mjs state get | state set [--mode manual|suggest|auto] [--workers id,id]
//   node fusion.mjs run --worker ID --brief FILE [--cwd DIR] [--worktree] [--timeout SEC]
//       ID = harness:<name>[:<model>]  e.g. harness:codex:gpt-6-luna, harness:agy, harness:hermes:openrouter/x
//            api:<provider>/<model>     e.g. api:nvidia-free/qwen/qwen3.8-coder
//       --worktree: the worker works in its own git worktree (safe to run several at once); prints a PATCH file
//       Exit 0 = finished, 3 = worker unavailable (limit, busy, login, missing), 1 = error.
//   node fusion.mjs merge --patch FILE [--cwd DIR]     apply a worker's patch to the project
//   node fusion.mjs undo --snapshot ID [--cwd DIR]     put back every file changed or deleted since the snapshot
// Never used as workers: opencode's own Zen free models (scripted use = abuse block), Freebuff and DeepSeek Harness
// (no one-shot mode yet). More providers to hide: FUSION_SKIP=a,b. Another opencode binary: FUSION_OPENCODE=path.
process.noDeprecation = true;
import { spawn, spawnSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url';

const HOME = os.homedir();
const DIR = path.join(HOME, '.fusion');
const SELF = fileURLToPath(import.meta.url).split(path.sep).join('/');
const WIN = process.platform === 'win32';
const OPENCODE = [process.env.FUSION_OPENCODE, path.join(HOME, '.opencode/bin/opencode.exe'), path.join(HOME, '.opencode/bin/opencode')]
  .find((p) => p && fs.existsSync(p)) || which('opencode');
const OC_CONFIG = path.join(HOME, '.config/opencode/opencode.json');
const KEYS = path.join(DIR, 'keys.env'); const REG = path.join(DIR, 'workers.json'); const STATE = path.join(DIR, 'state.json');
const SKIP = new Set(['opencode', 'opencode-free', ...(process.env.FUSION_SKIP || '').split(',').map((x) => x.trim()).filter(Boolean)]);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const slash = (p) => p.split(path.sep).join('/');
const out = (o) => console.log(JSON.stringify(o, null, 1));

// ---- harness catalog (one-shot flags checked against each project's docs, 12 Nov 2026) --------------------------
// cmd(text, model) -> argv after the binary. model may be undefined (harness default).
const M = (f, m) => (m ? [f, m] : []);
const HARNESSES = {
  codex:   { name: 'Codex CLI', bins: ['codex'], cmd: (t, m) => ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', ...M('-m', m), t], plan: 'ChatGPT plan', install: 'npm i -g @openai/codex' },
  claude:  { name: 'Claude Code', bins: ['claude'], cmd: (t, m) => ['-p', '--dangerously-skip-permissions', ...M('--model', m), t], plan: 'Claude plan', install: 'curl -fsSL https://claude.ai/install.sh | bash' },
  opencode:{ name: 'OpenCode', bins: ['opencode'], cmd: (t, m) => ['run', '--standalone', '--agent', 'fusion-worker', '--auto', ...M('-m', m), t], plan: 'provider keys', install: 'curl -fsSL https://opencode.ai/install | bash', modelRequired: true },
  agy:     { name: 'Antigravity CLI', bins: ['agy'], cmd: (t, m) => ['-p', '--dangerously-skip-permissions', ...M('--model', m), t], plan: 'Google free / AI Pro', install: 'see antigravity.google/docs/cli' },
  gemini:  { name: 'Gemini CLI', bins: ['gemini'], cmd: (t, m) => ['-p', t, '--approval-mode=yolo', ...M('-m', m)], plan: 'Gemini API key / Code Assist (no free tier)', install: 'npm i -g @google/gemini-cli' },
  qwen:    { name: 'Qwen Code', bins: ['qwen'], cmd: (t, m) => ['-p', t, '--yolo', ...M('-m', m)], plan: 'Qwen account / key', install: 'npm i -g @qwen-code/qwen-code' },
  kimi:    { name: 'Kimi Code CLI', bins: ['kimi'], cmd: (t, m) => ['-p', t, ...M('-m', m)], plan: 'Kimi account / key', install: 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash' },
  vibe:    { name: 'Mistral Vibe', bins: ['vibe'], cmd: (t, m) => ['--prompt', t, '--auto-approve', ...M('--model', m)], plan: 'Mistral key', install: 'curl -LsSf https://mistral.ai/vibe/install.sh | bash' },
  grok:    { name: 'Grok Build', bins: ['grok'], cmd: (t, m) => ['-p', t, '--always-approve', ...M('-m', m)], plan: 'Grok account', install: 'curl -fsSL https://x.ai/cli/install.sh | bash' },
  pool:    { name: 'Poolside Agent CLI', bins: ['pool'], cmd: (t) => ['exec', '-p', t, '--unsafe-auto-allow'], plan: 'Poolside account', install: 'curl -fsSL https://downloads.poolside.ai/pool/install.sh | sh' },
  muse:    { name: 'Muse Code', bins: ['muse'], cmd: (t, m) => ['exec', '--yolo', ...M('--model', m), t], plan: 'Meta account', install: 'curl -fsSL https://dev.meta.ai/install.sh | bash' },
  hermes:  { name: 'Hermes Agent', bins: ['hermes'], cmd: (t, m) => { const [p, ...r] = (m || '').split('/'); return ['chat', '-q', t, '--yolo', '--quiet', ...(m ? ['--provider', p, '--model', r.join('/')] : [])]; }, plan: 'provider keys / Nous Portal', install: 'iex (irm https://hermes-agent.nousresearch.com/install.ps1)  |  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash' },
  aider:   { name: 'Aider', bins: ['aider'], cmd: (t, m) => ['--message', t, '--yes-always', '--no-pretty', ...M('--model', m)], plan: 'provider keys', install: 'curl -LsSf https://aider.chat/install.sh | sh' },
  pi:      { name: 'Pi', bins: ['pi'], cmd: (t, m) => ['--print', t, ...M('--model', m)], plan: 'provider keys', install: 'curl -fsSL https://pi.dev/install.sh | sh' },
  goose:   { name: 'Goose', bins: ['goose'], env: { GOOSE_MODE: 'auto' }, cmd: (t, m) => { const [p, ...r] = (m || '').split('/'); return ['run', '-t', t, '-q', ...(m ? ['--provider', p, '--model', r.join('/')] : [])]; }, plan: 'provider keys', install: 'see github.com/aaif-goose/goose' },
  cline:   { name: 'Cline CLI', bins: ['cline'], cmd: (t, m) => [t, '--yolo', ...M('-m', m)], plan: 'provider keys', install: 'npm i -g cline' },
  kilo:    { name: 'Kilo CLI', bins: ['kilo'], cmd: (t, m) => ['run', '--auto', ...M('-m', m), t], plan: 'provider keys', install: 'npm i -g @kilocode/cli' },
  crush:   { name: 'Crush', bins: ['crush'], cmd: (t, m) => ['run', '-y', '-q', ...M('-m', m), t], plan: 'provider keys', install: 'npm i -g @charmland/crush' },
  forge:   { name: 'ForgeCode', bins: ['forge'], cmd: (t) => ['-p', t], plan: 'provider keys', install: 'curl -fsSL https://forgecode.dev/cli | sh' },
  zero:    { name: 'Zero', bins: ['zero'], cmd: (t, m) => ['exec', '--auto', 'high', ...M('--model', m), t], plan: 'provider keys', install: 'npm i -g @gitlawb/zero' },
  mini:    { name: 'mini-SWE-agent', bins: ['mini'], cmd: (t, m) => ['-t', t, '-y', ...M('-m', m)], plan: 'provider keys', install: 'uv tool install mini-swe-agent' },
  letta:   { name: 'Letta Code', bins: ['letta'], cmd: (t, m) => ['-p', t, '--yolo', ...M('-m', m)], plan: 'Letta account / keys', install: 'npm i -g @letta-ai/letta-code' },
  copilot: { name: 'GitHub Copilot CLI', bins: ['copilot'], cmd: (t, m) => ['-p', t, '--allow-all-tools', ...(m ? ['--model=' + m] : [])], plan: 'Copilot plan', install: 'npm i -g @github/copilot' },
  cursor:  { name: 'Cursor CLI', bins: ['cursor-agent', 'agent'], cmd: (t, m) => ['-p', t, '--force', '--trust', ...M('--model', m)], plan: 'Cursor plan', install: 'curl https://cursor.com/install -fsS | bash' },
  droid:   { name: 'Droid (Factory)', bins: ['droid'], cmd: (t, m) => ['exec', '--skip-permissions-unsafe', ...M('-m', m), t], plan: 'Factory plan', install: 'curl -fsSL https://app.factory.ai/cli | sh' },
  amp:     { name: 'Amp', bins: ['amp'], cmd: (t) => ['-x', t], plan: 'Amp account', install: 'npm i -g @ampcode/cli' },
};
const NOT_WORKERS = { freebuff: 'Freebuff (interactive only)', dsh: 'DeepSeek Harness (no headless mode yet)' };

// OpenAI-compatible endpoints for direct API calls (only used when opencode is not installed)
const API_BASE = { openrouter: 'https://openrouter.ai/api/v1', nvidia: 'https://integrate.api.nvidia.com/v1', groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai', mistral: 'https://api.mistral.ai/v1', deepseek: 'https://api.deepseek.com/v1',
  moonshot: 'https://api.moonshot.ai/v1', together: 'https://api.together.xyz/v1', cerebras: 'https://api.cerebras.ai/v1', openai: 'https://api.openai.com/v1' };

function which(bin) {
  const r = spawnSync(WIN ? 'where' : 'which', [bin], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  const all = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return (WIN && all.find((p) => /\.(exe|cmd|bat)$/i.test(p))) || all[0] || null;
}
function readKeys() {
  if (!fs.existsSync(KEYS)) return {};
  return Object.fromEntries(fs.readFileSync(KEYS, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
function ocProviders() {
  try { return JSON.parse(fs.readFileSync(OC_CONFIG, 'utf8')).provider || {}; } catch { return {}; }
}
const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

// ---- setup -----------------------------------------------------------------------------------------------------
function scan() {
  const harnesses = Object.entries(HARNESSES).map(([id, h]) => {
    const p = h.bins.map(which).find(Boolean);
    return { id, name: h.name, installed: !!p, path: p ? slash(p) : null, plan: h.plan };
  });
  const prov = ocProviders();
  const api = Object.entries(prov).filter(([id, p]) => !SKIP.has(id) && p.models).map(([id, p]) => ({ provider: id, models: Object.keys(p.models).length, via: OPENCODE ? 'opencode' : 'direct' }));
  out({ harnesses, notWorkers: NOT_WORKERS, apiProviders: api, keys: Object.keys(readKeys()), opencode: !!OPENCODE });
}
function catalog() { out(Object.entries(HARNESSES).map(([id, h]) => ({ id, name: h.name, plan: h.plan, install: h.install }))); }
function key() {
  const sub = process.argv[3];
  if (sub === 'list') return out(Object.fromEntries(Object.entries(readKeys()).map(([k, v]) => [k, v ? v.slice(0, 4) + '…' + v.slice(-2) : '(empty)'])));
  if (sub === 'set' && /^[A-Z0-9_]+$/.test(process.argv[4] || '')) {
    const v = fs.readFileSync(0, 'utf8').trim();
    if (!v) { console.log('no value on stdin'); process.exit(1); }
    const k = readKeys(); k[process.argv[4]] = v;
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(KEYS, Object.entries(k).map(([a, b]) => `${a}=${b}`).join('\n') + '\n', { mode: 0o600 });
    return console.log(`saved ${process.argv[4]} to ${slash(KEYS)} (value not shown)`);
  }
  console.log('usage: key list | key set NAME   (value on stdin; NAME like OPENROUTER_API_KEY)');
}
async function health() {
  const reg = { checked: new Date().toISOString(), workers: [] };
  for (const [id, h] of Object.entries(HARNESSES)) {
    const p = h.bins.map(which).find(Boolean);
    if (!p) continue;
    const r = spawnSync(p, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 20000, shell: WIN && /\.(cmd|bat)$/i.test(p) });
    const ok = r.status === 0;
    reg.workers.push({ id: 'harness:' + id, kind: 'harness', name: h.name, cost: id === 'opencode' ? 'free' : 'other-plan', plan: h.plan,
      ok, note: ok ? (r.stdout || r.stderr).trim().split('\n')[0].slice(0, 80) : 'did not answer --version' });
  }
  const keys = readKeys();
  for (const [id, p] of Object.entries(ocProviders())) {
    if (SKIP.has(id) || !p.models) continue;
    reg.workers.push({ id: 'api:' + id, kind: 'api', name: p.name || id, cost: /free/i.test(id) ? 'free' : 'paid', models: Object.keys(p.models).length, ok: !!OPENCODE, note: OPENCODE ? 'runs through opencode fusion-worker' : 'opencode missing' });
  }
  for (const [k, v] of Object.entries(keys)) {
    const prov = k.replace(/_API_KEY$/, '').toLowerCase(); const base = API_BASE[prov];
    if (!base || reg.workers.some((w) => w.id === 'api:' + prov)) continue;
    let ok = false, note = '';
    try { const r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + v } }); ok = r.ok; note = 'GET /models ' + r.status; } catch (e) { note = String(e.message).slice(0, 60); }
    reg.workers.push({ id: 'api:' + prov, kind: 'api', name: prov, cost: 'paid-or-free-tier', ok, note });
  }
  fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(REG, JSON.stringify(reg, null, 1));
  out(reg);
}
function models() {
  const o = {};
  for (const [id, p] of Object.entries(ocProviders())) if (!SKIP.has(id) && p.models) o[id] = Object.entries(p.models).map(([m, v]) => ({ id: `${id}/${m}`, name: v.name || m }));
  out(o);
}
function state() {
  const s = readJSON(STATE, {});
  if (process.argv[3] === 'set') {
    if (arg('mode')) s.mode = arg('mode');
    if (arg('workers') !== undefined) s.workers = arg('workers').split(',').map((x) => x.trim()).filter(Boolean);
    s.updated = new Date().toISOString(); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
  }
  out(s);
}

// ---- git safety ------------------------------------------------------------------------------------------------
const UNAVAILABLE = /\b429\b|rate.?limit|too many requests|quota|capacity|usage limit|exclusive to subscription|insufficient (credit|balance)|model not found|not logged in|please (log ?in|sign ?in|authenticate)|unauthori[sz]ed|\b401\b|no longer available|\b410\b|\b50[0234]\b|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i;
function git(cwd, args, env = {}) { return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } }); }
const isGit = (cwd) => git(cwd, ['rev-parse', '--is-inside-work-tree']).status === 0;
function snapshot(cwd) {
  if (isGit(cwd)) {
    const idx = path.join(os.tmpdir(), 'fusion-index-' + process.pid + '-' + Date.now());   // separate index: user's staging untouched
    const env = { GIT_INDEX_FILE: idx };
    git(cwd, ['read-tree', 'HEAD'], env); git(cwd, ['add', '-A'], env);
    const tree = git(cwd, ['write-tree'], env).stdout.trim(); fs.rmSync(idx, { force: true });
    const who = { GIT_AUTHOR_NAME: 'fusion', GIT_AUTHOR_EMAIL: 'fusion@local', GIT_COMMITTER_NAME: 'fusion', GIT_COMMITTER_EMAIL: 'fusion@local' };
    const sha = tree && git(cwd, ['commit-tree', tree, '-m', 'fusion snapshot'], who).stdout.trim();
    if (sha) { git(cwd, ['update-ref', 'refs/fusion/' + sha.slice(0, 12), sha]); return 'git:' + sha; }
  }
  let size = 0; const skip = (n) => n === 'node_modules' || n === '.git';
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (skip(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else size += fs.statSync(p).size; if (size > 300e6) throw new Error('too big'); } };
  try { walk(cwd); } catch { return null; }
  const dest = path.join(DIR, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.cpSync(cwd, dest, { recursive: true, filter: (p) => !p.split(path.sep).some(skip) });
  return 'copy:' + slash(dest);
}
function undo() {
  const cwd = path.resolve(arg('cwd', process.cwd())); const id = arg('snapshot', '');
  if (id.startsWith('git:')) {
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
  const g = git(cwd, ['status', '--short']); if (g.status !== 0) return null;
  const d = git(cwd, ['diff', '--stat']);
  return (g.stdout.trim() || '(no changes)') + (d.stdout.trim() ? '\n' + d.stdout.trim() : '');
}

// ---- run -------------------------------------------------------------------------------------------------------
const PREAMBLE = `You are a FUSION WORKER. Do exactly the task below in the current folder, nothing more.
Rules: no git push/commit/reset, no deleting folders, don't open .env/key/credential files, don't change global settings, don't install anything unless the task says so.
When finished, end your answer with a block that starts with the word RESULT on its own line, then: what you changed (files), the check you ran and its output, and anything left undone.

TASK:
`;
function spawnWorker(bin, args, cwd, env, limit) {
  return new Promise((resolve) => {
    const shell = WIN && /\.(cmd|bat)$/i.test(bin);
    // with a .cmd shim, Windows needs the arguments quoted for cmd.exe
    const a = shell ? args.map((x) => /[\s"&|<>^]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x) : args;
    // PWD too: some harnesses (opencode) take their folder from $PWD, not the real working directory (12 Nov test)
    const child = spawn(shell ? '"' + bin + '"' : bin, a, { cwd, env: { ...process.env, HYPNOS_DISABLE: '1', PWD: cwd, INIT_CWD: cwd, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell });
    let buf = ''; child.stdout.on('data', (d) => { buf += d; }); child.stderr.on('data', (d) => { buf += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; if (WIN) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true }); else child.kill('SIGKILL'); }, limit);
    child.on('error', (e) => { buf += '\n' + e.message; });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, timedOut, text: buf.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim() }); });
  });
}
async function apiDirect(provider, model, prompt) {
  const keys = readKeys(); const k = keys[provider.toUpperCase().replace(/-.*/, '') + '_API_KEY']; const base = API_BASE[provider.replace(/-.*/, '')];
  if (!k || !base) return { code: 1, timedOut: false, text: `no key or endpoint for ${provider} (add one with: key set ${provider.toUpperCase()}_API_KEY)` };
  try {
    const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt + '\n\n(You have no file access: answer with complete file contents or a unified diff.)' }] }) });
    const j = await r.json();
    return { code: r.ok ? 0 : 1, timedOut: false, text: r.ok ? j.choices?.[0]?.message?.content || '' : JSON.stringify(j).slice(0, 500) };
  } catch (e) { return { code: 1, timedOut: false, text: e.message }; }
}
async function run() {
  const id = arg('worker'); const brief = arg('brief'); const proj = path.resolve(arg('cwd', process.cwd()));
  const limit = Number(arg('timeout', 1200)) * 1000;
  if (!id || !brief || !fs.existsSync(brief)) { console.log('usage: run --worker ID --brief FILE [--cwd DIR] [--worktree] [--timeout SEC]'); process.exit(1); }
  const [kind, name, ...rest] = id.split(':'); const model = rest.join(':') || undefined;
  if (kind === 'native') { console.log('NATIVE worker: start it yourself with your own subagent tool (this helper only runs harness and api workers).'); process.exit(1); }
  const text = PREAMBLE + fs.readFileSync(brief, 'utf8');
  let bin, args, env = {};
  if (kind === 'harness') {
    const h = HARNESSES[name];
    if (!h) { console.log(`WORKER_UNAVAILABLE: unknown harness "${name}" (${NOT_WORKERS[name] || 'see: catalog'})`); process.exit(3); }
    bin = name === 'opencode' ? OPENCODE : h.bins.map(which).find(Boolean);
    if (!bin) { console.log(`WORKER_UNAVAILABLE: ${h.name} is not installed (install: ${h.install})`); process.exit(3); }
    if (h.modelRequired && !model) { console.log(`usage: harness:${name}:<provider/model>`); process.exit(1); }
    if (name === 'opencode' && SKIP.has((model || '').split('/')[0])) { console.log('WORKER_UNAVAILABLE: opencode free models are not used as workers'); process.exit(3); }
    args = h.cmd(text, model); env = h.env || {};
  } else if (kind === 'api') {
    const m = [name, model].filter(Boolean).join(':'); const prov = m.split('/')[0];
    if (SKIP.has(prov)) { console.log('WORKER_UNAVAILABLE: opencode free models are not used as workers'); process.exit(3); }
    if (OPENCODE) { bin = OPENCODE; args = HARNESSES.opencode.cmd(text, m); }
    else {
      const r = await apiDirect(prov, m.slice(prov.length + 1), text);
      const f = path.join(os.tmpdir(), 'fusion-answer-' + Date.now() + '.md'); fs.writeFileSync(f, r.text);
      console.log(`WORKER: ${id}\nEXIT: ${r.code}\nANSWER FILE (apply it yourself): ${slash(f)}\n\n${r.text.slice(0, 3000)}`);
      if (r.code !== 0 && UNAVAILABLE.test(r.text)) { console.log('\nWORKER_UNAVAILABLE: ' + r.text.match(UNAVAILABLE)[0]); process.exit(3); }
      process.exit(r.code === 0 ? 0 : 1);
    }
  } else { console.log('worker id must start with harness: or api: (native workers are started by the boss)'); process.exit(1); }

  const snap = snapshot(proj);
  if (!snap) { console.log('NOT STARTED: this folder has no git and is over 300 MB, so no safety copy can be made. Ask the user.'); process.exit(1); }
  let cwd = proj, wt = null;
  if (flag('worktree')) {
    if (!snap.startsWith('git:')) { console.log('NOT STARTED: --worktree needs a git project. Run without --worktree (one worker at a time).'); process.exit(1); }
    // A separate clone, not `git worktree`: some harnesses (opencode) follow a worktree back to the main repo and
    // edit the real project (12 Nov test). A clone has its own .git, so the worker can only see the copy.
    wt = path.join(os.tmpdir(), 'fusion-wt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
    const sha = snap.slice(4);
    const r = git(os.tmpdir(), ['clone', '-q', '--no-checkout', '--shared', proj, wt]);
    const f = r.status === 0 && git(wt, ['fetch', '-q', proj, 'refs/fusion/' + sha.slice(0, 12)]);
    const c = f && f.status === 0 && git(wt, ['checkout', '-q', '--detach', sha]);
    if (!c || c.status !== 0) { fs.rmSync(wt, { recursive: true, force: true }); console.log('NOT STARTED: could not make the worker copy: ' + ((c || f || r).stderr || '')); process.exit(1); }
    git(wt, ['remote', 'remove', 'origin']);
    cwd = wt;
  }
  const before = wt ? null : changed(cwd);
  const r = await spawnWorker(bin, args, cwd, env, limit);
  const at = r.text.lastIndexOf('RESULT');
  console.log(`WORKER: ${id}\nEXIT: ${r.timedOut ? 'timeout after ' + limit / 1000 + ' s' : r.code}\n`);
  console.log((at >= 0 ? r.text.slice(Math.max(0, at - 4)).slice(0, 5000) : r.text.slice(-2500)) || '(the worker printed nothing)');
  if (wt) {
    git(wt, ['add', '-A']);
    const JUNK = ['--', '.', ':(exclude,glob)**/__pycache__/**', ':(exclude,glob)**/*.pyc', ':(exclude,glob)**/node_modules/**', ':(exclude,glob)**/.DS_Store'];
    const diff = git(wt, ['diff', '--cached', '--binary', snap.slice(4), ...JUNK]).stdout;
    const stat = git(wt, ['diff', '--cached', '--stat', snap.slice(4), ...JUNK]).stdout.trim();
    fs.rmSync(wt, { recursive: true, force: true, maxRetries: 3 });
    if (diff.trim()) {
      const pf = path.join(DIR, 'patches', `${Date.now()}-${id.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80)}.patch`); fs.mkdirSync(path.dirname(pf), { recursive: true }); fs.writeFileSync(pf, diff);
      console.log(`\nCHANGES (in the worker's own worktree, NOT yet in the project):\n${stat}\nPATCH: ${slash(pf)}\nAPPLY: node "${SELF}" merge --patch "${slash(pf)}" --cwd "${slash(proj)}"`);
    } else console.log('\nCHANGES: none');
  } else {
    const now = changed(cwd);
    if (now !== null) {
      console.log('\nFILES CHANGED NOW (git):\n' + now);
      if (before && before !== '(no changes)') console.log('\nALREADY CHANGED BEFORE THIS TASK:\n' + before);
      const deleted = now.split('\n').filter((l) => /^ ?D /.test(l)).map((l) => l.replace(/^ ?D\s+/, ''));
      if (deleted.length) console.log('\nDELETED BY THE WORKER (check this!): ' + deleted.join(', '));
    } else console.log('\n(no git here: compare with the backup copy below to see what changed)');
  }
  console.log(`\nSNAPSHOT: ${snap}\nUNDO: node "${SELF}" undo --snapshot ${snap} --cwd "${slash(proj)}"`);
  if (r.timedOut || (at < 0 && UNAVAILABLE.test(r.text))) { console.log(`\nWORKER_UNAVAILABLE: ${r.timedOut ? 'no answer in time' : r.text.match(UNAVAILABLE)[0]}`); process.exit(3); }
  process.exit(r.code === 0 ? 0 : 1);
}
function merge() {
  const p = arg('patch'); const cwd = path.resolve(arg('cwd', process.cwd()));
  if (!p || !fs.existsSync(p)) { console.log('usage: merge --patch FILE [--cwd DIR]'); process.exit(1); }
  const snap = snapshot(cwd);
  // plain apply first (leaves the user's git staging alone); --3way only if the plain one doesn't fit
  let r = git(cwd, ['apply', '--whitespace=nowarn', p]);
  if (r.status !== 0) r = git(cwd, ['apply', '--3way', '--whitespace=nowarn', p]);
  console.log(r.status === 0 ? `Applied.\nUNDO: node "${SELF}" undo --snapshot ${snap} --cwd "${slash(cwd)}"` : 'CONFLICT, nothing applied cleanly:\n' + (r.stderr || r.stdout).slice(0, 2000));
  process.exit(r.status === 0 ? 0 : 1);
}

const cmd = process.argv[2];
const CMDS = { scan, catalog, key, health, workers: () => out(readJSON(REG, { workers: [], note: 'run: health' })), models, state, run, merge, undo };
if (CMDS[cmd]) await CMDS[cmd]();
else console.log('usage: node fusion.mjs scan | catalog | key list|set NAME | health | workers | models | state get|set | run --worker ID --brief FILE [--cwd DIR] [--worktree] | merge --patch FILE | undo --snapshot ID');
