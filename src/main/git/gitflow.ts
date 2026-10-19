import { withGit } from './core';
import { GitFlowConfig, GitFlowStartParams, GitFlowFinishParams } from '../../shared/types';

export async function getGitFlowConfig(repoPath: string): Promise<GitFlowConfig> {
  return withGit(repoPath, async (git) => {
    const branches = await git.branchLocal();
    const branchList = branches.all;

    // Detect master/main branch
    let masterBranch = (await git.getConfig('gitflow.branch.master')).value || '';
    if (!masterBranch) {
      if (branchList.includes('main')) masterBranch = 'main';
      else if (branchList.includes('master')) masterBranch = 'master';
      else masterBranch = branchList[0] || 'main';
    }

    // Detect develop branch
    let developBranch = (await git.getConfig('gitflow.branch.develop')).value || '';
    if (!developBranch) {
      if (branchList.includes('develop')) developBranch = 'develop';
      else if (branchList.includes('dev')) developBranch = 'dev';
      else developBranch = 'develop';
    }

    const featurePrefix = (await git.getConfig('gitflow.prefix.feature')).value || 'feature/';
    const releasePrefix = (await git.getConfig('gitflow.prefix.release')).value || 'release/';
    const hotfixPrefix = (await git.getConfig('gitflow.prefix.hotfix')).value || 'hotfix/';
    const bugfixPrefix = (await git.getConfig('gitflow.prefix.bugfix')).value || 'bugfix/';
    const supportPrefix = (await git.getConfig('gitflow.prefix.support')).value || 'support/';
    const versionTagPrefix = (await git.getConfig('gitflow.prefix.versiontag')).value ?? 'v';

    const hasConfiguredMaster = Boolean((await git.getConfig('gitflow.branch.master')).value);
    const hasDevelopBranch = branchList.includes(developBranch);
    const initialized = hasDevelopBranch || hasConfiguredMaster;

    return {
      initialized,
      masterBranch,
      developBranch,
      featurePrefix,
      releasePrefix,
      hotfixPrefix,
      bugfixPrefix,
      supportPrefix,
      versionTagPrefix
    };
  });
}

export async function initGitFlow(
  repoPath: string,
  config?: Partial<GitFlowConfig>
): Promise<{ ok: boolean; error?: string }> {
  return withGit(repoPath, async (git) => {
    const branches = await git.branchLocal();
    const branchList = branches.all;

    const master = config?.masterBranch || (branchList.includes('main') ? 'main' : 'master');
    const develop = config?.developBranch || 'develop';
    const featurePrefix = config?.featurePrefix || 'feature/';
    const releasePrefix = config?.releasePrefix || 'release/';
    const hotfixPrefix = config?.hotfixPrefix || 'hotfix/';
    const bugfixPrefix = config?.bugfixPrefix || 'bugfix/';
    const supportPrefix = config?.supportPrefix || 'support/';
    const versionTagPrefix = config?.versionTagPrefix !== undefined ? config.versionTagPrefix : 'v';

    // Ensure master branch exists
    if (!branchList.includes(master)) {
      if (branchList.length > 0) {
        await git.checkoutBranch(master, branchList[0]);
      } else {
        await git.checkoutLocalBranch(master);
      }
    }

    // Ensure develop branch exists
    if (!branchList.includes(develop)) {
      await git.checkoutBranch(develop, master);
    } else {
      await git.checkout(develop);
    }

    // Save git config entries
    await git.addConfig('gitflow.branch.master', master, false, 'local');
    await git.addConfig('gitflow.branch.develop', develop, false, 'local');
    await git.addConfig('gitflow.prefix.feature', featurePrefix, false, 'local');
    await git.addConfig('gitflow.prefix.release', releasePrefix, false, 'local');
    await git.addConfig('gitflow.prefix.hotfix', hotfixPrefix, false, 'local');
    await git.addConfig('gitflow.prefix.bugfix', bugfixPrefix, false, 'local');
    await git.addConfig('gitflow.prefix.support', supportPrefix, false, 'local');
    await git.addConfig('gitflow.prefix.versiontag', versionTagPrefix, false, 'local');

    return { ok: true };
  });
}

export async function startGitFlowBranch(
  repoPath: string,
  params: GitFlowStartParams
): Promise<{ ok: boolean; branchName?: string; error?: string }> {
  return withGit(repoPath, async (git) => {
    const cfg = await getGitFlowConfig(repoPath);
    let prefix = cfg.featurePrefix;
    let base = params.baseBranch || cfg.developBranch;

    if (params.type === 'feature') {
      prefix = cfg.featurePrefix;
      base = params.baseBranch || cfg.developBranch;
    } else if (params.type === 'release') {
      prefix = cfg.releasePrefix;
      base = params.baseBranch || cfg.developBranch;
    } else if (params.type === 'hotfix') {
      prefix = cfg.hotfixPrefix;
      base = params.baseBranch || cfg.masterBranch;
    } else if (params.type === 'bugfix') {
      prefix = cfg.bugfixPrefix;
      base = params.baseBranch || cfg.developBranch;
    } else if (params.type === 'support') {
      prefix = cfg.supportPrefix;
      base = params.baseBranch || cfg.masterBranch;
    }

    // Strip prefix if user typed it in
    let cleanName = params.name.trim();
    if (cleanName.startsWith(prefix)) {
      cleanName = cleanName.slice(prefix.length);
    }
    // Clean characters
    cleanName = cleanName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._\-/]/g, '');

    if (!cleanName) {
      return { ok: false, error: 'Please enter a valid branch name' };
    }

    const fullBranchName = `${prefix}${cleanName}`;

    // Verify base branch exists or fallback
    const branches = await git.branchLocal();
    if (!branches.all.includes(base)) {
      base = branches.current || branches.all[0] || 'HEAD';
    }

    // Checkout base and pull if tracked, then create new branch
    await git.checkout(base);
    await git.checkoutBranch(fullBranchName, base);

    return { ok: true, branchName: fullBranchName };
  });
}

export async function finishGitFlowBranch(
  repoPath: string,
  params: GitFlowFinishParams
): Promise<{ ok: boolean; error?: string }> {
  return withGit(repoPath, async (git) => {
    const cfg = await getGitFlowConfig(repoPath);
    const branchName = params.branchName.trim();
    const branches = await git.branchLocal();

    if (!branches.all.includes(branchName)) {
      return { ok: false, error: `Branch "${branchName}" does not exist` };
    }

    // Determine type
    const isFeature = branchName.startsWith(cfg.featurePrefix);
    const isRelease = branchName.startsWith(cfg.releasePrefix);
    const isHotfix = branchName.startsWith(cfg.hotfixPrefix);
    const isBugfix = branchName.startsWith(cfg.bugfixPrefix);
    const isSupport = branchName.startsWith(cfg.supportPrefix);

    if (isFeature || isBugfix) {
      const target = cfg.developBranch;
      // Checkout develop
      await git.checkout(target);
      // Merge branch
      await git.merge([branchName, '--no-ff', '-m', `Merge branch '${branchName}' into ${target}`]);
      // Delete branch if requested
      if (!params.keepBranch) {
        await git.deleteLocalBranch(branchName, true);
      }
      return { ok: true };
    }

    if (isRelease) {
      const version = branchName.slice(cfg.releasePrefix.length);
      const tagName = `${cfg.versionTagPrefix}${version}`;
      const master = cfg.masterBranch;
      const develop = cfg.developBranch;

      // 1. Merge into master
      await git.checkout(master);
      await git.merge([branchName, '--no-ff', '-m', `Merge branch '${branchName}' into ${master}`]);

      // 2. Tag release
      const tagMsg = params.tagMessage || `Release ${version}`;
      try {
        await git.addAnnotatedTag(tagName, tagMsg);
      } catch {
        // Continue if tag already exists or fails
      }

      // 3. Merge into develop
      if (branches.all.includes(develop)) {
        await git.checkout(develop);
        await git.merge([branchName, '--no-ff', '-m', `Merge branch '${branchName}' into ${develop}`]);
      }

      // 4. Delete release branch if requested
      if (!params.keepBranch) {
        await git.deleteLocalBranch(branchName, true);
      }

      return { ok: true };
    }

    if (isHotfix) {
      const name = branchName.slice(cfg.hotfixPrefix.length);
      const tagName = `${cfg.versionTagPrefix}${name}`;
      const master = cfg.masterBranch;
      const develop = cfg.developBranch;

      // 1. Merge into master
      await git.checkout(master);
      await git.merge([branchName, '--no-ff', '-m', `Merge branch '${branchName}' into ${master}`]);

      // 2. Tag hotfix
      const tagMsg = params.tagMessage || `Hotfix ${name}`;
      try {
        await git.addAnnotatedTag(tagName, tagMsg);
      } catch {
        // Continue if tag already exists or fails
      }

      // 3. Merge into develop
      if (branches.all.includes(develop)) {
        await git.checkout(develop);
        await git.merge([branchName, '--no-ff', '-m', `Merge branch '${branchName}' into ${develop}`]);
      }

      // 4. Delete hotfix branch if requested
      if (!params.keepBranch) {
        await git.deleteLocalBranch(branchName, true);
      }

      return { ok: true };
    }

    if (isSupport) {
      // Support branches stay alive off master
      return { ok: true };
    }

    // Default fallback: merge into develop or current
    const target = branches.all.includes(cfg.developBranch) ? cfg.developBranch : cfg.masterBranch;
    await git.checkout(target);
    await git.merge([branchName, '--no-ff', '-m', `Merge branch '${branchName}' into ${target}`]);
    if (!params.keepBranch) {
      await git.deleteLocalBranch(branchName, true);
    }

    return { ok: true };
  });
}
