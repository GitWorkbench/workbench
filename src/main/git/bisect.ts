import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BisectState } from '../../shared/types';
import { withGit } from './core';

const execFileP = promisify(execFile);

async function checkIsBisecting(repoPath: string): Promise<boolean> {
  const gitDir = await withGit(repoPath, g => g.raw(['rev-parse', '--absolute-git-dir']));
  const startFile = path.join(gitDir.trim(), 'BISECT_START');
  const logFile = path.join(gitDir.trim(), 'BISECT_LOG');
  return fs.existsSync(startFile) || fs.existsSync(logFile);
}

export async function getBisectState(repoPath: string): Promise<BisectState> {
  const active = await checkIsBisecting(repoPath);
  if (!active) {
    return { active: false };
  }

  return await withGit(repoPath, async (git) => {
    try {
      const gitDir = (await git.raw(['rev-parse', '--absolute-git-dir'])).trim();
      const logFilePath = path.join(gitDir, 'BISECT_LOG');
      let bisectLogLines: string[] = [];
      if (fs.existsSync(logFilePath)) {
        const raw = await fs.promises.readFile(logFilePath, 'utf8');
        bisectLogLines = raw.split('\n').filter(Boolean);
      }

      // Check current HEAD
      const logOut = await git.raw(['log', '-1', '--format=%H%x00%h%x00%s%x00%an%x00%ci']);
      const [hash, shortHash, message, authorName, date] = logOut.trim().split('\0');

      // Check if culprit is already determined
      let culpritCommit: BisectState['culpritCommit'] | undefined;
      const expectedCulpritLine = bisectLogLines.find((l) => /first ['\"]?bad['\"]? commit/.test(l));
      if (expectedCulpritLine) {
        const m = expectedCulpritLine.match(/([a-f0-9]{40})/i);
        if (m) {
          const culpritHash = m[1];
          const culpritOut = await git.raw(['log', '-1', '--format=%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%ci', culpritHash]);
          const [cH, cShort, cMsg, cBody, cAuthor, cEmail, cDate] = culpritOut.trim().split('\0');
          culpritCommit = {
            hash: cH,
            shortHash: cShort,
            message: cMsg,
            body: cBody || '',
            authorName: cAuthor,
            authorEmail: cEmail,
            date: cDate
          };
        }
      }

      const ambiguousCommits = bisectLogLines.flatMap(line => {
        const match = line.match(/possible first (?:['"]?bad['"]? )?commit: \[([a-f0-9]{40,64})\]/i);
        return match ? [match[1]] : [];
      });
      const refs = await git.raw(['for-each-ref', '--format=%(refname)', 'refs/bisect/']);
      return {
        active: true,
        ambiguousCommits,
        needsGood: !refs.includes('refs/bisect/good-'),
        needsBad: !refs.split('\n').includes('refs/bisect/bad'),
        currentCommit: {
          hash,
          shortHash,
          message,
          authorName,
          date
        },
        culpritCommit,
        log: bisectLogLines
      };
    } catch {
      return { active: true };
    }
  });
}

export async function startBisect(
  repoPath: string,
  badCommit?: string,
  goodCommit?: string
): Promise<{ ok: boolean; state?: BisectState; error?: string }> {
  try {
    const isBisecting = await checkIsBisecting(repoPath);
    if (isBisecting && badCommit && goodCommit) {
      throw new Error('A bisect session is already active. Reset it before starting another.');
    }
    // Resolve revisions before changing repository state, and reject option-like input.
    const resolve = (ref: string) => withGit(repoPath, g => g.raw(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).then(s => s.trim());
    const bad = badCommit ? await resolve(badCommit) : undefined;
    const good = goodCommit ? await resolve(goodCommit) : undefined;
    if (!isBisecting) {
      const dirty = await withGit(repoPath, g => g.status());
      if (!dirty.isClean()) throw new Error('Commit or stash your changes before starting bisect.');
    }
    let stdout = '';
    let stderr = '';
    if (!isBisecting && bad && good) {
      ({ stdout, stderr } = await execFileP('git', ['bisect', 'start', bad, good], { cwd: repoPath }));
    } else {
      if (!isBisecting) await execFileP('git', ['bisect', 'start'], { cwd: repoPath });
      if (bad || good) {
        ({ stdout, stderr } = await execFileP('git', ['bisect', bad ? 'bad' : 'good', (bad || good)!], { cwd: repoPath }));
      }
    }

    const output = `${stdout}\n${stderr}`;

    const state = await getBisectState(repoPath);
    const stepMatch = output.match(/Bisecting:\s*([^\n]+)/i);
    if (stepMatch) {
      state.stepInfo = stepMatch[0];
    }

    return { ok: true, state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function stepBisect(
  repoPath: string,
  verdict: 'good' | 'bad' | 'skip'
): Promise<{ ok: boolean; state?: BisectState; error?: string }> {
  try {
    if (!await checkIsBisecting(repoPath)) throw new Error('No bisect session is active.');
    let stdout = '';
    let stderr = '';
    try {
      ({ stdout, stderr } = await execFileP('git', ['bisect', verdict], { cwd: repoPath }));
    } catch (err) {
      const failure = err as { code?: number; stdout?: string; stderr?: string };
      // Git exits 2 when skips prevent choosing a unique culprit; this is a result.
      if (failure.code !== 2 || !/first ['"]?bad['"]? commit could be any of/.test(failure.stdout || '')) throw err;
      stdout = failure.stdout || '';
      stderr = failure.stderr || '';
    }
    const output = `${stdout}\n${stderr}`;

    const state = await getBisectState(repoPath);
    const stepMatch = output.match(/Bisecting:\s*([^\n]+)/i);
    if (stepMatch) {
      state.stepInfo = stepMatch[0];
    }

    const firstBadMatch = output.match(/([a-f0-9]{40})\s+is the first bad commit/i);
    if (firstBadMatch) {
      const culpritHash = firstBadMatch[1];
      await withGit(repoPath, async (git) => {
        const culpritOut = await git.raw(['log', '-1', '--format=%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%ci', culpritHash]);
        const [cH, cShort, cMsg, cBody, cAuthor, cEmail, cDate] = culpritOut.trim().split('\0');
        state.culpritCommit = {
          hash: cH,
          shortHash: cShort,
          message: cMsg,
          body: cBody || '',
          authorName: cAuthor,
          authorEmail: cEmail,
          date: cDate
        };
      });
    }

    return { ok: true, state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function resetBisect(repoPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await execFileP('git', ['bisect', 'reset'], { cwd: repoPath });
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
