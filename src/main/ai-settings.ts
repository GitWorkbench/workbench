import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AiCommitConfig, AiPreferences, AiSettingsSnapshot } from '../shared/types';
import { validateAiPreferences, aiCredentialScope, OFFLINE_AI } from '../shared/ai-preferences';
import { readAiKey, writeAiKey } from './git/provider-credentials';

const settingsFile = () => path.join(app.getPath('userData'), 'ai-settings.json');

export function readAiPreferences(): AiPreferences | null {
  const file = settingsFile();
  if (!fs.existsSync(file)) return null;
  try { return validateAiPreferences(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { throw new Error('Saved AI settings could not be read. Your encrypted keys have not been removed.'); }
}

export function getAiSettings(target?: unknown): AiSettingsSnapshot {
  const config = target === undefined ? readAiPreferences() : validateAiPreferences(target);
  return { config, hasApiKey: !!config && config.provider !== 'local' && !!readAiKey(aiCredentialScope(config)) };
}

export function saveAiSettings(input: unknown, key?: unknown, importing = false): AiSettingsSnapshot {
  const config = validateAiPreferences(input);
  const previous = importing ? readAiPreferences() : null;
  if (key !== undefined) {
    if (typeof key !== 'string' || key.length > 8192 || /[\r\n\0]/.test(key)) throw new Error('Enter a valid API key.');
    if (config.provider === 'local') throw new Error('Offline commit drafts do not use an API key.');
    if (!importing || !readAiKey(aiCredentialScope(config))) writeAiKey(aiCredentialScope(config), key.trim());
  }
  // Store only nonsecret preferences here. Updating or switching provider never deletes other keys.
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(previous || config), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
  return getAiSettings();
}

export function resolveAiSettings(input: Partial<AiCommitConfig> = {}): AiCommitConfig {
  const config = validateAiPreferences({ ...(input.provider ? { ...OFFLINE_AI, model: '' } : readAiPreferences() || OFFLINE_AI), ...input });
  return { ...config, apiKey: config.provider === 'local' ? '' : input.apiKey?.trim() || readAiKey(aiCredentialScope(config)) };
}

const setupFile = () => path.join(app.getPath('userData'), 'setup-completed');
export function getSetupComplete(): boolean { return fs.existsSync(setupFile()); }
export function completeSetup(): void {
  fs.mkdirSync(path.dirname(setupFile()), { recursive: true });
  fs.writeFileSync(setupFile(), '1', { mode: 0o600 });
}
