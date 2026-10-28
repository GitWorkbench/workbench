import type { PlaygroundChallengeId } from './types';

export type PlaygroundEvidence = 'status' | 'log' | 'diff' | 'edited' | 'staged' | 'unstaged' | 'branch' | 'stash-saved' | 'reflog' | 'bisect-started' | 'bisect-judged' | 'complete';
export interface PlaygroundLesson {
  id: PlaygroundChallengeId;
  chapter: 'Foundations' | 'Branches & teamwork' | 'Undo & investigate';
  concept: string;
  remember: string;
  files: string[];
  example: string;
  steps: Array<{ id: string; title: string; why: string; task: string; commands: string[]; evidence: PlaygroundEvidence; hint: string }>;
  quiz: { question: string; options: string[]; answer: number; explanation: string };
}

export const playgroundLessons: readonly PlaygroundLesson[] = [
  {
    id: 'git-basics', chapter: 'Foundations', files: ['notes.txt'], example: 'Hello, Git!\nLearning by doing.\n',
    concept: 'Your working tree is the set of files you can edit. Git history contains saved snapshots called commits. You choose when an edit becomes part of that history.',
    remember: 'Saving a file and committing a file are separate actions.',
    steps: [
      { id: 'read-status', title: 'Ask Git what changed', why: 'Status is your starting point whenever you feel unsure.', task: 'Run git status. A clean tree means your files match the latest commit.', commands: ['git status'], evidence: 'status', hint: 'Click a suggested command to put it in the prompt, then press Enter or Run.' },
      { id: 'read-history', title: 'Meet the first snapshot', why: 'The log shows the snapshots Git already remembers.', task: 'Run git log --oneline and find the starting commit.', commands: ['git log --oneline'], evidence: 'log', hint: 'Each line starts with a short commit identifier, followed by its message.' },
      { id: 'edit', title: 'Make a small change', why: 'Editing affects the working tree immediately, while history stays unchanged.', task: 'Add a line to notes.txt in the editor and choose Save file.', commands: [], evidence: 'edited', hint: 'Use Insert example for an editable starting point. You still choose when to save it.' },
      { id: 'read-diff', title: 'See the exact difference', why: 'A diff explains the change behind the status label.', task: 'Run git diff after saving. Lines beginning with + were added.', commands: ['git diff'], evidence: 'diff', hint: 'The Working files card should list notes.txt. The History card still has the original commit.' }
    ],
    quiz: { question: 'What did Save file change?', options: ['The working tree', 'The last commit', 'A remote repository'], answer: 0, explanation: 'Saving edits the working file. A commit is a separate snapshot you create later.' }
  },
  {
    id: 'first-commit', chapter: 'Foundations', files: ['mission.txt', 'scratch.txt'], example: 'Welcome to Git Playground.\nI can build a focused commit.\n',
    concept: 'The staging area is a packing list for your next commit. It lets you choose a useful change while leaving unrelated work for later.',
    remember: 'Review the staged diff before committing.',
    steps: [
      { id: 'read-status', title: 'Notice two kinds of work', why: 'Modified and untracked files can both be part of a commit, but only if you stage them.', task: 'Run status and diff. mission.txt is ready; scratch.txt should stay out.', commands: ['git status', 'git diff'], evidence: 'status', hint: 'An untracked file is a file Git has not saved in history yet.' },
      { id: 'stage', title: 'Pack only the mission', why: 'Staging one file keeps your commit focused.', task: 'Stage mission.txt, then inspect the staged patch.', commands: ['git add mission.txt', 'git diff --staged'], evidence: 'staged', hint: 'Watch mission.txt move into the Staging area card. Leave scratch.txt in Working files.' },
      { id: 'finish', title: 'Create your snapshot', why: 'A commit saves the staged content and a message explaining it.', task: 'Commit the staged change with a short message.', commands: ['git commit -m "Complete my first mission"'], evidence: 'complete', hint: 'The Staging area empties after a successful commit. The new snapshot appears in History.' }
    ],
    quiz: { question: 'Which content does a commit save?', options: ['Every file on disk', 'The staged content', 'Only untracked files'], answer: 1, explanation: 'Git commits the index, also called the staging area. Other working edits remain on disk.' }
  },
  {
    id: 'unstage', chapter: 'Foundations', files: ['draft.txt'], example: 'Draft in progress.\nKeep this edit without staging it.\n',
    concept: 'You can change your mind about the next commit without throwing away the edit. The staging area and working file can hold different versions.',
    remember: 'git restore --staged removes a change from the staging plan and keeps the working file.',
    steps: [
      { id: 'inspect', title: 'Inspect the packed change', why: 'This lesson begins with draft.txt already staged.', task: 'Read the staged diff before changing the staging plan.', commands: ['git diff --staged'], evidence: 'diff', hint: '--staged compares the index to the latest commit.' },
      { id: 'finish', title: 'Keep the edit, unstage the file', why: 'Unstaging does not mean discarding.', task: 'Unstage draft.txt and inspect status. Its contents should stay intact.', commands: ['git restore --staged draft.txt', 'git status'], evidence: 'complete', hint: 'The file moves from Staging area to Working files. Its text in the editor stays the same.' }
    ],
    quiz: { question: 'After unstaging, where is the edit?', options: ['Deleted', 'In a new commit', 'Still in the working file'], answer: 2, explanation: 'Unstaging changes the index. Your working file keeps its edit.' }
  },
  {
    id: 'branches', chapter: 'Branches & teamwork', files: ['greeting.txt'], example: 'Hello from my branch!\n',
    concept: 'A branch is a name pointing to a commit. New commits move the branch you are on, while other branches keep their positions.',
    remember: 'Switch to the intended branch before you commit.',
    steps: [
      { id: 'branch', title: 'Give your idea a name', why: 'A separate branch lets main keep its starting snapshot.', task: 'Create and switch to feature/greeting.', commands: ['git switch -c feature/greeting'], evidence: 'branch', hint: '-c creates a new branch. The Current branch label changes when switching succeeds.' },
      { id: 'edit', title: 'Write the greeting', why: 'Your file belongs to the working tree until it is committed.', task: 'Write Hello from my branch! in greeting.txt and save it.', commands: [], evidence: 'edited', hint: 'Use Insert example, then Save file. A newly created file is untracked.' },
      { id: 'finish', title: 'Move your branch forward', why: 'This commit should advance feature/greeting while main stays behind.', task: 'Stage and commit the greeting, then inspect all branches in the log.', commands: ['git add greeting.txt', 'git commit -m "Add a friendly greeting"', 'git log --oneline --all'], evidence: 'complete', hint: 'The lesson checks the greeting, your current branch, and the unchanged main tip.' }
    ],
    quiz: { question: 'Which branch moves when you commit?', options: ['Every branch', 'The checked-out branch', 'Only main'], answer: 1, explanation: 'A new commit advances the branch currently checked out.' }
  },
  {
    id: 'merge-branches', chapter: 'Branches & teamwork', files: ['main.txt', 'feature.txt'], example: 'A stable foundation.\n',
    concept: 'A merge combines histories. These two branches changed different files, so Git can put their work together automatically.',
    remember: 'Merge into the branch you want to receive the changes.',
    steps: [
      { id: 'inspect', title: 'See the two paths', why: 'Each branch has a useful commit the other does not have.', task: 'Inspect the log with all branches.', commands: ['git log --oneline --all'], evidence: 'log', hint: 'You are on main. feature is the branch you will bring into main.' },
      { id: 'finish', title: 'Combine the histories', why: 'A merge commit can keep both original tips as its parents.', task: 'Merge feature into main. Both files should be present afterwards.', commands: ['git merge feature', 'git log --oneline --all'], evidence: 'complete', hint: 'The lesson already prepared the two branches; you only need to merge.' }
    ],
    quiz: { question: 'What did merging feature into main change?', options: ['It moved main forward with both histories', 'It deleted feature', 'It erased the old commits'], answer: 0, explanation: 'The merge advances main and preserves the existing commits. It does not delete feature.' }
  },
  {
    id: 'cherry-pick', chapter: 'Branches & teamwork', files: ['note.txt', 'main.txt'], example: 'One commit, borrowed.\n',
    concept: 'Cherry-pick copies one commit’s change onto your current branch. It is useful when you need a particular fix without merging all of another branch.',
    remember: 'A copied change can have a new commit identity because it has a different parent.',
    steps: [
      { id: 'inspect', title: 'Find the useful change', why: 'The feature/note tip contains the note you want.', task: 'Inspect both branches in the log.', commands: ['git log --oneline --all'], evidence: 'log', hint: 'main has its own work. You will keep it while borrowing the note change.' },
      { id: 'finish', title: 'Borrow the patch', why: 'The source branch remains unchanged.', task: 'Cherry-pick feature/note onto main.', commands: ['git cherry-pick feature/note'], evidence: 'complete', hint: 'The branch name resolves to the commit at its tip.' }
    ],
    quiz: { question: 'What does cherry-pick copy?', options: ['Every source branch', 'The chosen commit’s change', 'Your local configuration'], answer: 1, explanation: 'Cherry-pick reapplies the selected commit’s patch on your current history.' }
  },
  {
    id: 'merge-conflict', chapter: 'Branches & teamwork', files: ['settings.json'], example: '{"theme":"dark","notifications":true}\n',
    concept: 'A conflict is a question Git cannot answer on its own. Two branches changed the same area, so you decide what the combined result means.',
    remember: 'Resolve the meaning of the change, then stage the file and finish the merge.',
    steps: [
      { id: 'inspect', title: 'Read the disagreement', why: 'The prepared merge is paused. Conflict markers separate the two versions.', task: 'Inspect status and settings.json. Keep the dark theme and enabled notifications.', commands: ['git status'], evidence: 'status', hint: '<<<<<<< and >>>>>>> are conflict markers, not part of the final JSON.' },
      { id: 'resolve', title: 'Build a combined result', why: 'Choosing an entire side would lose one improvement.', task: 'Replace the markers with the combined JSON, save, then stage settings.json.', commands: ['git add settings.json'], evidence: 'staged', hint: 'Insert example can help. The final values are theme dark and notifications true.' },
      { id: 'finish', title: 'Finish the paused merge', why: 'Staging tells Git the file is resolved. Committing finishes the merge.', task: 'Commit the reviewed result.', commands: ['git commit -m "Combine theme and notification changes"'], evidence: 'complete', hint: 'You can also open the full workspace to use the three-pane conflict editor.' }
    ],
    quiz: { question: 'Why did Git stop?', options: ['It lost the branches', 'It needs you to choose the combined result', 'A conflict always means data is corrupted'], answer: 1, explanation: 'Git preserved both sides and asked you to decide how their changes fit together.' }
  },
  {
    id: 'stash-changes', chapter: 'Undo & investigate', files: ['draft.txt'], example: 'A saved starting point.\nAn unfinished idea.\n',
    concept: 'A stash temporarily holds pending edits so you can return to a clean working tree without creating a normal branch commit.',
    remember: 'Stash pop reapplies the work and removes the entry when it succeeds.',
    steps: [
      { id: 'inspect', title: 'Look at the unfinished idea', why: 'Knowing what you are putting aside helps you recognize it when it returns.', task: 'Inspect the current diff.', commands: ['git diff'], evidence: 'diff', hint: 'The extra line is an uncommitted idea.' },
      { id: 'stash-saved', title: 'Make room for another task', why: 'The working tree becomes clean while the stash holds your edit.', task: 'Stash the edit, then inspect the clean state.', commands: ['git stash push -m "My unfinished idea"', 'git stash list'], evidence: 'stash-saved', hint: 'The editor returns to the committed text. The lesson records that your work reached the stash.' },
      { id: 'finish', title: 'Bring the idea back', why: 'You can continue exactly where you left off.', task: 'Pop the stash and verify that the unfinished line is back.', commands: ['git stash pop'], evidence: 'complete', hint: 'After a successful pop, the stash list is empty and draft.txt is modified again.' }
    ],
    quiz: { question: 'When is a stash useful?', options: ['When pausing unfinished edits', 'Only after publishing a release', 'When deleting a remote repository'], answer: 0, explanation: 'A stash lets you set pending edits aside while you work on something else.' }
  },
  {
    id: 'lost-commit', chapter: 'Undo & investigate', files: ['treasure.txt'], example: 'You found it. Keep this commit on a branch!\n',
    concept: 'A reset can move a branch away from a commit without immediately deleting that commit. The reflog records previous local positions so you can find it.',
    remember: 'Create a branch at a recovered commit to keep it reachable.',
    steps: [
      { id: 'inspect', title: 'Follow the local breadcrumb trail', why: 'The normal log follows current branches. The reflog remembers their recent movements.', task: 'Run git reflog and find Add the lost treasure before the reset.', commands: ['git reflog'], evidence: 'reflog', hint: 'In this fresh attempt, HEAD@{1} identifies the treasure commit.' },
      { id: 'finish', title: 'Keep the treasure reachable', why: 'A recovery branch gives the hidden commit a lasting reference.', task: 'Create a recovery branch at HEAD@{1}.', commands: ['git branch recovered-treasure HEAD@{1}', 'git log --oneline --all'], evidence: 'complete', hint: 'Creating the branch is enough. You do not need to reset main again.' }
    ],
    quiz: { question: 'What keeps the recovered commit reachable?', options: ['Closing the terminal', 'A branch pointing to it', 'Renaming a working file'], answer: 1, explanation: 'A local branch is a reference that keeps the commit in reachable history.' }
  },
  {
    id: 'bisect', chapter: 'Undo & investigate', files: ['answer.txt'], example: '42\n',
    concept: 'Bisect narrows down a regression by checking a commit between a known good and bad revision. You judge the result; Git chooses the next candidate.',
    remember: 'Judge the currently checked-out revision, not the newest commit on main.',
    steps: [
      { id: 'start', title: 'Give Git the boundaries', why: 'The tagged endpoints tell Git where the regression happened.', task: 'Start bisect between playground-bad and playground-good.', commands: ['git bisect start playground-bad playground-good'], evidence: 'bisect-started', hint: 'Bisect temporarily detaches HEAD. This is expected while it checks older revisions.' },
      { id: 'judge', title: 'Test the current answer', why: 'The editor reloads answer.txt after each command. 42 is good; 41 is bad.', task: 'Read answer.txt and mark that revision good or bad. Repeat until Git finds the culprit.', commands: ['git bisect good', 'git bisect bad'], evidence: 'bisect-judged', hint: 'Do not edit the answer to fix it during bisect. You are identifying which historical revision introduced it.' },
      { id: 'finish', title: 'Identify the first bad commit', why: 'Git verifies the boundary between the last good state and the first bad one.', task: 'Continue judging until the lesson verifies the culprit. You can reset bisect after completing the lesson.', commands: ['git bisect good', 'git bisect bad'], evidence: 'complete', hint: 'Use the current file value each time. There are only a few candidates to judge.' }
    ],
    quiz: { question: 'What does marking a revision Bad mean?', options: ['The bug exists at this revision', 'The commit message is badly written', 'Delete the revision'], answer: 0, explanation: 'Bad means your test found the regression in the checked-out revision.' }
  }
];
