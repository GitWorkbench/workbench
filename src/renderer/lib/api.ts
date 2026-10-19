import type { Api } from '../../preload/index';
import type { GitWorkbenchApi, AiCommitConfig } from '../../shared/types';
import { generateCommitMessage } from '../../shared/ai';
import { APP_VERSION } from './appVersion';

// In browser preview environments where Electron preload is not injected,
// provide realistic mock data so UI development, testing, and screenshots work seamlessly.
const createMockApi = (): Api & GitWorkbenchApi => {
  const activeRepo = '/var/www/git-gui';
  const recent = ['/var/www/git-gui', '/home/projects/web-platform', '/home/projects/mobile-core'];
  const mockProviderCredentials: Record<'github' | 'gitlab' | 'bitbucket', boolean> = {
    github: false,
    gitlab: false,
    bitbucket: false
  };
  const mockPullRequests: import('../../shared/types').HostedPullRequest[] = [{
    id: '42', title: 'Add hosted pull request context', state: 'open', draft: false,
    author: 'jane-developer', sourceBranch: 'feature/conflict-ui', targetBranch: 'main',
    url: 'https://github.com/GitWorkbench/workbench/pull/42', createdAt: new Date().toISOString()
  }];

  const mockCommits = [
    {
      hash: 'a1b2c3d4e5f67890123456789abcdef012345678',
      shortHash: 'a1b2c3d',
      parents: ['b2c3d4e5f67890123456789abcdef0123456789'],
      message: 'feat: add Command Palette and bottom embedded Terminal drawer (Cat 4)',
      body: 'Implemented Cmd+K launcher and expandable terminal runner.',
      authorName: 'Developer',
      authorEmail: 'dev@git-workbench.local',
      date: new Date().toISOString(),
      refs: [
        { label: 'main', kind: 'branch', isCurrent: true, isRemote: false },
        { label: 'origin/main', kind: 'branch', isCurrent: false, isRemote: true },
        { label: 'v1.0.0', kind: 'tag', isCurrent: false, isRemote: false }
      ],
      lanes: [0],
      lane: 0
    },
    {
      hash: 'b2c3d4e5f67890123456789abcdef0123456789',
      shortHash: 'b2c3d4e',
      parents: ['c3d4e5f67890123456789abcdef01234567890'],
      message: 'feat: implement Git Objects management for Tags, Remotes, Submodules (Cat 3)',
      body: '',
      authorName: 'Developer',
      authorEmail: 'dev@git-workbench.local',
      date: new Date(Date.now() - 3600000).toISOString(),
      refs: [{ label: 'v0.9.0', kind: 'tag', isCurrent: false, isRemote: false }],
      lanes: [0],
      lane: 0
    },
    {
      hash: 'c3d4e5f67890123456789abcdef01234567890',
      shortHash: 'c3d4e5f',
      parents: ['d4e5f67890123456789abcdef012345678901'],
      message: 'feat: add Visual Merge Conflict Resolver and Interactive Rebase (Cat 2)',
      body: '',
      authorName: 'Developer',
      authorEmail: 'dev@git-workbench.local',
      date: new Date(Date.now() - 7200000).toISOString(),
      refs: [{ label: 'feature/conflict-ui', kind: 'branch', isCurrent: false, isRemote: false }],
      lanes: [0, 1],
      lane: 1
    },
    {
      hash: 'd4e5f67890123456789abcdef012345678901',
      shortHash: 'd4e5f67',
      parents: [],
      message: 'feat: side-by-side diff view with line-level staging and blame (Cat 1)',
      body: '',
      authorName: 'Developer',
      authorEmail: 'dev@git-workbench.local',
      date: new Date(Date.now() - 86400000).toISOString(),
      refs: [],
      lanes: [0],
      lane: 0
    }
  ];

  const mock: Record<string, unknown> = {
    getAppUpdateState: async () => ({
      status: 'unsupported',
      currentVersion: APP_VERSION,
      canInstallInApp: false,
      error: 'Update checks are available in the installed app.'
    }),
    checkForAppUpdates: async () => ({
      status: 'unsupported',
      currentVersion: APP_VERSION,
      canInstallInApp: false,
      error: 'Update checks are available in the installed app.'
    }),
    downloadAppUpdate: async () => ({
      status: 'unsupported',
      currentVersion: APP_VERSION,
      canInstallInApp: false,
      error: 'Update checks are available in the installed app.'
    }),
    installAppUpdate: async () => false,
    openAppReleasePage: async () => {},
    onAppUpdateState: () => () => {},
    openRepo: async (p: string) => ({ ok: true, repo: { path: p, name: p.split('/').pop() || p } }),
    openRepoDialog: async () => ({ ok: true, repo: { path: activeRepo, name: 'git-workbench' } }),
    initRepo: async (opts: any) => ({ ok: true, repo: { path: opts.path, name: opts.path.split('/').pop() || opts.path } }),
    selectDirectory: async () => ({ ok: true, path: '/home/user/project' }),
    recentRepos: async () => recent,
    removeRecentRepo: async () => ({ ok: true }),
    getGitConfig: async () => ({ name: 'Jane Developer', email: 'jane@example.com' }),
    setGitConfig: async () => ({ ok: true }),
    getStagedDiff: async () => ({ ok: true, diff: 'diff --git a/file.ts b/file.ts\n+console.log("hello");' }),
    setActiveRepo: () => {},

    getStatus: async () => ({
      staged: [
        { path: 'src/renderer/components/CommandPalette/CommandPalette.tsx', status: 'added', staged: true, unstaged: false }
      ],
      unstaged: [
        { path: 'src/renderer/components/TerminalDrawer/TerminalDrawer.tsx', status: 'modified', staged: false, unstaged: true },
        { path: 'src/shared/types.ts', status: 'modified', staged: false, unstaged: true }
      ],
      currentBranch: 'main',
      ahead: 1,
      behind: 0
    }),

    getLog: async (limit = 300) => ({
      commits: mockCommits.slice(0, limit),
      totalCommits: mockCommits.length,
      hasMore: false,
      hasUncommittedChanges: true
    }),

    getPullReview: async () => { throw new Error('Hosted reviews require the desktop app and a configured provider.'); },
    listPinnedRepos: async () => [],
    getGitHubSignInState: async () => ({ configured: false, connected: false, secureStorageAvailable: false, method: null, needsSignIn: false, phase: 'idle', message: 'GitHub sign-in requires the desktop app.' }),
    startGitHubSignIn: async () => { throw new Error('GitHub sign-in requires the desktop app.'); },
    cancelGitHubSignIn: async () => { throw new Error('GitHub sign-in requires the desktop app.'); },
    openGitHubSignInPage: async () => { throw new Error('GitHub sign-in requires the desktop app.'); },
    copyGitHubSignInCode: async () => { throw new Error('GitHub sign-in requires the desktop app.'); },
    refreshGitHubAccount: async () => { throw new Error('GitHub sign-in requires the desktop app.'); },
    onGitHubSignInState: () => () => {},
    getSparseCheckout: async () => { throw new Error('Sparse checkout requires the desktop app.'); },
    getSparseDirectories: async () => { throw new Error('Sparse checkout requires the desktop app.'); },
    previewSparseCheckout: async () => { throw new Error('Sparse checkout requires the desktop app.'); },
    applySparseCheckout: async () => { throw new Error('Sparse checkout requires the desktop app.'); },
    restoreSparseLayout: async () => { throw new Error('Sparse checkout requires the desktop app.'); },
    getLfsState: async () => ({ repo: '', installed: false, configured: false, version: '', head: '', remotes: [], patterns: [], files: [], totalFiles: 0, warning: 'Git LFS requires the desktop app.' }),
    configureLfs: async () => { throw new Error('Git LFS requires the desktop app.'); },
    setLfsTracking: async () => { throw new Error('Git LFS requires the desktop app.'); },
    runLfsTransfer: async () => { throw new Error('Git LFS requires the desktop app.'); },
    getLfsTransfer: async () => null,
    cancelLfsTransfer: async () => { throw new Error('Git LFS requires the desktop app.'); },
    onLfsTransfer: () => () => {},
    getBranchStack: async () => ({ links: [], branches: [], sessions: [] }),
    setStackParent: async () => { throw new Error('Branch stacks require the desktop app.'); },
    previewStackRestack: async () => { throw new Error('Branch stacks require the desktop app.'); },
    resumeStackRestack: async () => { throw new Error('Branch stacks require the desktop app.'); },
    applyStackRestack: async () => { throw new Error('Branch stacks require the desktop app.'); },
    discardStackRestack: async () => { throw new Error('Branch stacks require the desktop app.'); },
    retargetPullRequest: async () => { throw new Error('Hosted request retargeting requires the desktop app.'); },
    getCommitSplit: async () => { throw new Error('Commit splitting requires the desktop app.'); },
    listCommitSplitPreviews: async () => [],
    previewCommitSplit: async () => { throw new Error('Commit splitting requires the desktop app.'); },
    applyCommitSplit: async () => { throw new Error('Commit splitting requires the desktop app.'); },
    discardCommitSplit: async () => { throw new Error('Commit splitting requires the desktop app.'); },
    openPullRequestWorktree: async () => { throw new Error('PR worktrees require the desktop app.'); },
    pinRepository: async () => { throw new Error('Pinning repositories requires the desktop app.'); },
    getRepositoryOverview: async () => { throw new Error('The repository dashboard requires the desktop app.'); },
    getResolutionMemory: async () => ({ enabled: false, gitAutomatic: false, remembered: 0 }),
    listRewriteSessions: async () => [],
    compareCommitRanges: async () => { throw new Error('Range comparisons require Git in the desktop app.'); },
    deleteRewriteSession: async () => { throw new Error('Rewrite records require the desktop app.'); },
    setResolutionMemory: async () => { throw new Error('Conflict memory requires the desktop app.'); },
    getResolutionSuggestion: async () => ({ enabled: false, content: null, snapshot: '' }),
    forgetResolution: async () => { throw new Error('Conflict memory requires the desktop app.'); },
    listRestorePoints: async () => [],
    createRestorePoint: async () => { throw new Error('Restore points require a local repository in the desktop app.'); },
    restorePoint: async () => { throw new Error('Restore points require a local repository in the desktop app.'); },
    deleteRestorePoint: async () => { throw new Error('Restore points require a local repository in the desktop app.'); },
    submitPullReview: async () => { throw new Error('Hosted reviews require the desktop app and a configured provider.'); },
    getReflog: async () => mockCommits.map((commit, index) => ({
      hash: commit.hash,
      shortHash: commit.shortHash,
      ref: index === 0 ? 'HEAD' : 'refs/heads/main',
      action: index === 0 ? 'commit: moved HEAD forward' : 'checkout: moved between branches',
      subject: commit.message,
      date: new Date(Date.now() - index * 60 * 60 * 1000).toISOString()
    })),
    createRecoveryBranch: async (hash: string, branchName?: string) => ({
      ok: true,
      branchName: branchName || `recovered/${hash.slice(0, 7)}-${new Date().toISOString().slice(0, 10)}`
    }),
    restoreHeadFromReflog: async () => ({ ok: true, branchName: 'main', backupBranch: 'git-workbench-recovery-backup-20261001120000-a1b2c3d' }),

    getBranches: async () => ({
      local: [
        { name: 'main', fullName: 'main', isCurrent: true, isRemote: false, tracking: 'origin/main' },
        { name: 'feature/conflict-ui', fullName: 'feature/conflict-ui', isCurrent: false, isRemote: false }
      ],
      remote: [
        { name: 'origin/main', fullName: 'origin/main', isCurrent: false, isRemote: true },
        { name: 'origin/feature/conflict-ui', fullName: 'origin/feature/conflict-ui', isCurrent: false, isRemote: true }
      ]
    }),

    getStashes: async () => [
      { index: 0, message: 'WIP on main: preliminary tests', date: new Date().toISOString() }
    ],

    getTags: async () => [
      { name: 'v1.0.0', hash: 'a1b2c3d4e5f67890123456789abcdef012345678', shortHash: 'a1b2c3d', message: 'Release 1.0.0' },
      { name: 'v0.9.0', hash: 'b2c3d4e5f67890123456789abcdef0123456789', shortHash: 'b2c3d4e', message: 'Beta release' }
    ],

    createTag: async () => ({ ok: true }),
    deleteTag: async () => ({ ok: true }),
    pushTag: async () => ({ ok: true }),

    getRemotes: async () => [
      { name: 'origin', fetchUrl: 'https://github.com/GitWorkbench/workbench.git', pushUrl: 'https://github.com/GitWorkbench/workbench.git' },
      { name: 'upstream', fetchUrl: 'git@github.com:core/upstream.git', pushUrl: 'git@github.com:core/upstream.git' }
    ],

    getPullRequestCredentialStatus: async () => ({ ...mockProviderCredentials }),
    savePullRequestCredential: async (provider: 'github' | 'gitlab' | 'bitbucket') => {
      mockProviderCredentials[provider] = true;
      return { ok: true };
    },
    removePullRequestCredential: async (provider: 'github' | 'gitlab' | 'bitbucket') => {
      mockProviderCredentials[provider] = false;
      return { ok: true };
    },
    getPullRequestContext: async (remoteName?: string, providerOverride?: 'github' | 'gitlab' | 'bitbucket') => {
      const provider = providerOverride || 'github';
      return {
        provider,
        remoteName: remoteName || 'origin',
        remoteUrl: 'https://github.com/GitWorkbench/workbench.git',
        repository: 'GitWorkbench/workbench',
        repositoryUrl: 'https://github.com/GitWorkbench/workbench',
        currentBranch: 'feature/conflict-ui',
        defaultBranch: mockProviderCredentials[provider] ? 'main' : '',
        credentialConfigured: mockProviderCredentials[provider],
        pullRequests: mockProviderCredentials[provider] ? mockPullRequests : []
      };
    },
    createHostedPullRequest: async (params: { title: string; targetBranch: string }) => {
      const created = {
        id: String(Date.now()), title: params.title, state: 'open' as const, draft: false,
        author: 'you', sourceBranch: 'feature/conflict-ui', targetBranch: params.targetBranch,
        url: 'https://github.com/GitWorkbench/workbench/pull/43', createdAt: new Date().toISOString()
      };
      mockPullRequests.unshift(created);
      return { ok: true, pullRequest: created };
    },

    addRemote: async () => ({ ok: true }),
    renameRemote: async () => ({ ok: true }),
    setRemoteUrl: async () => ({ ok: true }),
    removeRemote: async () => ({ ok: true }),
    pruneRemote: async () => ({ ok: true }),

    getSubmodules: async () => [
      { name: 'core-engine', path: 'vendor/core-engine', hash: 'd4e5f67890123456789abcdef012345678901', isInitialized: true, isDirty: false, isOutOfSync: false }
    ],

    updateSubmodules: async () => ({ ok: true }),

    getWorktrees: async () => [
      { path: '/var/www/git-gui', hash: 'a1b2c3d', branch: 'main' },
      { path: '/var/www/git-gui-preview', hash: 'c3d4e5f', branch: 'feature/conflict-ui' }
    ],

    removeWorktree: async () => ({ ok: true }),

    getCommitDetail: async (hash: string) => ({
      hash,
      shortHash: hash.slice(0, 7),
      parents: ['b2c3d4e'],
      message: 'feat: add Command Palette and bottom embedded Terminal drawer (Cat 4)',
      body: 'Implemented Cmd+K launcher and expandable terminal runner.',
      authorName: 'Developer',
      authorEmail: 'dev@git-workbench.local',
      date: new Date().toISOString(),
      files: [
        { path: 'src/renderer/components/CommandPalette/CommandPalette.tsx', status: 'added', insertions: 280, deletions: 0 },
        { path: 'src/renderer/components/TerminalDrawer/TerminalDrawer.tsx', status: 'added', insertions: 210, deletions: 0 }
      ],
      insertions: 490,
      deletions: 0
    }),

    getFileDiff: async (_hash: string, filePath: string) => ({
      isBinary: false,
      oldPath: filePath,
      newPath: filePath,
      insertions: 5,
      deletions: 2,
      hunks: [
        {
          header: '@@ -1,5 +1,8 @@',
          oldStart: 1,
          oldLines: 5,
          newStart: 1,
          newLines: 8,
          lines: [
            { kind: 'context', oldNo: 1, newNo: 1, content: ' import React from "react";' },
            { kind: 'del', oldNo: 2, newNo: null, content: '-// legacy diff view' },
            { kind: 'add', oldNo: null, newNo: 2, content: '+// advanced split & unified diff engine' },
            { kind: 'add', oldNo: null, newNo: 3, content: '+export const isEnabled = true;' },
            { kind: 'context', oldNo: 3, newNo: 4, content: ' export function DiffView() {' }
          ]
        }
      ]
    }),

    stageFiles: async () => ({}),
    unstageFiles: async () => ({}),
    stageAll: async () => ({}),
    unstageAll: async () => ({}),
    discardFile: async () => ({}),

    stageHunk: async () => ({ ok: true }),
    unstageHunk: async () => ({ ok: true }),
    discardHunk: async () => ({ ok: true }),
    stageLines: async () => ({ ok: true }),
    unstageLines: async () => ({ ok: true }),
    discardLines: async () => ({ ok: true }),
    revertHunk: async () => ({ ok: true }),

    commit: async (_msg?: string, _author?: { name: string; email: string }) => ({ ok: true }),
    pull: async () => ({ ok: true }),
    push: async () => ({ ok: true }),
    fetch: async () => ({ ok: true }),
    mergeBranch: async () => ({ ok: true }),
    rebaseBranch: async () => ({ ok: true }),
    checkoutBranch: async () => ({ ok: true }),
    createBranch: async () => ({ ok: true }),
    deleteBranch: async () => ({ ok: true }),
    renameBranch: async () => ({ ok: true }),
    checkoutCommit: async () => ({ ok: true }),
    createWorktree: async () => ({ ok: true }),
    resetBranchTo: async () => ({ ok: true }),
    editCommitMessage: async () => ({ ok: true }),
    revertCommit: async () => ({ ok: true }),
    dropCommit: async () => ({ ok: true }),
    applyPatchCommit: async () => ({ ok: true }),
    moveCommitDown: async () => ({ ok: true }),
    setUpstream: async () => ({ ok: true }),
    pushSetUpstream: async () => ({ ok: true }),

    stash: async () => ({ ok: true }),
    stashPop: async () => ({ ok: true }),
    stashApply: async () => ({ ok: true }),
    stashDrop: async () => ({ ok: true }),

    blame: async () => 'sample porcelain blame',
    getBlame: async () => [
      { lineNo: 1, commitHash: 'a1b2c3d', shortHash: 'a1b2c3d', author: 'Developer', authorEmail: 'dev@git-workbench.local', summary: 'feat', date: '2026-09-24', content: 'import React from "react";' },
      { lineNo: 2, commitHash: 'b2c3d4e', shortHash: 'b2c3d4e', author: 'Developer', authorEmail: 'dev@git-workbench.local', summary: 'feat', date: '2026-09-24', content: 'import { useApp } from "../../store";' }
    ],
    getFileHistory: async () => [
      { hash: 'a1b2c3d', shortHash: 'a1b2c3d', authorName: 'Developer', date: new Date().toISOString(), summary: 'Initial commit' }
    ],

    getConflictFile: async (filePath: string) => ({
      filePath,
      totalConflicts: 0,
      rawContent: '// sample file',
      sections: [{ type: 'text', lines: ['// sample file'] }],
      currentContent: '// sample file', incomingContent: '// incoming file', baseContent: '// base file',
      currentLabel: 'main', incomingLabel: 'feature/merge-editor', kind: 'text',
      lineEnding: '\n', snapshot: 'preview-conflict', workingTreeExists: true
    }),
    resolveConflictFile: async () => ({ ok: true }),
    getRepoOperationState: async () => ({
      inMerge: false, inRebase: false, inCherryPick: false, conflictedFiles: []
    }),
    abortOperation: async () => ({ ok: true }),
    continueOperation: async () => ({ ok: true }),
    cherryPick: async () => ({ ok: true }),

    getCommitsForRebase: async () => [
      { hash: 'a1b2c3d', shortHash: 'a1b2c3d', action: 'pick', summary: 'feat: add Command Palette' }
    ],
    executeInteractiveRebase: async () => ({ ok: true }),

    openTerminal: async () => ({ ok: true }),
    runCommand: async (cmd: string) => {
      if (cmd.includes('status')) {
        return {
          ok: true,
          stdout: '## main...origin/main [ahead 1]\n M src/renderer/components/TerminalDrawer/TerminalDrawer.tsx\n M src/shared/types.ts\nA  src/renderer/components/CommandPalette/CommandPalette.tsx\n',
          stderr: '',
          exitCode: 0
        };
      }
      if (cmd.includes('log')) {
        return {
          ok: true,
          stdout: 'a1b2c3d feat: add Command Palette and bottom embedded Terminal drawer (Cat 4)\nb2c3d4e feat: implement Git Objects management for Tags, Remotes, Submodules (Cat 3)\nc3d4e5f feat: add Visual Merge Conflict Resolver and Interactive Rebase (Cat 2)\nd4e5f67 feat: side-by-side diff view with line-level staging and blame (Cat 1)\n',
          stderr: '',
          exitCode: 0
        };
      }
      return {
        ok: true,
        stdout: `Executed: ${cmd}\nExit code: 0\n`,
        stderr: '',
        exitCode: 0
      };
    },
    openInEditor: async () => ({ ok: true }),

    getGitFlowConfig: async () => ({
      initialized: true,
      masterBranch: 'main',
      developBranch: 'develop',
      featurePrefix: 'feature/',
      releasePrefix: 'release/',
      hotfixPrefix: 'hotfix/',
      bugfixPrefix: 'bugfix/',
      supportPrefix: 'support/',
      versionTagPrefix: 'v'
    }),
    initGitFlow: async () => ({ ok: true }),
    startGitFlowBranch: async (params: any) => ({ ok: true, branchName: `${params.type}/${params.name}` }),
    finishGitFlowBranch: async () => ({ ok: true }),

    minimizeWindow: async () => true,
    maximizeWindow: async () => true,
    closeWindow: async () => true,
    isWindowMaximized: async () => false,
    restartApp: async () => true,

    compareCommits: async (baseHash: string, targetHash: string) => ({
      baseHash,
      targetHash,
      baseShort: baseHash.slice(0, 7),
      targetShort: targetHash.slice(0, 7),
      files: [
        { path: 'src/renderer/App.tsx', status: 'modified', staged: false, additions: 24, deletions: 6 },
        { path: 'src/shared/types.ts', status: 'modified', staged: false, additions: 18, deletions: 0 }
      ],
      totalAdditions: 42,
      totalDeletions: 6
    }),

    getComparisonFileDiff: async (_b: string, _t: string, filePath: string) => ({
      filePath,
      oldPath: filePath,
      status: 'modified',
      hunks: [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 5,
          header: '@@ -1,3 +1,5 @@',
          lines: [
            { kind: 'context', content: 'import React from "react";', oldLineNo: 1, newLineNo: 1 },
            { kind: 'del', content: '-const oldState = false;', oldLineNo: 2 },
            { kind: 'add', content: '+const newState = true;', newLineNo: 2 },
            { kind: 'add', content: '+export const isEnabled = true;', newLineNo: 3 },
            { kind: 'context', content: 'export default App;', oldLineNo: 3, newLineNo: 4 }
          ]
        }
      ],
      isBinary: false
    }),

    getStashDetail: async (index: number) => ({
      index,
      message: `WIP on feature branch: stash index ${index}`,
      date: new Date().toISOString(),
      files: [
        { path: 'src/renderer/components/DiffViewer/DiffViewer.tsx', status: 'modified', staged: false, additions: 12, deletions: 3 }
      ],
      insertions: 12,
      deletions: 3
    }),

    getStashFileDiff: async (_idx: number, filePath: string) => ({
      filePath,
      oldPath: filePath,
      status: 'modified',
      hunks: [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 4,
          header: '@@ -1,3 +1,4 @@',
          lines: [
            { kind: 'context', content: '// Stashed work', oldLineNo: 1, newLineNo: 1 },
            { kind: 'add', content: '+const stashFlag = true;', newLineNo: 2 },
            { kind: 'context', content: 'export default Component;', oldLineNo: 2, newLineNo: 3 }
          ]
        }
      ],
      isBinary: false
    }),

    applyStashFile: async () => ({ ok: true }),

    simulateMerge: async (targetBranch: string) => ({
      clean: true,
      conflicts: [],
      message: `Merge with ${targetBranch} can be performed cleanly without conflicts.`
    }),

    explainChanges: async () => ({ ok: false, error: 'AI review requires the desktop app and a configured AI provider.' }),

    startBisect: async () => ({
      ok: true,
      state: {
        active: true,
        currentCommit: {
          hash: 'c3d4e5f67890123456789abcdef01234567890',
          shortHash: 'c3d4e5f',
          message: 'feat: add Visual Merge Conflict Resolver',
          authorName: 'Developer',
          date: new Date().toISOString()
        },
        stepInfo: 'Bisecting: 3 revisions left to test after this (roughly 2 steps)'
      }
    }),

    stepBisect: async () => ({
      ok: true,
      state: {
        active: true,
        currentCommit: {
          hash: 'b2c3d4e5f67890123456789abcdef0123456789',
          shortHash: 'b2c3d4e',
          message: 'feat: implement Git Objects management',
          authorName: 'Developer',
          date: new Date().toISOString()
        },
        stepInfo: 'Bisecting: 1 revision left to test after this (roughly 1 step)'
      }
    }),

    resetBisect: async () => ({ ok: true }),

    getBisectState: async () => ({ active: false }),

    generateChangelog: async (fromRef: string, toRef?: string) => ({
      fromRef,
      toRef: toRef || 'HEAD',
      totalCommits: 4,
      categories: [
        {
          title: '✨ Features',
          items: [
            { hash: 'a1b2c3d', shortHash: 'a1b2c3d', message: 'feat: add Command Palette', author: 'Developer' },
            { hash: 'b2c3d4e', shortHash: 'b2c3d4e', message: 'feat: implement Git Objects management', author: 'Developer' }
          ]
        }
      ],
      markdown: `# Release Notes (${fromRef} → ${toRef || 'HEAD'})\n\n### ✨ Features\n- **[\`a1b2c3d\`]** feat: add Command Palette *(@Developer)*\n- **[\`b2c3d4e\`]** feat: implement Git Objects management *(@Developer)*\n`
    }),

    exportPatch: async () => ({ ok: true }),
    applyPatch: async () => ({ ok: true })
  };

  const clientGenerateAiCommitMessage = async (params?: Partial<AiCommitConfig>) => {
    // 1. If IPC method is available on window.api, try it first
    const raw = typeof window !== 'undefined' ? (window as unknown as { api?: Api & GitWorkbenchApi }).api : undefined;
    if (raw && typeof (raw as any).generateAiCommitMessage === 'function') {
      try {
        const res = await (raw as any).generateAiCommitMessage(params);
        if (res && res.ok) return res;
      } catch (err) {
        console.warn('IPC ai:generate-commit failed, attempting client-side generation:', err);
      }
    }

    // 2. Fetch staged diff directly
    let diff = '';
    try {
      if (raw && typeof (raw as any).getStagedDiff === 'function') {
        const res = await (raw as any).getStagedDiff();
        if (res && res.ok && res.diff) diff = res.diff;
      }
    } catch {}

    // 3. If no diff via getStagedDiff, reconstruct from staged files
    if (!diff && raw && typeof (raw as any).getStatus === 'function') {
      try {
        const status = await (raw as any).getStatus();
        if (status && status.staged && status.staged.length > 0) {
          const chunks: string[] = [];
          for (const f of status.staged.slice(0, 10)) {
            try {
              if (typeof (raw as any).getFileDiff === 'function') {
                const fd = await (raw as any).getFileDiff('HEAD', f.path, { staged: true });
                if (fd && fd.hunks && fd.hunks.length > 0) {
                  chunks.push(
                    `diff --git a/${f.path} b/${f.path}\n` +
                      fd.hunks
                        .map((h: any) =>
                          h.lines
                            .map((l: any) => (l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ') + l.content)
                            .join('\n')
                        )
                        .join('\n')
                  );
                  continue;
                }
              }
            } catch {}
            chunks.push(`diff --git a/${f.path} b/${f.path}\n+ [${f.status}] ${f.path}`);
          }
          diff = chunks.join('\n');
        }
      } catch {}
    }

    if (!diff) {
      diff = 'diff --git a/project b/project\n+ update staged files';
    }

    // 4. Run generator (cloud free models or local rule-based fallback)
    return generateCommitMessage({
      ...params,
      diff
    });
  };

  mock.generateAiCommitMessage = clientGenerateAiCommitMessage;

  return mock as unknown as Api & GitWorkbenchApi;
};

const rawWindowApi = typeof window !== 'undefined' ? (window as unknown as { api?: Api & GitWorkbenchApi }).api : undefined;
const fallbackMockApi = createMockApi();

// Resilient API object: delegates to native Electron preload window.api when available,
// but automatically falls back to client implementation if any method is missing or not exposed.
export const api: Api & GitWorkbenchApi = new Proxy({} as Api & GitWorkbenchApi, {
  get(_target, prop: string) {
    if (prop === 'generateAiCommitMessage') {
      if (rawWindowApi && typeof (rawWindowApi as any).generateAiCommitMessage === 'function') {
        return (rawWindowApi as any).generateAiCommitMessage.bind(rawWindowApi);
      }
      return fallbackMockApi.generateAiCommitMessage.bind(fallbackMockApi);
    }
    if (rawWindowApi && typeof (rawWindowApi as any)[prop] === 'function') {
      return (rawWindowApi as any)[prop].bind(rawWindowApi);
    }
    if (rawWindowApi && prop in rawWindowApi) {
      return (rawWindowApi as any)[prop];
    }
    if (rawWindowApi) {
      return () => Promise.reject(new Error(`Desktop API ${prop} is unavailable. Restart the updated app.`));
    }
    if (prop in fallbackMockApi) {
      const val = (fallbackMockApi as any)[prop];
      return typeof val === 'function' ? val.bind(fallbackMockApi) : val;
    }
    return undefined;
  }
});

/** Unwrap the {__error} envelope produced by main-process handlers. */
export async function unwrap<T>(p: Promise<T>): Promise<T> {
  const res = await p;
  if (res && typeof res === 'object' && '__error' in (res as Record<string, unknown>)) {
    throw new Error(String((res as Record<string, unknown>)['__error']));
  }
  return res;
}
