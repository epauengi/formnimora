import type { Answer, APISettings, FillSettings, Question } from '../types';
import { requireEndpointPermission } from '../storage/settings';
import { buildPrompt, parseAnswer, type ChatMessage } from './prompt';
import { endpoint, validateAPI, validateFill, validateQuestion } from './validation';

export interface AIAdapter {
  complete(messages: ChatMessage[], settings: APISettings, signal?: AbortSignal): Promise<string>;
}

interface Dependencies {
  fetch?: typeof fetch;
  checkPermission?: (baseUrl: string) => Promise<void>;
}

function abortError(): Error { return new Error('AI request cancelled.'); }

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const cancel = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

async function readContent(response: Response): Promise<string> {
  if (!response.body) throw new Error('API returned no response body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128000) throw new Error('API response is too large.');
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  let data: unknown;
  try { data = JSON.parse(body); } catch { throw new Error('API returned invalid JSON.'); }
  const content = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim() || content.length > 16000) throw new Error('API returned empty or oversized content.');
  return content;
}

export function createChatAdapter(dependencies: Dependencies = {}): AIAdapter {
  const request: typeof fetch = dependencies.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const checkPermission = dependencies.checkPermission ?? requireEndpointPermission;
  return {
    async complete(messages, input, signal) {
      const settings = validateAPI(input);
      if (!settings.apiKey) throw new Error('Configure an API key first.');
      if (signal?.aborted) throw abortError();
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, settings.timeout);
      try {
        for (let attempt = 0; attempt <= settings.retryCount; attempt++) {
          await checkPermission(settings.baseUrl);
          if (controller.signal.aborted) throw abortError();
          let response: Response;
          try {
            response = await request(endpoint(settings.baseUrl).href, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
              body: JSON.stringify({ model: settings.model, messages, temperature: settings.temperature, max_tokens: settings.maxTokens }),
              signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
            });
          } catch {
            if (controller.signal.aborted) throw abortError();
            if (attempt === settings.retryCount) throw new Error('Cannot connect to API endpoint.');
            await pause(250 * 2 ** attempt, controller.signal);
            continue;
          }
          if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            if ((response.status === 429 || (response.status >= 500 && response.status <= 599)) && attempt < settings.retryCount) {
              await pause(250 * 2 ** attempt, controller.signal);
              continue;
            }
            throw new Error(response.status === 401 || response.status === 403 ? 'API authentication or access denied.' : `API request failed (HTTP ${response.status}).`);
          }
          return await readContent(response);
        }
        throw new Error('API request failed.');
      } catch (error) {
        if (controller.signal.aborted) throw new Error(timedOut ? 'AI request timed out.' : 'AI request cancelled.');
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
    },
  };
}

export async function answerQuestion(adapter: AIAdapter, questionInput: Question, fillInput: FillSettings, apiInput: APISettings, signal?: AbortSignal): Promise<Answer> {
  const question = validateQuestion(questionInput);
  const settings = validateFill(fillInput);
  const api = validateAPI(apiInput);
  if ((question.kind === 'text' || question.kind === 'paragraph') && !settings.aiText) throw new Error('Enable AI text answers first.');
  return parseAnswer(await adapter.complete(buildPrompt(question, settings, api), api, signal), question);
}

export async function testAPI(adapter: AIAdapter, api: APISettings, signal?: AbortSignal): Promise<string> {
  await adapter.complete([{ role: 'system', content: 'Reply with OK only.' }, { role: 'user', content: 'Connection test.' }], api, signal);
  // Do not expose model-generated text: a custom endpoint could echo credentials.
  return 'API connection successful.';
}
