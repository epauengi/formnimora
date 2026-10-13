import { object, validateFill } from '../ai/validation';
import type { EngineState, FillSettings, Result } from '../types';

const TTL = 120_000;
const key = (tab: number) => `form-run:${tab}`;
const ready = chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
void ready.catch(() => {});
const pending = new Map<number, Promise<unknown>>();

interface Checkpoint {
  form: string;
  documentId: string;
  savedAt: number;
  settings: FillSettings;
  state: EngineState;
}

export function formIdentity(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://docs.google.com' || url.username || url.password) return;
    if (!/^\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?[\w-]+\/(?:viewform|formResponse)\/?$/.test(url.pathname)) return;
    return url.origin + url.pathname.replace(/(?:viewform|formResponse)\/?$/, '');
  } catch { return; }
}

export function normalizeRunState(value: unknown): EngineState {
  const state = object(value);
  const count = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid run checkpoint.');
    return Math.min(value, 20_000);
  };
  if (!Number.isInteger(state.page) || (state.page as number) < 1 || (state.page as number) > 20 ||
      !['planning', 'filling'].includes(String(state.phase))) throw new Error('Invalid run checkpoint.');
  // Logs can contain question titles/provider answers. Persist counters only, never question/answer text.
  return { phase: 'planning', questions: [], answers: [], completed: count(state.completed), failed: count(state.failed), page: state.page as number, logs: [] };
}

function settings(value: unknown): FillSettings {
  const fill = validateFill(value);
  if (!fill.autoNext || (fill.autoSubmit && fill.preview)) throw new Error('Invalid run checkpoint.');
  return fill;
}

function serial<T>(tab: number, action: () => Promise<T>): Promise<T> {
  const result = (pending.get(tab) ?? Promise.resolve()).catch(() => {}).then(action);
  pending.set(tab, result);
  void result.finally(() => { if (pending.get(tab) === result) pending.delete(tab); }).catch(() => {});
  return result;
}

async function remove(tab: number): Promise<void> {
  await ready;
  await chrome.storage.session.remove(key(tab));
}

async function read(tab: number, form: string | undefined): Promise<Checkpoint | null> {
  await ready;
  const value = (await chrome.storage.session.get(key(tab)))[key(tab)];
  if (value === undefined) return null;
  try {
    const checkpoint = object(value);
    if (!form || checkpoint.form !== form || typeof checkpoint.documentId !== 'string' || !checkpoint.documentId ||
        typeof checkpoint.savedAt !== 'number' || !Number.isSafeInteger(checkpoint.savedAt) ||
        checkpoint.savedAt > Date.now() || Date.now() - checkpoint.savedAt >= TTL) throw new Error('Invalid run checkpoint.');
    return { form, documentId: checkpoint.documentId, savedAt: checkpoint.savedAt, settings: settings(checkpoint.settings), state: normalizeRunState(checkpoint.state) };
  } catch {
    await remove(tab);
    return null;
  }
}

export function isRunAction(value: unknown): boolean {
  return value === 'SAVE_RUN' || value === 'RESUME_RUN' || value === 'CLEAR_RUN';
}

export async function handleRunMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<Result<boolean | { settings: FillSettings; state: EngineState } | null>> {
  try {
    const data = object(message);
    const tab = sender.tab?.id;
    const form = sender.url ? formIdentity(sender.url) : undefined;
    if (sender.id !== chrome.runtime.id || !Number.isInteger(tab) || (tab as number) < 0 || sender.frameId !== 0 ||
        typeof sender.documentId !== 'string' || !sender.documentId || sender.documentId.length > 128) throw new Error('Untrusted sender.');
    if (!form) {
      await serial(tab!, () => remove(tab!));
      throw new Error('Untrusted sender.');
    }
    return await serial(tab!, async () => {
      await ready;
      switch (data.type) {
        case 'SAVE_RUN': {
          const checkpoint: Checkpoint = { form, documentId: sender.documentId!, savedAt: Date.now(), settings: settings(data.settings), state: normalizeRunState(data.state) };
          await chrome.storage.session.set({ [key(tab!)]: checkpoint });
          return { ok: true, data: true };
        }
        case 'RESUME_RUN': {
          const checkpoint = await read(tab!, form);
          if (!checkpoint || checkpoint.documentId === sender.documentId) return { ok: true, data: null };
          // Consume before replying, including concurrent init messages: no duplicate resume or submit.
          await remove(tab!);
          return { ok: true, data: { settings: checkpoint.settings, state: checkpoint.state } };
        }
        case 'CLEAR_RUN': {
          const checkpoint = (await chrome.storage.session.get(key(tab!)))[key(tab!)];
          if (checkpoint?.documentId === sender.documentId) await remove(tab!);
          return { ok: true, data: true };
        }
        default: throw new Error('Unknown action.');
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { ok: false, error: ['Untrusted sender.', 'Unknown action.', 'Invalid run checkpoint.'].includes(message) ? message : 'Run checkpoint operation failed.' };
  }
}

// Chrome's manifest content script runs on every Forms document. No tabs.onUpdated
// injection: tab.url may be absent during navigation with activeTab-only access.

export function clearRemovedRun(tab: number): Promise<void> {
  return serial(tab, () => remove(tab));
}

chrome.tabs.onRemoved.addListener(tab => { void clearRemovedRun(tab).catch(() => {}); });
