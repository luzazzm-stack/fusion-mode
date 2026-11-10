---
name: fusion
description: Fusion mode - the current model is the boss (plans and checks) and ONE free online model picked by the user is the worker (writes the code). Use only when the user types /fusion or asks for fusion mode.
---

# Fusion mode (boss + one worker)

You are the BOSS. You plan, brief, check, and report. The WORKER is one free online model that does the file changes
through opencode. You do not write the code yourself; that is what saves money.

Helper: `node "$HOME/.fusion/fusion.mjs"` (commands: `models`, `run`, `undo`). Nothing runs in the
background and nothing is scheduled: every step happens only while this /fusion job runs.

## 1. Pick the worker (always ask, every /fusion)

1. Run `node "$HOME/.fusion/fusion.mjs" models`. It prints the free providers and their models
   (opencode's own Zen models are never in it: opencode treats scripted use of its free tier as abuse).
2. Provider pick: TICK BOXES, everything on ONE screen, no paging.
   One AskUserQuestion call with several questions (max 4 per call), each `multiSelect: true` with up to 4 boxes:
   spread EVERY provider the helper printed over the questions (never leave one out) and add a "Cancel Fusion" box
   (description: "Turn Fusion off; nothing is changed") in the last one. Question text: "Tick ONE provider for the
   worker (leave the other tabs empty)". Label = provider name, description = how many models and any limit
   (e.g. "200 messages a day"). If more than one box is ticked, ask again which one.
   If the user ticks "Cancel Fusion", presses Esc, or says cancel/stop/no fusion at ANY point: stop at once, say
   "Fusion is off." and carry on as a normal chat. If a task already ran, offer its UNDO command.
3. Model pick: the same tick-box screen for ALL models of that provider (up to 4 questions x 4 boxes = 16 models
   on one screen; "Tick ONE model"). Label = model name, description = short note such as size or speed if you
   know it; never guess numbers.
4. Repeat the choice back in one line: "Boss: <your model>. Worker: <provider/model>."

## 2. Plan

- If the user did not say what to do, ask for the job in one short question.
- Read only what you need to understand the job. Split it into small tasks, each one change a worker can finish in
  one go (one or two files). Tell the user the task list in 2-5 plain lines before starting.

## 3. Run each task, one at a time

For each task:
1. Write a brief to a new file in a temp or scratch folder (not the project): what to change, which files, the exact check to run (a test, a
   build, a node command) and what result is expected. Plain and complete: the worker sees nothing else.
2. Run (Bash, timeout 900000):
   `node "$HOME/.fusion/fusion.mjs" run --model <provider/model> --brief "<brief file>" --cwd "<project folder>"`
3. Read the report. Exit code 3 = WORKER_UNAVAILABLE (limit, busy, gone): stop and AskUserQuestion which model to use
   instead (same two-step pick). Do not switch on your own.

## 4. Check every task (you, the boss)

- Look at the real result: `git diff` / read the changed files, and run the check yourself if it is quick.
- `DELETED BY THE WORKER` that the task did not ask for: run the printed UNDO command at once, then tell the user.
- Wrong or incomplete: send it back ONCE with a new brief that lists exactly what is wrong. If it is still wrong,
  run the UNDO command for that task and ask the user what to do (another model, or skip).
- Never call a task done because the worker said DONE; only because you saw it.

## 5. Finish

Tell the user in 2-4 plain lines: what was done, what was undone or skipped, and anything they must check.
Do not commit or push unless the user asks. The worker never commits or pushes.

## Limits

- One worker model per /fusion job, one task at a time.
- The worker can't delete folders, push to git, open .env or key files, change settings or use the network; a
  snapshot is taken before every task, so every change can be undone with the printed UNDO command.
- Folder without git and over 300 MB: the helper refuses (no safety copy possible); tell the user.
