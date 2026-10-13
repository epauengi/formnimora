import { answerQuestion, createChatAdapter, testAPI } from '../ai/adapter';
import { object, validateFill, validateQuestion, validateRequestId } from '../ai/validation';
import { deleteKey, getAPI, getFill, saveAPI, saveFill, secureStorage } from '../storage/settings';
import type { Result } from '../types';
import { handleRunMessage, isRunAction } from './form-run';

const adapter = createChatAdapter();
const active = new Map<number, Map<string, AbortController>>();
let concurrent = 0;
const storageReady = secureStorage();
// Keep startup failures handled; requests still fail closed when awaiting this promise.
void storageReady.catch(() => {});

function trustedUI(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id;
  } catch { return false; }
}

function contentTab(sender: chrome.runtime.MessageSender): number | undefined {
  if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id) || !sender.url) return;
  try {
    const url = new URL(sender.url);
    if (url.protocol === 'https:' && url.hostname === 'docs.google.com' && !url.port && /^\/forms\/(?:[^/]+\/)+(?:viewform|formResponse)\/?$/.test(url.pathname)) return sender.tab!.id;
  } catch { /* Reject malformed sender URLs. */ }
}

function cancelTab(tab: number): void {
  for (const controller of active.get(tab)?.values() ?? []) controller.abort();
}

// Only our fixed validation messages can cross the messaging boundary, never raw provider/storage errors.
const safeErrors = /^(?:Invalid (?:payload|text length|numeric setting|boolean setting|setting|API URL|API key|model|rule answers|choices|grid rows|row ID|question structure|request ID)\.|Use HTTPS, or HTTP on localhost only; no credentials, query or fragment\.|Too many rules\.|Rules are too large\.|Duplicate (?:choice|row) IDs\.|Question (?:has no choices|is too large)\.|Grant permission for the API endpoint in extension settings\.|Configure an API key first\.|Enable AI text answers first\.|AI (?:request (?:cancelled|timed out)|returned (?:an invalid selection|unknown or duplicate choice IDs|empty or oversized content|invalid answer text|invalid grid data|unknown or missing rows|missing rows|invalid choice data)|did not return a JSON object)\.|API (?:returned (?:no response body|invalid JSON|empty or oversized content)|response is too large|authentication or access denied|request failed(?: \(HTTP \d{3}\))?)\.|Cannot connect to API endpoint\.|(?:Untrusted sender|Unknown action|Too many active AI requests|Duplicate request ID)\.)$/;

export async function handleMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<Result<unknown>> {
  try {
    const data = object(message);
    if (isRunAction(data.type)) return await handleRunMessage(data, sender);
    const ui = trustedUI(sender);
    const tab = ui ? undefined : contentTab(sender);
    if (!ui && tab === undefined) throw new Error('Untrusted sender.');
    if (data.type === 'CANCEL_AI') {
      if (tab === undefined) throw new Error('Untrusted sender.');
      cancelTab(tab);
      return { ok: true, data: true };
    }
    if (data.type === 'AI_ANSWER') {
      if (tab === undefined) throw new Error('Untrusted sender.');
      const requestId = validateRequestId(data.requestId);
      const question = validateQuestion(data.question);
      const settings = validateFill(data.settings);
      const requests = active.get(tab) ?? new Map<string, AbortController>();
      if (requests.has(requestId)) throw new Error('Duplicate request ID.');
      if (concurrent >= 4 || requests.size >= 2) throw new Error('Too many active AI requests.');
      const controller = new AbortController();
      requests.set(requestId, controller);
      active.set(tab, requests);
      concurrent++;
      try {
        await storageReady;
        const api = await getAPI();
        const answer = await answerQuestion(adapter, question, settings, api, controller.signal);
        if (controller.signal.aborted) throw new Error('AI request cancelled.');
        // A custom server must not be able to reflect the stored secret into a content-script response.
        if (api.apiKey && JSON.stringify(answer).includes(api.apiKey)) throw new Error('API request failed.');
        return { ok: true, data: answer };
      } finally {
        requests.delete(requestId);
        if (!requests.size) active.delete(tab);
        concurrent--;
      }
    }
    if (data.type === 'GET_FORM_FILL') {
      if (tab === undefined || sender.frameId !== 0) throw new Error('Untrusted sender.');
      await storageReady;
      return { ok: true, data: await getFill() };
    }
    if (!ui) throw new Error('Untrusted sender.');
    await storageReady;
    switch (data.type) {
      case 'GET_API': return { ok: true, data: await getAPI() };
      case 'SAVE_API': return { ok: true, data: await saveAPI(data.settings) };
      case 'DELETE_KEY': return { ok: true, data: await deleteKey() };
      case 'GET_FILL': return { ok: true, data: await getFill() };
      case 'SAVE_FILL': return { ok: true, data: await saveFill(data.settings) };
      case 'TEST_API': {
        if (concurrent >= 4) throw new Error('Too many active AI requests.');
        concurrent++;
        try { return { ok: true, data: await testAPI(adapter, await getAPI()) }; }
        finally { concurrent--; }
      }
      default: throw new Error('Unknown action.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { ok: false, error: safeErrors.test(message) ? message : 'Operation failed. Check extension settings and permissions.' };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void handleMessage(message, sender).then(sendResponse);
  return true;
});
chrome.tabs.onRemoved.addListener(cancelTab);
