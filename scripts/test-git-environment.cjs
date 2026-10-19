const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Isolate Git in this test process and every subprocess it launches. */
function isolateGitEnvironment() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-workbench-test-hooks-')));
  const hooks = path.join(root, 'hooks');
  const config = path.join(root, 'gitconfig');
  fs.mkdirSync(hooks);
  // Git for Windows cannot read Node's \\.\nul device path as a config file.
  fs.writeFileSync(config, '');
  const previous = { ...process.env };
  const scoped = [
    'GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_NAMESPACE',
    'GIT_SHALLOW_FILE', 'GIT_REPLACE_REF_BASE', 'GIT_PAGER', 'PAGER',
    'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE',
    'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE'
  ];
  for (const name of scoped) delete process.env[name];
  const fixed = {
    GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: hooks,
    GIT_CONFIG_KEY_1: 'commit.gpgSign', GIT_CONFIG_VALUE_1: 'false',
    GIT_CONFIG_KEY_2: 'tag.gpgSign', GIT_CONFIG_VALUE_2: 'false'
  };
  Object.assign(process.env, fixed);
  return () => {
    for (const name of [...scoped, ...Object.keys(fixed)]) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    fs.rmSync(root, { recursive: true, force: true });
  };
}
module.exports = { isolateGitEnvironment };
