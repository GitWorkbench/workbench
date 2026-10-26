import type { AiPreferences } from './types';

export const AI_PROVIDERS = [
  { id: 'local', name: 'Smart Rule-Based', model: 'heuristic', detail: 'Offline commit drafts without an AI model or API key.' },
  { id: 'pollinations', name: 'Pollinations.ai', model: 'openai', detail: 'Hosted models; requires your API key.' },
  { id: 'openrouter', name: 'OpenRouter', model: 'openrouter/free', detail: 'Choose a model available to your account.' },
  { id: 'groq', name: 'Groq Cloud', model: 'llama-3.3-70b-versatile', detail: 'Hosted inference with your Groq API key.' },
  { id: 'gemini', name: 'Google Gemini', model: 'gemini-2.5-flash', detail: 'Google-hosted models with your API key.' },
  { id: 'ollama', name: 'Ollama Local', model: 'qwen2.5-coder:7b', detail: 'Use a model installed on your own Ollama server.' },
  { id: 'custom', name: 'Custom Endpoint', model: '', detail: 'Connect an OpenAI-compatible server.' }
] as const;

export const OFFLINE_AI: AiPreferences = { provider: 'local', model: 'heuristic', endpoint: '', promptStyle: 'conventional' };

export function validateAiPreferences(value: unknown): AiPreferences {
  if (!value || typeof value !== 'object') throw new Error('Choose valid AI settings.');
  const config = value as Record<string, unknown>;
  const provider = AI_PROVIDERS.find(item => item.id === config.provider);
  if (!provider || typeof config.model !== 'string' || config.model.length > 200 || typeof config.endpoint !== 'string' || config.endpoint.length > 2048 ||
      !['conventional', 'simple', 'detailed', 'gitmoji'].includes(String(config.promptStyle))) throw new Error('Choose valid AI settings.');
  let endpoint = '';
  if (provider.id === 'custom' || provider.id === 'ollama') {
    let url: URL;
    try { url = new URL(config.endpoint.trim() || (provider.id === 'ollama' ? 'http://127.0.0.1:11434/v1' : '')); }
    catch { throw new Error('Enter a valid AI endpoint URL.'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
      throw new Error('Use HTTPS for remote AI endpoints, or HTTP on localhost. Keep credentials out of the URL.');
    }
    endpoint = url.href.replace(/\/+$/, '');
  }
  return { provider: provider.id, model: config.model.trim(), endpoint, promptStyle: config.promptStyle as AiPreferences['promptStyle'] };
}

export function aiCredentialScope(config: AiPreferences): string {
  return `${config.provider}:${config.endpoint}`;
}
