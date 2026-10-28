import type { PlaygroundChallengeId } from './types';

export const playgroundChallenges: ReadonlyArray<{
  id: PlaygroundChallengeId; title: string; level: string; minutes: number;
  summary: string; goal: string; steps: string[]; hint: string; tool: string; checks: string[];
}> = [
  {
    id: 'git-basics', title: 'Meet your repository', level: 'Beginner', minutes: 4,
    summary: 'Discover what Git sees, and what it remembers.', goal: 'Inspect status and history, edit notes.txt, then inspect the diff.',
    steps: ['Run git status and git log --oneline in the guided prompt.', 'Add a line to notes.txt in the practice editor and save it.', 'Run git diff to see your change.'],
    hint: 'Saving a file changes your working tree. It does not create a commit. Status lists the file; diff shows the exact lines.',
    tool: 'Show changes', checks: ['Status inspected', 'History inspected', 'notes.txt edited', 'The diff inspected']
  },
  {
    id: 'unstage', title: 'Change your staging plan', level: 'Beginner', minutes: 3,
    summary: 'Take an edit out of the next commit without losing it.', goal: 'Unstage draft.txt while keeping its unfinished edit and the original history.',
    steps: ['Inspect the prepared staged edit with git diff --staged.', 'Run git restore --staged draft.txt.', 'Inspect git status and git diff. The edit should still be in the file.'],
    hint: '--staged changes the index. It leaves your working file alone. Check the editor before and after.',
    tool: 'Show changes', checks: ['draft.txt is unstaged', 'The edit is still in draft.txt', 'The original commit is unchanged']
  },
  {
    id: 'branches', title: 'Give an idea its own branch', level: 'Beginner', minutes: 5,
    summary: 'Work on a new idea while main keeps its starting point.', goal: 'On feature/greeting, commit greeting.txt containing "Hello from my branch!". Keep main unchanged.',
    steps: ['Create and switch to feature/greeting.', 'Write Hello from my branch! in greeting.txt, save, stage, and commit.', 'Inspect the branch labels and history. main should still point to the starting commit.'],
    hint: 'Run git switch -c feature/greeting, then add greeting.txt and commit it. A branch is a movable name for a commit.',
    tool: 'Show changes', checks: ['feature/greeting is checked out', 'The greeting is committed on the branch', 'main keeps its original commit']
  },
  {
    id: 'merge-branches', title: 'Bring two stories together', level: 'Intermediate', minutes: 5,
    summary: 'Combine branches that changed different files.', goal: 'Merge feature into main and keep both main.txt and feature.txt.',
    steps: ['Inspect git log --oneline --all to see both branches.', 'On main, run git merge feature.', 'Inspect the new history and both files.'],
    hint: 'Both branches already have a different commit. This merge can combine them automatically because their file changes do not conflict.',
    tool: 'Show changes', checks: ['main contains both branch tips', 'Both files are preserved in the merge']
  },
  {
    id: 'first-commit', title: 'One focused commit', level: 'Beginner', minutes: 3,
    summary: 'Ship the right change and leave your scratch work behind.',
    goal: 'Commit only the change to mission.txt. Keep scratch.txt untracked.',
    steps: ['Select Uncommitted changes in the graph and inspect mission.txt.', 'Stage mission.txt only, write a message, and commit.', 'Check progress. If you staged too much, unstage before committing, or start a fresh attempt.'],
    hint: 'Use the + beside mission.txt rather than Stage all. A successful attempt changes only mission.txt in the committed tree.',
    tool: 'Show changes', checks: ['The mission.txt change is committed', 'Only mission.txt changed in history', 'scratch.txt stays untracked and intact']
  },
  {
    id: 'stash-changes', title: 'Pause an unfinished idea', level: 'Intermediate', minutes: 4,
    summary: 'Put pending work aside, then bring it back.', goal: 'Stash the draft.txt edit, then pop it back with the file intact and no stash left.',
    steps: ['Inspect the unfinished edit.', 'Run git stash push -m "My unfinished idea" and inspect the clean working tree.', 'Run git stash pop and check the restored edit.'],
    hint: 'A stash holds pending edits outside normal branch history. Pop reapplies it and removes its stash entry when successful.',
    tool: 'Show changes', checks: ['The edit was safely stashed', 'The unfinished edit is restored', 'The stash entry has been removed']
  },
  {
    id: 'cherry-pick', title: 'Borrow one useful commit', level: 'Intermediate', minutes: 5,
    summary: 'Copy a change from another branch without merging its whole story.', goal: 'Cherry-pick feature/note onto main, preserving main.txt and adding note.txt.',
    steps: ['Inspect the commits on feature/note and main.', 'On main, run git cherry-pick feature/note.', 'Inspect the new commit. The source branch should keep its original tip.'],
    hint: 'Cherry-pick reapplies the chosen commit’s patch on your current branch. Its new parent gives the copied commit a different identity.',
    tool: 'Show changes', checks: ['The change is copied onto main', 'The note and main files are preserved', 'The source branch is unchanged']
  },
  {
    id: 'merge-conflict', title: 'The best of both branches', level: 'Intermediate', minutes: 5,
    summary: 'Two branches disagree. Build a result that keeps both improvements.',
    goal: 'Merge incoming into main with theme "dark" and notifications true in settings.json.',
    steps: ['Open the conflict editor for settings.json.', 'Edit the result to combine the dark theme with enabled notifications, then Apply.', 'Continue the merge and check progress.'],
    hint: 'The final file should contain {"theme":"dark","notifications":true}. Choose a side as a starting point, then edit the result before applying.',
    tool: 'Resolve conflict', checks: ['The merge is committed with both parents', 'The result combines both improvements']
  },
  {
    id: 'lost-commit', title: 'Rescue the lost treasure', level: 'Intermediate', minutes: 4,
    summary: 'A reset hid a valuable commit. Bring it back using the reflog.',
    goal: 'Create a local recovery branch that keeps the lost treasure commit reachable.',
    steps: ['Open Reflog & Recovery and locate the commit that added treasure.txt.', 'Select that commit and create a recovery branch.', 'Check progress. Checking out the branch is optional.'],
    hint: 'Look for the commit message "Add the lost treasure" before the reset entry. Creating a branch at that revision preserves it without moving main.',
    tool: 'Open reflog', checks: ['A local branch preserves the lost commit']
  },
  {
    id: 'bisect', title: 'Find the sneaky regression', level: 'Advanced', minutes: 7,
    summary: 'Seven commits, one broken answer. Let Git narrow down the culprit.',
    goal: 'Use bisect to identify the first commit where answer.txt became 41 instead of 42.',
    steps: ['Open Bisect. Use playground-bad as the bad revision and playground-good as the good revision.', 'Close the wizard and Check progress to read answer.txt at the current revision. Reopen Bisect and mark Good for 42 or Bad for 41. Repeat.', 'When Bisect finds the culprit, close the wizard and Check progress before Finish & Reset HEAD.'],
    hint: 'The tracker reads the checked-out file for you. Mark the observed revision yourself; skipping commits can leave the answer ambiguous.',
    tool: 'Open bisect', checks: ['Bisect identified the correct first bad commit']
  }
];
