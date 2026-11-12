# fusion-mode

**Your model plans. Other models and coding agents do the work.** `/fusion` for Claude Code, Codex and opencode.

Type `/fusion` and the model you are already chatting with becomes the **boss**: it splits the job into small parts,
writes a clear brief for each one, hands them to **workers**, checks every result, and merges it. The expensive model
only plans and reviews, so you save its limit and still get checked, working code.

## Workers

| Kind | What it is | Spends |
|---|---|---|
| **Harness** | another coding CLI in one-shot mode: Codex (`codex exec`), Claude Code (`claude -p`), opencode, Antigravity (`agy`), Hermes, Qwen Code, Kimi, Mistral Vibe, Grok Build, Aider, Pi, Goose, Crush, Cline, Kilo, Droid, Cursor CLI, Copilot CLI and more — 26 adapters, see [docs/harnesses.md](docs/harnesses.md) | that tool's own plan or free tier |
| **API** | a provider model (OpenRouter, NVIDIA, Groq, Gemini, Mistral, DeepSeek…) run through opencode's restricted worker agent, or called directly if opencode is missing | free tiers / your keys |
| **Native** | the boss's own harness's other models (e.g. Claude Code subagents on Haiku / Sonnet / Opus) | the same plan as the boss |

## Modes

- **Manual** — you tick one worker or any mix; the boss splits the job across exactly those.
- **Suggest** — the boss proposes a worker for each part (shown as short points in tick boxes); you approve or swap.
- **Auto** — no questions: the boss picks per part, preferring free workers, then other plans, then paid, and its own
  plan last, skipping anything rate-limited or failing.

The first `/fusion` asks which mode; your choice (and your Manual picks) is remembered and can be changed any time.
No chat summaries — decisions are tick boxes, the final report is a few short lines.

## Setup (first run)

1. **Scan** the machine for installed harnesses and configured API providers.
2. **API keys** — tick which providers you have keys for; they are saved to `~/.fusion/keys.env` and never printed.
3. **Health check** every worker it found (no model calls) → `~/.fusion/workers.json`.
4. **Offer installs** for missing harnesses — only the ones you tick.

## Safety

- **Snapshot before every task** (git: a hidden commit, your staging and history untouched; no git: a backup copy).
  Every report prints an `UNDO` command.
- **Parallel workers never touch your project.** With `--worktree` each worker gets its own private copy (a separate
  clone, so no agent can follow it back to your repo) and returns a patch; the boss merges patches one by one.
- **Checked, not trusted.** Every brief ends with `Done when: <check>`; the boss re-runs it before accepting.
- **Deleted files are flagged** and restored if the task didn't ask for it.
- **opencode's own Zen free models are never used as workers** (scripted use of that tier is treated as abuse).
  Freebuff and DeepSeek Harness are listed but not used (no one-shot mode yet).

## Install

Needs [Node.js](https://nodejs.org) 18+. [opencode](https://opencode.ai) is recommended for API-model workers.

```sh
git clone https://github.com/luzazzm-stack/fusion-mode.git
cd fusion-mode
sh install.sh          # macOS / Linux / Git Bash
.\install.ps1          # Windows PowerShell
```

| File | Goes to |
|---|---|
| `fusion.mjs` (the helper) | `~/.fusion/fusion.mjs` |
| `claude-code/skills/fusion/SKILL.md` | `~/.claude/skills/fusion/` (if Claude Code is installed) |
| `codex/skills/fusion/SKILL.md` | `~/.codex/skills/fusion/` (if Codex is installed) |
| `opencode/command/fusion.md` | `~/.config/opencode/command/` |
| `opencode/agents/fusion-worker.md` | `~/.config/opencode/agents/` |

Restart your agent, then type `/fusion`. Uninstall: `sh install.sh --uninstall` or `.\install.ps1 -Uninstall`.

## The helper by hand

```sh
node ~/.fusion/fusion.mjs scan                     # installed harnesses, API providers, key names
node ~/.fusion/fusion.mjs catalog                  # every known harness + install command
echo "$KEY" | node ~/.fusion/fusion.mjs key set OPENROUTER_API_KEY
node ~/.fusion/fusion.mjs health                   # build the worker registry
node ~/.fusion/fusion.mjs run --worker harness:codex --brief task.md --cwd ./myproject --worktree
node ~/.fusion/fusion.mjs run --worker api:nvidia-free/nvidia/nemotron-3-ultra-550b-a55b --brief task.md --cwd ./myproject
node ~/.fusion/fusion.mjs merge --patch ~/.fusion/patches/<file>.patch --cwd ./myproject
node ~/.fusion/fusion.mjs undo --snapshot git:<id> --cwd ./myproject
```

`run` exits 0 when the worker finished, 3 when it is unavailable (limit, login, missing), 1 on errors.
Settings: `FUSION_SKIP=providerA,providerB`, `FUSION_OPENCODE=/path/to/opencode`.

## Tested

Parallel run on a git repo: a Codex worker fixed a bug, a free NVIDIA Nemotron worker (via opencode) wrote a test, a
Claude Code worker on Haiku added a docstring — each in its own copy; patches merged, checks passed, undo restored.
Harnesses not installed on the test machine (Antigravity, Hermes, Qwen, …) use flags taken from their official docs
and are not yet tested end to end.

## Credit

The boss-and-workers idea comes from [Atomic Agent](https://github.com/AtomicBot-ai/atomic-agent)'s Fusion mode.
This is an independent, much smaller implementation; no code was copied.

## License

[MIT](LICENSE) © 2026 Luza Maharjan ([luzazzm-stack](https://github.com/luzazzm-stack)). Use it, change it, share it.
