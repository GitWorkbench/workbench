import { getLog } from '../src/main/git/log';
import { getStatus } from '../src/main/git/status-diff';
import { getCommitDetail, getFileDiff } from '../src/main/git/commit-detail';
import { getStashes, getBranches, revertHunk } from '../src/main/git/branch-stash';

async function main() {
  const repo = '/tmp/git-workbench-test';
  const status = await getStatus(repo);
  console.log('status:', JSON.stringify({ branch: status.currentBranch, staged: status.staged.map((f) => f.path), unstaged: status.unstaged.map((f) => f.path) }));

  const log = await getLog(repo, status);
  console.log('commits:', log.commits.length);
  for (const c of log.commits) {
    console.log(
      `  lane=${c.lane} parentLanes=[${c.lanes.join(',')}] ${c.shortHash} ${c.message} refs=[${c.refs.map((r) => r.label + (r.isCurrent ? '*' : '')).join('|')}]`
    );
  }

  const branches = await getBranches(repo);
  console.log('local branches:', branches.local.map((b) => `${b.name}${b.isCurrent ? '*' : ''}`).join(', '));
  console.log('remote branches:', branches.remote.length);

  const stashes = await getStashes(repo);
  console.log('stashes:', stashes.map((s) => `#${s.index} ${s.message}`).join(' | '));

  // commit detail on merge commit
  const merge = log.commits.find((c) => c.message.startsWith('merge'));
  if (merge) {
    const d = await getCommitDetail(repo, merge.hash);
    console.log('merge detail:', d?.files.map((f) => `${f.status}:${f.path}`).join(', '));
  }

  // diff of a normal commit
  const feat = log.commits.find((c) => c.message === 'feature work');
  if (feat) {
    const diff = await getFileDiff(repo, feat.hash, 'feat.txt');
    console.log('feat.txt hunks:', diff?.hunks.length, 'lines:', diff?.hunks[0]?.lines.length);
  }

  // root commit diff
  const root = log.commits[log.commits.length - 1];
  const rootDiff = await getFileDiff(repo, root.hash, 'README.md');
  console.log('root diff hunks:', rootDiff?.hunks.length);

  console.log('ALL-OK');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
