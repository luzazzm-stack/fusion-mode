# fusion-mode

**A big model plans. A free model does the work.** `/fusion` for Claude Code and opencode.

Type `/fusion` and the model you are already using becomes the **boss**: it splits the job into small tasks,
writes a clear brief for each one, and checks every result. One **free online model you pick** (OpenRouter, NVIDIA,
Gemini, Groq, Requesty and other OpenAI-compatible providers you have in opencode) is the **worker** that writes the
code. The expensive model only plans and reviews, so a job costs a fraction of doing it all with the big model.

## How it works

1. `/fusion` asks which provider and which model should do the work (tick boxes; you can cancel).
2. The boss reads what it needs and shows you a short task list.
3. Tasks run **one at a time**. The worker is opencode running your chosen model with a restricted agent.
4. The boss checks each result itself (diff, files, tests). Wrong? It goes back once with notes. Still wrong? It is
   undone and you decide.
5. If the worker hits a limit or stops answering, Fusion stops and asks you which model to use next.

Nothing runs in the background and nothing is scheduled: Fusion only works while you are using `/fusion`.
To stop: tick **Cancel Fusion**, press **Esc**, or say "stop fusion".

## Safety

- **Snapshot before every task.** In a git folder the whole working tree is saved as a hidden commit (your staging
  and history are not touched); without git a backup copy is made (folders over 300 MB without git are refused).
  Every report prints an `UNDO` command that puts back everything the task changed or deleted.
- **Deleted files are flagged.** Blocking delete commands is not enough on its own (in testing, a model blocked from
  `rm` tried `del`, then `cmd /c del`), so the report lists every file the worker deleted and the boss restores
  anything that was not asked for.
- **Restricted worker.** The `fusion-worker` agent can read and edit files and run ordinary commands. It cannot push
  to git, delete with the usual commands, use the network (`curl`), open `.env` or key files, or change opencode's
  settings. It never commits.
- **opencode's own Zen models are never used as workers**: opencode treats scripted use of its free tier as abuse.
- Worker runs use a private opencode process, so memory plugins don't record them.

## Install

Needs [Node.js](https://nodejs.org) 18+ and [opencode](https://opencode.ai) (the worker always runs through
opencode, even when the boss is Claude Code) with at least one provider set up in `~/.config/opencode/opencode.json`.

```sh
git clone https://github.com/luzazzm-stack/fusion-mode.git
cd fusion-mode
sh install.sh          # macOS / Linux / Git Bash
.\install.ps1          # Windows PowerShell
```

It copies:

| File | Goes to |
|---|---|
| `fusion.mjs` (the helper) | `~/.fusion/fusion.mjs` |
| `claude-code/skills/fusion/SKILL.md` | `~/.claude/skills/fusion/` (only if Claude Code is installed) |
| `opencode/command/fusion.md` | `~/.config/opencode/command/` |
| `opencode/agents/fusion-worker.md` | `~/.config/opencode/agents/` |

Restart Claude Code / opencode, then type `/fusion`. Uninstall: `sh install.sh --uninstall` or `.\install.ps1 -Uninstall`.

## The helper by hand

```sh
node ~/.fusion/fusion.mjs models                                   # free worker models from your opencode config
node ~/.fusion/fusion.mjs run --model requesty-free/google/gemma-4-31b-it --brief task.txt --cwd ./myproject
node ~/.fusion/fusion.mjs undo --snapshot git:<id> --cwd ./myproject
```

`run` exits 0 when the worker finished, 3 when the model is unavailable (rate limit, busy, removed), 1 on errors.
Settings: `FUSION_SKIP=providerA,providerB` hides providers from the list; `FUSION_OPENCODE=/path/to/opencode` picks
the opencode binary.

## Limits

- One worker model per job, one task at a time (by design: no merge conflicts, low memory use).
- Free models are small; the boss's checking is what keeps quality up. Give it small, clear tasks.
- Free tiers have daily or per-minute limits; Fusion asks you when one runs out instead of switching silently.

## Credit

The boss-and-workers idea comes from [Atomic Agent](https://github.com/AtomicBot-ai/atomic-agent)'s Fusion mode.
This is an independent, much smaller implementation for Claude Code and opencode; no code was copied.

## License

[MIT](LICENSE) © 2026 Luza Maharjan ([luzazzm-stack](https://github.com/luzazzm-stack)). Use it, change it, share it.
