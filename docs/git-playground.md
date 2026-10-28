# Git Playground

Open **Home → Quick access → Git Playground**, or search for it in the command palette. It works offline in the desktop app with system Git installed.

Choose **Start guided lesson** to learn inside a practice desk. A coach explains each task and why it matters. Suggested commands fill the prompt; you choose when to run them. Edit and save practice files, then watch the working files, staging area, and history update from real Git state. Use the hints when stuck and review earlier steps at any time. Each completed lesson ends with an explained understanding check and a link to the next lesson.

The learning path has three chapters. Lessons can also be opened individually.

| Challenge | Completion condition |
| --- | --- |
| Meet your repository | Inspect status and history, edit notes.txt, and inspect its diff. |
| One focused commit | Commit the supplied mission.txt change, change only that file in history, and keep scratch.txt untracked and intact. |
| Unstage without losing work | Remove draft.txt from the index while preserving its working copy and the original commit. |
| Your first branch | Create feature/greeting, commit the greeting there, and keep main unchanged. |
| Bring two branches together | Merge feature into main, retaining both parents and both branches’ files. |
| Borrow one useful commit | Cherry-pick feature/note onto main, preserving main’s work and the source branch. |
| The best of both branches | Commit the prepared merge with both original parents and combine the dark theme with enabled notifications. |
| Park an unfinished idea | Stash the prepared edit, observe a clean checkout, then pop it without losing the edit. |
| Rescue the lost treasure | Create a local branch that makes the lost commit reachable again. Checking out that branch is optional. |
| Find the sneaky regression | Use bisect to identify the actual first bad commit. Use playground-good/playground-bad as boundaries; Check progress reads answer.txt at the current revision. Verify completion before resetting bisect. |

The guided prompt accepts a small Git grammar for status, log, diff, add, restore --staged, commit -m, switch, branch, merge, cherry-pick, reflog, stash, and manual bisect. It passes arguments directly to Git; it is not a shell. Shell programs, configuration changes, hooks, scripts, network operations, and paths outside the lesson’s files are unavailable. Commands are serialized per attempt and output is bounded. Up/down arrows recall the last 50 commands; the desk retains the latest 20 outputs while open.

Editor changes remain drafts until **Save file**. Git commands and navigation wait until the draft is saved or reverted. Saves reject changed disk content and replaced files rather than overwriting an external edit. The editor supports plain text up to 20 KB; bisect’s answer file is read-only in the desk so edits cannot change the test result. **Refresh practice state** reloads changes made in another app.

**Open full workspace** opens the practice repository in a normal tab with a compact challenge tracker. Use the graph, staging, merge editor, reflog, terminal, and bisect tools, then **Check progress** for verification. **Start challenge / Start fresh attempt** opens this mode directly. Reading-command milestones in the introductory lesson are recorded through the guided prompt.

Attempts, verified lesson milestones, and completion markers live under `playground/` in the stable application data directory described in [branding.md](branding.md). Every attempt has its own repository named after the challenge, immutable metadata, a progress file, and a completion marker earned by verification. They contain fictional data, a local commit identity, disabled hooks/signing, and no remote. No scripts or dependencies are executed by setup or verification.

**Restart guided lesson** and **Start fresh attempt** create different folders. They never reset or delete an existing repository. **Resume guided lesson** and **Resume attempt** return to the latest attempt for a challenge. Verified milestones survive app restarts. Completed challenges stay completed while you continue experimenting. Old practice folders can be removed manually after closing their tabs; missing or damaged attempts are reported while other attempts remain accessible. No account, provider connection, AI key, or network access is required.

Browser preview shows the learning path, but starting, editing, running commands, or verifying a repository requires Electron. The implementation lives in `src/main/playground.ts` (repositories and verification), `src/main/playground-lab.ts` (prompt, editor, serialized snapshots), and `src/shared/playground-learning.ts` (curriculum). Integration tests build and solve every scenario in temporary directories; renderer tests cover coaching, quizzes, command history, drafts, progress, stale results, keyboard focus, errors, and fresh attempts.
