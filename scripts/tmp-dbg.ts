import { getLog } from '../src/main/git/log';
import { getStatus } from '../src/main/git/status-diff';

async function main() {
  const repo = process.argv[2] || '/var/www/git-gui';
  const st = await getStatus(repo);
  const log = await getLog(repo, st, 50);
  console.log('currentBranch', JSON.stringify(st.currentBranch));
  for (const c of log.commits) {
    console.log(c.shortHash, '| parents:', c.parents.map((p) => p.slice(0, 7)).join(','), '| refs:', JSON.stringify(c.refs));
  }
}
void main();
