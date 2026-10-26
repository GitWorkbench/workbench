import * as ai from '../shared/ai';
import { resolveAiSettings } from './ai-settings';
import type { AiCommitParams } from '../shared/ai';

export { generateLocalCommitMessage } from '../shared/ai';
export async function generateCommitMessage(params: AiCommitParams) {
  try { return await ai.generateCommitMessage({ ...params, ...resolveAiSettings(params) }); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not load AI credentials.' }; }
}
export async function explainCodeChanges(diff: string, params?: Partial<AiCommitParams>) {
  try { return await ai.explainCodeChanges(diff, resolveAiSettings(params)); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not load AI credentials.' }; }
}
