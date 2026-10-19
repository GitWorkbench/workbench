#!/usr/bin/env node
'use strict';

// Generate disposable Git repositories for manual Git Workbench testing.
// No project files, global Git configuration, or hosted remotes are changed.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run demo:create -- [output-directory] [--fresh]\n--fresh creates a new timestamped copy; existing folders are never overwritten.');
  process.exit(0);
}
const unknown = args.find(arg => arg.startsWith('--') && arg !== '--fresh');
if (unknown) throw new Error(`Unknown option: ${unknown}`);
const directories = args.filter(arg => !arg.startsWith('--'));
if (directories.length > 1) throw new Error('Pass one output directory.');
let root = path.resolve(directories[0] || path.join(project, '.tmp', 'git-workbench-demo'));
if (args.includes('--fresh')) root += `-${new Date().toISOString().replace(/[:.]/g, '-')}`;
if (fs.existsSync(root)) throw new Error(`Directory already exists: ${root}\nUse --fresh to create a new copy without replacing your experiments.`);

const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' });
const noHooks = path.join(root, 'disabled-hooks');
const actors = [
  ['Alice Demo', 'alice@example.invalid'], ['Bob Demo', 'bob@example.invalid'],
  ['Chen Demo', 'chen@example.invalid'], ['Maya Demo', 'maya@example.invalid']
];
let tick = 0;
const repos = [];
const notes = [];
const manifest = { createdAt: new Date().toISOString(), root, repositories: repos, notes };

function git(repo, ...command) {
  return invoke(repo, command).stdout.trim();
}
function invoke(repo, command, extraEnv = {}) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=' + noHooks, '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...command], {
    cwd: repo, env: { ...env, ...extraEnv }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${command.join(' ')} failed in ${repo}\n${result.stderr || result.stdout}`);
  return result;
}
function write(repo, file, content) {
  const full = path.join(repo, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
function remove(repo, file) { fs.unlinkSync(path.join(repo, file)); }
function identity(repo) {
  const config = {
    'user.name': 'Git Workbench Demo', 'user.email': 'demo@example.invalid',
    'commit.gpgsign': 'false', 'tag.gpgsign': 'false', 'core.autocrlf': 'false',
    'core.hooksPath': noHooks, 'pull.rebase': 'false', 'push.default': 'current',
    'merge.conflictStyle': 'diff3', 'protocol.file.allow': 'always',
    'gitflow.branch.master': 'main', 'gitflow.branch.develop': 'develop',
    'gitflow.prefix.feature': 'feature/', 'gitflow.prefix.release': 'release/',
    'gitflow.prefix.hotfix': 'hotfix/', 'gitflow.prefix.bugfix': 'bugfix/',
    'gitflow.prefix.support': 'support/', 'gitflow.prefix.versiontag': 'v'
  };
  for (const [key, value] of Object.entries(config)) git(repo, 'config', '--local', key, value);
}
function dated(actor = 0, recent = false) {
  const [name, email] = actors[actor % actors.length];
  const timestamp = new Date(recent ? Date.now() - 60 * 60 * 1000 : Date.now() - 28 * 86400000 + tick++ * 3 * 3600000).toISOString();
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email,
    GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp };
}
function commit(repo, message, actor = 0, recent = false) {
  git(repo, 'add', '-A');
  invoke(repo, ['commit', '-m', message], dated(actor, recent));
  return git(repo, 'rev-parse', 'HEAD');
}
function init(repo) {
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-b', 'main');
  identity(repo);
}
function addRepo(name, description, branch, state = 'clean') {
  const repo = path.join(root, name);
  repos.push({ name, path: repo, description, branch, state });
  return repo;
}
function clone(name, description, branch = 'main') {
  const repo = addRepo(name, description, branch);
  git(root, 'clone', '--no-hardlinks', '--branch', branch, path.join(root, 'origin.git'), repo);
  identity(repo);
  const remoteBranches = git(repo, 'for-each-ref', '--format=%(refname:strip=3)', 'refs/remotes/origin').split('\n');
  for (const local of remoteBranches) {
    if (!local || local === 'HEAD' || local === branch) continue;
    git(repo, 'branch', '--track', local, `origin/${local}`);
  }
  git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init');
  return repo;
}
function conflict(repo, command) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=' + noHooks, '-c', 'commit.gpgsign=false', ...command], {
    cwd: repo, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  const files = git(repo, 'diff', '--name-only', '--diff-filter=U', '-z').split('\0').filter(Boolean);
  if (result.status !== 1 || !files.length) throw new Error(`Expected a Git conflict from ${command.join(' ')} in ${repo}\n${result.stderr || result.stdout}`);
  const entry = repos.find(item => item.path === repo);
  entry.state = 'conflicted';
  entry.conflictedFiles = files;
  return files;
}
function onBranch(repo, name, from, mutate, message, actor = 0) {
  git(repo, 'checkout', '-b', name, from);
  mutate();
  return commit(repo, message, actor);
}

fs.mkdirSync(path.dirname(root), { recursive: true });
fs.mkdirSync(root);
fs.mkdirSync(noHooks);
console.log(`Creating Git Workbench playground in ${root}`);

// A real local submodule with two versions, suitable for the Submodules panel.
const library = path.join(root, 'submodule-source');
init(library);
write(library, 'README.md', '# Demo shared library\nA local submodule used by the playground.\n');
write(library, 'currency.js', 'export const currency = "USD";\n');
const libraryV1 = commit(library, 'feat: add shared currency helper', 2);
git(library, 'tag', 'v1.0.0');
write(library, 'currency.js', 'export const currency = "USD";\nexport const decimals = 2;\n');
const libraryV2 = commit(library, 'feat: configure currency decimal places', 1);
git(library, 'tag', 'v1.1.0');
git(library, 'checkout', '-b', 'alternative-currency', libraryV1);
write(library, 'currency.js', 'export const currency = "EUR";\n');
const libraryAlternative = commit(library, 'feat: use an alternate shared currency', 3);
git(library, 'checkout', 'main');
manifest.submodule = { path: library, initialCommit: libraryV1, latestCommit: libraryV2, alternativeCommit: libraryAlternative };

const workspace = addRepo('workspace', 'Main playground: graph, file status, diffs, stashes, tags, branches, Git Flow, and worktrees.', 'main', 'dirty');
init(workspace);
write(workspace, '.gitignore', 'node_modules/\n.cache/\n.env\n');
write(workspace, '.gitattributes', 'windows/settings.ini text eol=crlf\nassets/*.dat -text\n');
write(workspace, 'package.json', JSON.stringify({ name: 'git-workbench-demo-store', version: '0.1.0', private: true, type: 'module' }, null, 2) + '\n');
write(workspace, 'README.md', '# Demo Store\n\nA small fictional store used to exercise Git Workbench.\n\nNothing here connects to a live service.\n');
write(workspace, 'src/app.ts', 'export const appName = "Demo Store";\nexport const pageSize = 20;\n\nexport function welcome(name: string) {\n  return `Welcome, ${name}`;\n}\n');
write(workspace, 'src/pricing.js', 'export function total(price, quantity) {\n  return price * quantity;\n}\n');
write(workspace, 'src/legacy.ts', 'export const legacyDiscount = 0.05;\n');
write(workspace, 'src/ui/banner.ts', 'export const banner = "Spring sale";\n');
write(workspace, 'docs/report.txt', Array.from({ length: 45 }, (_, i) => `Report line ${String(i + 1).padStart(2, '0')}: unchanged baseline`).join('\n') + '\n');
write(workspace, 'src/ui/theme.css', ':root {\n  --background: #19202a;\n  --foreground: #e2e8f0;\n  --accent: #38bdf8;\n}\n\nbutton {\n  padding: 8px 12px;\n  border-radius: 4px;\n}\n');
write(workspace, 'server/OrderController.php', '<?php\n\nfinal class OrderController\n{\n    public function index(): array\n    {\n        return ["status" => "ready", "orders" => []];\n    }\n}\n');
write(workspace, 'config/store.json', '{\n  "currency": "USD",\n  "tax": 0.1,\n  "shipping": "standard"\n}\n');
write(workspace, 'docs/old-name.md', '# This file will be renamed\nRead me in the file history panel.\n');
write(workspace, 'docs/obsolete.md', '# Obsolete documentation\nThis file will be deleted in a working-tree scenario.\n');
write(workspace, 'docs/日本語.md', '# Demo documentation\nUnicode filenames should render correctly.\n');
write(workspace, 'docs/file with spaces.md', '# Paths with spaces\nPath actions should work without escaping by hand.\n');
write(workspace, 'windows/settings.ini', '[store]\r\ncurrency=USD\r\npage_size=20\r\n\r\n[checkout]\r\nconfirmation=enabled\r\n');
write(workspace, 'assets/logo.dat', Buffer.from([0, 83, 71, 1, 10, 20, 30, 255]));
const seed = commit(workspace, 'chore: initialize the demo storefront\n\nIncludes TypeScript, PHP, JSON, CSS, Unicode paths, CRLF, and a binary asset.', 0);
git(workspace, 'tag', '-a', 'v0.1.0', '-m', 'Initial demo release');

write(workspace, 'src/catalog.ts', 'export const products = [\n  { id: "coffee", name: "Coffee", price: 12 },\n  { id: "tea", name: "Tea", price: 8 },\n];\n');
commit(workspace, 'feat(catalog): add initial product catalog', 1);
write(workspace, 'src/pricing.js', 'export function total(price, quantity) {\n  if (quantity < 0) throw new Error("Quantity must be positive");\n  return price * quantity;\n}\n');
commit(workspace, 'fix(checkout): reject negative quantities\n\nThe validation error should appear in commit details and blame.', 2);
write(workspace, 'docs/shipping.md', '# Shipping\n\nStandard: 3–5 days. Express: 1–2 days.\n');
commit(workspace, 'docs: describe shipping options', 3);
git(workspace, 'mv', 'docs/old-name.md', 'docs/architecture.md');
commit(workspace, 'refactor(docs): rename architecture documentation', 1);
const catalogBase = git(workspace, 'rev-parse', 'HEAD');

onBranch(workspace, 'feature/theme', catalogBase, () => {
  write(workspace, 'src/ui/theme.css', ':root {\n  --background: #161b22;\n  --foreground: #f0f6fc;\n  --accent: #7ee787;\n}\n\nbutton {\n  padding: 10px 16px;\n  border-radius: 8px;\n}\n');
}, 'style: refresh the storefront theme', 3);
write(workspace, 'src/ui/theme.ts', 'export const themes = ["dark", "light", "forest"];\n');
commit(workspace, 'feat(theme): add theme presets', 0);
git(workspace, 'checkout', 'main');
write(workspace, 'docs/checkout.md', '# Checkout flow\n\nSelect a product, choose shipping, confirm payment.\n');
commit(workspace, 'docs(checkout): explain the purchase flow', 1);
invoke(workspace, ['merge', '--no-ff', 'feature/theme', '-m', 'Merge feature/theme into main'], dated(2));
git(workspace, 'tag', '-a', 'v0.2.0', '-m', 'Demo theme release');

git(workspace, '-c', 'protocol.file.allow=always', 'submodule', 'add', library, 'packages/shared');
git(path.join(workspace, 'packages/shared'), 'checkout', libraryV1);
commit(workspace, 'build: include the shared currency submodule', 0);
const branchBase = git(workspace, 'rev-parse', 'HEAD');
onBranch(workspace, 'develop', branchBase, () => {
  write(workspace, 'docs/roadmap.md', '# Roadmap\n\n- Dashboard\n- Better checkout\n- Notifications\n');
}, 'docs: record the development roadmap', 1);
onBranch(workspace, 'feature/dashboard', 'develop', () => {
  write(workspace, 'src/dashboard.ts', 'export const dashboard = {\n  widgets: ["sales", "orders", "inventory"],\n  refreshSeconds: 30,\n};\n');
}, 'feat(dashboard): add sales and order widgets', 2);
write(workspace, 'src/dashboard.ts', 'export const dashboard = {\n  widgets: ["sales", "orders", "inventory", "activity"],\n  refreshSeconds: 15,\n};\n');
commit(workspace, 'perf(dashboard): shorten the refresh interval', 3);
onBranch(workspace, 'feature/notifications', 'develop', () => {
  write(workspace, 'src/notifications.ts', 'export const channels = ["email", "in-app"];\n');
}, 'feat(notifications): add configurable notification channels', 1);
onBranch(workspace, 'release/0.3.0', 'develop', () => {
  write(workspace, 'docs/release-notes.md', '# v0.3.0\n\nDashboard, notifications, and improved checkout.\n');
}, 'chore(release): prepare the demo release', 0);
onBranch(workspace, 'hotfix/tax-rounding', 'main', () => {
  write(workspace, 'src/tax.ts', 'export const roundTax = (value: number) => Math.round(value * 100) / 100;\n');
}, 'fix(tax): round values to cents', 2);
onBranch(workspace, 'bugfix/empty-cart', 'develop', () => {
  write(workspace, 'src/cart.ts', 'export const canCheckout = (items: unknown[]) => items.length > 0;\n');
}, 'fix(cart): prevent checkout with an empty cart', 1);

// Several text blocks are separated by common context so navigation and independent choices are visible.
function checkoutContent(side) {
  const config = side === 'base' ? ['20', '"standard"', '"Confirm order"']
    : side === 'current' ? ['30', '"express"', '"Place order"'] : ['50', '"pickup"', '"Complete purchase"'];
  return `export const pageSize = ${config[0]};\n\n// Shared catalog settings\nexport const currency = "USD";\nexport const locale = "en-US";\nexport const precision = 2;\n\nexport const deliveryMode = ${config[1]};\n\n// Shared form labels\nexport const nameLabel = "Name";\nexport const addressLabel = "Address";\nexport const emailLabel = "Email";\n\nexport const submitLabel = ${config[2]};\n`;
}
onBranch(workspace, 'demo/merge-base', branchBase, () => {
  write(workspace, 'src/checkout.ts', checkoutContent('base'));
  write(workspace, 'src/remove-on-current.ts', 'export const retired = "legacy controller";\n');
  write(workspace, 'src/remove-on-incoming.ts', 'export const coupon = "SAVE10";\n');
}, 'feat: add a checkout screen for conflict scenarios', 0);
// Symbolic links are optional on hosts where creating them requires extra privileges.
let hasSymlinks = false;
try {
  fs.symlinkSync('app.ts', path.join(workspace, 'src/current-entry'));
  hasSymlinks = true;
} catch (error) {
  if (!['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) throw error;
  notes.push('Symbolic link conflicts were omitted because this host does not permit creating symbolic links.');
}
if (hasSymlinks) commit(workspace, 'build: add a symbolic entry point for conflict review', 0);
const conflictBase = git(workspace, 'rev-parse', 'HEAD');
onBranch(workspace, 'demo/merge-current', conflictBase, () => {
  write(workspace, 'src/checkout.ts', checkoutContent('current'));
  write(workspace, 'config/store.json', '{\n  "currency": "USD",\n  "tax": 0.12,\n  "shipping": "express"\n}\n');
  write(workspace, 'windows/settings.ini', '[store]\r\ncurrency=USD\r\npage_size=30\r\n\r\n[checkout]\r\nconfirmation=current\r\n');
  write(workspace, 'src/add-on-both.ts', 'export const newFeature = "local search";\n');
  write(workspace, 'src/remove-on-incoming.ts', 'export const coupon = "SAVE20";\n');
  remove(workspace, 'src/remove-on-current.ts');
  write(workspace, 'assets/logo.dat', Buffer.from([0, 83, 71, 2, 90, 80, 70, 255]));
  write(workspace, 'docs/current-only.md', '# Automatically merged\nA non-conflicting addition from the current side.\n');
  if (hasSymlinks) {
    remove(workspace, 'src/current-entry');
    fs.symlinkSync('checkout.ts', path.join(workspace, 'src/current-entry'));
  }
}, 'feat(checkout): use express delivery and a local checkout design', 1);
const currentTip = git(workspace, 'rev-parse', 'HEAD');
onBranch(workspace, 'demo/merge-incoming', conflictBase, () => {
  write(workspace, 'src/checkout.ts', checkoutContent('incoming'));
  write(workspace, 'config/store.json', '{\n  "currency": "USD",\n  "tax": 0.08,\n  "shipping": "pickup"\n}\n');
  write(workspace, 'windows/settings.ini', '[store]\r\ncurrency=USD\r\npage_size=50\r\n\r\n[checkout]\r\nconfirmation=incoming\r\n');
  write(workspace, 'src/add-on-both.ts', 'export const newFeature = "remote recommendations";\n');
  write(workspace, 'src/remove-on-current.ts', 'export const retired = "updated controller";\n');
  remove(workspace, 'src/remove-on-incoming.ts');
  write(workspace, 'assets/logo.dat', Buffer.from([0, 83, 71, 3, 40, 50, 60, 255]));
  write(workspace, 'docs/incoming-only.md', '# Automatically merged\nA non-conflicting addition from the incoming side.\n');
  if (hasSymlinks) {
    remove(workspace, 'src/current-entry');
    fs.symlinkSync('catalog.ts', path.join(workspace, 'src/current-entry'));
  }
}, 'feat(checkout): use pickup and a competing checkout design', 2);
const incomingTip = git(workspace, 'rev-parse', 'HEAD');
manifest.conflictCommits = { base: conflictBase, current: currentTip, incoming: incomingTip };
manifest.hasSymlinkConflicts = hasSymlinks;

onBranch(workspace, 'demo/submodule-current', branchBase, () => {
  git(path.join(workspace, 'packages/shared'), 'checkout', libraryV2);
}, 'build: adopt shared currency decimal support', 1);
onBranch(workspace, 'demo/submodule-incoming', branchBase, () => {
  git(path.join(workspace, 'packages/shared'), 'checkout', libraryAlternative);
}, 'build: adopt the alternate shared currency', 3);
// Restore the checkout to match the gitlink before building other branches.
git(path.join(workspace, 'packages/shared'), 'checkout', libraryV1);

// Simple file-only conflicts support marker repair, no-marker review, and custom marker lengths.
onBranch(workspace, 'demo/simple-current', branchBase, () => write(workspace, 'config/store.json', '{\n  "currency": "USD",\n  "tax": 0.15,\n  "shipping": "express"\n}\n'), 'fix: use local tax and shipping settings', 1);
onBranch(workspace, 'demo/simple-incoming', branchBase, () => write(workspace, 'config/store.json', '{\n  "currency": "EUR",\n  "tax": 0.05,\n  "shipping": "pickup"\n}\n'), 'fix: use incoming tax and shipping settings', 3);

// A known regression, followed by unrelated commits, for the Bisect wizard.
git(workspace, 'checkout', '-b', 'demo/bisect', branchBase);
write(workspace, 'src/pricing.js', 'export function total(price, quantity) {\n  return price * quantity;\n}\n');
commit(workspace, 'refactor(pricing): establish the known-good baseline', 0);
git(workspace, 'tag', 'demo/bisect-good');
for (let i = 1; i <= 8; i++) {
  if (i === 4) write(workspace, 'src/pricing.js', 'export function total(price, quantity) {\n  return price + quantity; // DEMO BUG: multiplication was replaced with addition\n}\n');
  write(workspace, `docs/bisect-step-${i}.md`, `# Iteration ${i}\nUnrelated documentation change.\n`);
  const hash = commit(workspace, i === 4 ? 'perf(pricing): simplify the total calculation' : `docs: add pricing iteration ${i}`, i);
  if (i === 4) manifest.bisectCulprit = hash;
}
git(workspace, 'tag', 'demo/bisect-bad');

git(workspace, 'checkout', 'main');
write(workspace, 'docs/latest.md', '# Latest demo changes\nA recent commit for date filtering and release notes.\n');
commit(workspace, 'docs: add recent demo release notes', 3, true);
git(workspace, 'tag', 'v0.3.0');

const remote = path.join(root, 'origin.git');
fs.mkdirSync(remote);
git(remote, 'init', '--bare', '--initial-branch=main');
git(workspace, 'remote', 'add', 'origin', remote);
git(workspace, 'push', '--all', 'origin');
git(workspace, 'push', '--tags', 'origin');
git(workspace, 'branch', '--set-upstream-to=origin/main', 'main');
manifest.localRemote = remote;

const diff3 = clone('merge-conflicts', 'Active diff3 merge: three text blocks, JSON, CRLF, add/add, binary, and delete/modify conflicts.', 'demo/merge-current');
conflict(diff3, ['merge', '--no-ff', 'demo/merge-incoming']);
const standard = clone('merge-standard', 'Active merge using ordinary two-way markers instead of diff3.', 'demo/simple-current');
git(standard, 'config', 'merge.conflictStyle', 'merge');
conflict(standard, ['merge', '--no-ff', 'demo/simple-incoming']);
const rebase = clone('rebase-conflicts', 'Active rebase conflict; Current means the branch being replayed onto.', 'demo/merge-current');
conflict(rebase, ['rebase', 'demo/merge-incoming']);
const cherry = clone('cherry-pick-conflicts', 'Active cherry-pick conflict on the same competing checkout changes.', 'demo/merge-current');
conflict(cherry, ['cherry-pick', incomingTip]);

const stash = clone('stash-conflicts', 'A stash application has stopped with text conflicts and no MERGE_HEAD.', 'main');
write(stash, 'src/app.ts', 'export const appName = "Stashed Store";\nexport const pageSize = 35;\n\nexport function welcome(name: string) {\n  return `Welcome back, ${name}`;\n}\n');
git(stash, 'stash', 'push', '-m', 'demo: competing app title and page size');
write(stash, 'src/app.ts', 'export const appName = "Committed Store";\nexport const pageSize = 50;\n\nexport function welcome(name: string) {\n  return `Hello, ${name}`;\n}\n');
commit(stash, 'feat(app): update the title after stashing', 2, true);
conflict(stash, ['stash', 'apply', 'stash@{0}']);

const manual = clone('manual-resolution', 'Markers were removed by hand, but Git still considers the file unmerged.', 'demo/simple-current');
conflict(manual, ['merge', '--no-ff', 'demo/simple-incoming']);
write(manual, 'config/store.json', '{\n  "currency": "EUR",\n  "tax": 0.1,\n  "shipping": "express"\n}\n');
const malformed = clone('malformed-markers', 'Incomplete markers: edit the result or choose a complete side to recover.', 'demo/simple-current');
conflict(malformed, ['merge', '--no-ff', 'demo/simple-incoming']);
const malformedFile = path.join(malformed, 'config/store.json');
fs.writeFileSync(malformedFile, fs.readFileSync(malformedFile, 'utf8').replace(/^>{7}.*\n?/m, ''));
const markers = clone('large-markers', 'Diff3 merge with conflict-marker-size=15.', 'demo/simple-current');
write(markers, '.git/info/attributes', 'config/store.json conflict-marker-size=15\n');
conflict(markers, ['merge', '--no-ff', 'demo/simple-incoming']);
const submoduleConflict = clone('submodule-conflicts', 'Divergent submodule commits: review the resolver guidance and resolve the gitlink.', 'demo/submodule-current');
conflict(submoduleConflict, ['merge', '--no-ff', 'demo/submodule-incoming']);

const history = clone('history-playground', 'Clean history for reset, reword, squash, drop, revert, cherry-pick, comparison, and recovery.');
write(history, 'docs/recover-me.md', '# Recover this commit\nThis content is hidden after a demonstration reset.\n');
const lost = commit(history, 'feat: create a recoverable demo commit', 0, true);
git(history, 'reset', '--hard', 'HEAD~1');
manifest.recoverableCommit = { repository: history, hash: lost };
const bisect = clone('bisect-playground', 'Clean known regression history. Good tag: demo/bisect-good; bad tag: demo/bisect-bad.', 'demo/bisect');
const gitflow = clone('gitflow-playground', 'Clean repository for initializing Git Flow and starting/finishing feature, release, and hotfix branches.');
git(gitflow, 'branch', '-D', 'develop');
git(gitflow, 'config', '--local', '--remove-section', 'gitflow.branch');
git(gitflow, 'config', '--local', '--remove-section', 'gitflow.prefix');
const empty = addRepo('empty-repo', 'Initialized repository with no commits; add a file and create the first commit.', 'main');
init(empty);

// A second user and a clean client expose real ahead/behind states without an internet account.
const remoteClient = clone('remote-client', 'Clean branch with one local and one remote commit: fetch, pull, merge, push, and remote errors.');
const collaborator = clone('remote-collaborator', 'Second clone used to create additional remote changes while testing.');
write(remoteClient, 'docs/local-contribution.md', '# Local commit\nThis starts one commit ahead of origin/main.\n');
commit(remoteClient, 'docs: add a local contribution', 0, true);
write(collaborator, 'docs/remote-contribution.md', '# Remote commit\nPull this change into the remote client.\n');
commit(collaborator, 'docs: add a teammate contribution', 1, true);
git(collaborator, 'push', 'origin', 'main');
git(remoteClient, 'fetch', 'origin');
manifest.remoteClient = { repository: remoteClient, ahead: 1, behind: 1 };
// A fetched remote branch is deleted afterwards so Prune has a visible result.
git(collaborator, 'push', 'origin', 'main:refs/heads/demo/stale-remote');
git(workspace, 'fetch', 'origin');
git(collaborator, 'push', 'origin', '--delete', 'demo/stale-remote');

// Multiple stashes, staged/unstaged changes in one file, several diff hunks, rename, delete, and untracked files.
write(workspace, 'src/app.ts', fs.readFileSync(path.join(workspace, 'src/app.ts'), 'utf8') + '\nexport const demoSearch = true;\n');
write(workspace, 'notes/stashed-untracked.md', '# Stashed note\nIncluded with --include-untracked.\n');
git(workspace, 'stash', 'push', '--include-untracked', '-m', 'demo: search prototype and untracked note');
write(workspace, 'config/store.json', '{\n  "currency": "USD",\n  "tax": 0.2,\n  "shipping": "overnight"\n}\n');
git(workspace, 'stash', 'push', '-m', 'demo: alternate shipping configuration');
write(workspace, 'src/app.ts', 'export const appName = "Demo Store Preview";\nexport const pageSize = 25;\n\nexport function welcome(name: string) {\n  return `Welcome, ${name}`;\n}\n');
git(workspace, 'add', 'src/app.ts');
write(workspace, 'src/app.ts', fs.readFileSync(path.join(workspace, 'src/app.ts'), 'utf8').replace('Welcome, ${name}', 'Hello, ${name}!'));
write(workspace, 'src/ui/theme.css', fs.readFileSync(path.join(workspace, 'src/ui/theme.css'), 'utf8').replace('padding: 10px 16px;', 'padding: 12px 20px;').replace('border-radius: 8px;', 'border-radius: 10px;'));
write(workspace, 'docs/report.txt', fs.readFileSync(path.join(workspace, 'docs/report.txt'), 'utf8').replace('Report line 02: unchanged baseline', 'Report line 02: first independent edit').replace('Report line 38: unchanged baseline', 'Report line 38: second independent edit'));
write(workspace, 'src/new-checkout.ts', 'export const checkoutEnabled = true;\n');
git(workspace, 'add', 'src/new-checkout.ts');
git(workspace, 'mv', 'docs/architecture.md', 'docs/system-design.md');
remove(workspace, 'docs/obsolete.md');
write(workspace, 'notes/untracked draft.md', '# Working note\nAn untracked file for staging and discarding.\n');
write(workspace, 'docs/日本語.md', '# Demo documentation\nUnicode filenames should render correctly.\nA new working-tree line.\n');
// Leave the submodule checkout at a newer commit than the recorded gitlink.
git(path.join(workspace, 'packages/shared'), 'checkout', libraryV2);
const worktree = path.join(root, 'worktree-dashboard');
git(workspace, 'worktree', 'add', worktree, 'feature/dashboard');
repos.push({ name: 'worktree-dashboard', path: worktree, description: 'Linked worktree on feature/dashboard; .git is a pointer file.', branch: 'feature/dashboard', state: 'clean' });

// Store the actual final branch/status of every generated repository for the manual checklist.
for (const entry of repos) {
  entry.currentBranch = git(entry.path, 'branch', '--show-current') || '(detached HEAD)';
  entry.status = invoke(entry.path, ['status', '--short']).stdout.trimEnd();
  entry.commitCount = Number(git(entry.path, 'rev-list', '--all', '--count'));
}
notes.push('All origin remotes point to a local bare repository. Push and fetch never publish to GitHub, GitLab, or Bitbucket.');
notes.push('Hosted pull requests, provider token validation, AI network providers, and packaged updater behavior need their own account or packaged-app setup.');
notes.push('Generated repositories remain intact when you run --fresh; the factory never deletes an existing directory.');
const guide = fs.readFileSync(path.join(project, 'docs/demo-repositories.md'), 'utf8').replaceAll('{{DEMO_ROOT}}', root);
write(root, 'GUIDE.md', guide);
write(root, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('\nReady. Open these folders in Git Workbench:');
for (const entry of repos) console.log(`  ${entry.path} — ${entry.state}`);
console.log(`\nGuide: ${path.join(root, 'GUIDE.md')}\nManifest: ${path.join(root, 'manifest.json')}`);
