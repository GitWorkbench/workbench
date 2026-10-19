import { afterAll } from 'vitest';
import { isolateGitEnvironment } from '../scripts/test-git-environment.cjs';

// A test repository must never inherit a developer's hooks, signing, aliases,
// credential prompts, or global Git configuration. Children inherit this too.
afterAll(isolateGitEnvironment());
