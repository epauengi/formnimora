import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_FILL } from '../src/types';

const stored: Record<string, unknown> = {};
const updated: ((tab: number, change: chrome.tabs.TabChangeInfo, current: chrome.tabs.Tab) => void)[] = [];
const removed: ((tab: number) => void)[] = [];
let secured = false;
Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
  runtime: { id: 'extension' },
  storage: { session: {
    setAccessLevel: async (options: { accessLevel: string }) => { assert.equal(options.accessLevel, 'TRUSTED_CONTEXTS'); secured = true; },
    get: async (key: string) => { assert.ok(secured); return structuredClone({ [key]: stored[key] }); },
    set: async (values: Record<string, unknown>) => { assert.ok(secured); Object.assign(stored, structuredClone(values)); },
    remove: async (key: string) => { delete stored[key]; },
  } },
  tabs: {
    onUpdated: { addListener: (listener: typeof updated[number]) => updated.push(listener) },
    onRemoved: { addListener: (listener: typeof removed[number]) => removed.push(listener) },
  },
} });
const { handleRunMessage, clearRemovedRun, normalizeRunState, formIdentity } = await import('../src/background/form-run');
const url = 'https://docs.google.com/forms/d/e/form-id/viewform';
const sender = { id: 'extension', frameId: 0, documentId: 'document-one', tab: { id: 7 }, url } as chrome.runtime.MessageSender;
const fill = { ...DEFAULT_FILL, autoNext: true, autoSubmit: true, preview: false };
const state = { phase: 'filling', completed: 3, failed: 0, page: 2, logs: ['private question: private answer'], questions: [{ title: 'private question' }], answers: [{ text: 'private answer' }] };
const save = () => handleRunMessage({ type: 'SAVE_RUN', settings: { ...fill, apiKey: 'private-api-key' }, state }, sender);
const resume = (changes: Partial<chrome.runtime.MessageSender> = {}) => handleRunMessage({ type: 'RESUME_RUN' }, { ...sender, ...changes });
const checkpoint = () => stored['form-run:7'] as Record<string, unknown>;

test('checkpoint security, normalization and document-bound at-most-once resume', async () => {
  assert.equal(updated.length, 0);
  assert.equal(removed.length, 1);
  assert.deepEqual(await save(), { ok: true, data: true });
  const serialized = JSON.stringify(stored);
  for (const secret of ['private question', 'private answer', 'private-api-key']) assert.ok(!serialized.includes(secret));
  assert.deepEqual(await resume(), { ok: true, data: null });
  assert.ok(checkpoint());
  const results = await Promise.all([resume({ documentId: 'document-two' }), resume({ documentId: 'document-two' })]);
  assert.deepEqual(results[0], { ok: true, data: { settings: fill, state: { phase: 'planning', questions: [], answers: [], completed: 3, failed: 0, page: 2, logs: [], submitted: 0, target: 1 }, resumeAfterConfirm: false } });
  assert.deepEqual(results[1], { ok: true, data: null });
  assert.equal(checkpoint(), undefined);
  assert.deepEqual(await resume({ documentId: 'document-three' }), { ok: true, data: null });
});

test('stale document CLEAR_RUN preserves the newer document checkpoint', async () => {
  await save();
  assert.ok((await resume({ documentId: 'document-two' })).data);
  const newerSender = { ...sender, documentId: 'document-two' };
  assert.deepEqual(await handleRunMessage({ type: 'SAVE_RUN', settings: fill, state }, newerSender), { ok: true, data: true });
  const newerCheckpoint = structuredClone(checkpoint());
  assert.deepEqual(await handleRunMessage({ type: 'CLEAR_RUN' }, sender), { ok: true, data: true });
  assert.deepEqual(checkpoint(), newerCheckpoint);
  const results = await Promise.all([resume({ documentId: 'document-three' }), resume({ documentId: 'document-three' })]);
  assert.equal(results[0].ok, true);
  assert.ok(results[0].data);
  assert.deepEqual(results[1], { ok: true, data: null });
  assert.equal(checkpoint(), undefined);
});

test('same form accepts response URL, rejects other form/origin and clears pending', async () => {
  await save();
  const result = await resume({ documentId: 'document-two', url: url.replace('viewform', 'formResponse') + '?pageHistory=0,1' });
  assert.equal(result.ok, true);
  assert.ok(result.data);
  await save();
  assert.deepEqual(await resume({ documentId: 'document-two', url: url.replace('form-id', 'other-form') }), { ok: true, data: null });
  assert.equal(checkpoint(), undefined);
  await save();
  assert.equal((await resume({ documentId: 'document-two', url: url.replace('docs.google.com', 'evil.test') })).ok, false);
  assert.equal(checkpoint(), undefined);
  for (const invalid of [url.replace('https:', 'http:'), url.replace('docs.google.com', 'docs.google.com.evil.test'), url.replace('/viewform', '/edit'), 'https://docs.google.com/forms/d/e/form-id/extra/viewform']) assert.equal(formIdentity(invalid), undefined);
});

test('expired and future checkpoints never resume or inject', async () => {
  for (const savedAt of [Date.now() - 120_001, Date.now() + 60_000]) {
    await save();
    checkpoint().savedAt = savedAt;
    assert.deepEqual(await resume({ documentId: 'document-two' }), { ok: true, data: null });
    assert.equal(checkpoint(), undefined);
  }
});

test('reject untrusted sources, unsafe settings and invalid page/counters; bound state', async () => {
  await save();
  for (const changes of [{ id: 'other' }, { frameId: 1 }, { frameId: undefined }, { documentId: undefined }, { tab: undefined }]) {
    assert.equal((await resume(changes)).ok, false);
    assert.ok(checkpoint());
  }
  for (const page of [0, 21, 1.5, NaN]) assert.throws(() => normalizeRunState({ ...state, page }));
  for (const completed of [-1, 0.5, Infinity, '3']) assert.throws(() => normalizeRunState({ ...state, completed }));
  assert.equal(normalizeRunState({ ...state, completed: 100_000 }).completed, 20_000);
  assert.equal(normalizeRunState({ ...state, logs: Array(100).fill('private') }).logs.length, 0);
  for (const settings of [{ ...fill, autoNext: false }, { ...fill, preview: true }, { ...fill, delay: -1 }]) {
    assert.equal((await handleRunMessage({ type: 'SAVE_RUN', settings, state }, sender)).ok, false);
  }
  assert.deepEqual(await handleRunMessage({ type: 'CLEAR_RUN' }, sender), { ok: true, data: true });
  assert.equal(checkpoint(), undefined);
});

test('no navigation-event injection; closing a tab removes pending run', async () => {
  await save();
  assert.equal(updated.length, 0);
  await clearRemovedRun(7);
  assert.equal(checkpoint(), undefined);
});

test('storage errors are sanitized and cannot expose keys', async () => {
  const original = chrome.storage.session.set;
  chrome.storage.session.set = async () => { throw new Error('private-api-key storage failure'); };
  try {
    assert.deepEqual(await save(), { ok: false, error: 'Run checkpoint operation failed.' });
  } finally { chrome.storage.session.set = original; }
});
