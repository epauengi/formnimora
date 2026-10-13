import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerQuestion, createChatAdapter, testAPI } from '../src/ai/adapter';
import { buildPrompt, parseAnswer } from '../src/ai/prompt';
import { endpoint, validateAPI, validateFill, validateQuestion } from '../src/ai/validation';
import { DEFAULT_API, DEFAULT_FILL, type Question } from '../src/types';

const api = { ...DEFAULT_API, apiKey: 'secret-test-key', retryCount: 0 };
const fill = { ...DEFAULT_FILL, mode: 'ai' as const, aiText: true };
const question: Question = {
  id: 'q1', title: 'Choose one', kind: 'radio', choices: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }],
  rows: [], answered: false, required: true,
};
const response = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const allowed = async () => {};

test('endpoint normalization and HTTPS trust boundary', () => {
  assert.equal(endpoint('https://api.example.com/v1/').href, 'https://api.example.com/v1/chat/completions');
  assert.equal(endpoint('https://api.example.com/v1/chat/completions/').href, 'https://api.example.com/v1/chat/completions');
  assert.equal(endpoint('http://localhost:1234/v1').origin, 'http://localhost:1234');
  assert.equal(endpoint('http://127.0.0.1:1234/v1').protocol, 'http:');
  for (const url of ['http://example.com/v1', 'http://localhost.evil.com', 'https://user:password@example.com', 'https://example.com/?key=x', 'https://example.com/#x', 'file:///v1']) assert.throws(() => endpoint(url));
});

test('settings and question payloads are bounded and normalized', () => {
  assert.deepEqual(validateAPI(api), api);
  assert.throws(() => validateAPI({ ...api, timeout: 25001 }));
  assert.throws(() => validateAPI({ ...api, retryCount: 4 }));
  assert.throws(() => validateAPI({ ...api, temperature: NaN }));
  assert.throws(() => validateAPI({ ...api, apiKey: 'key\r\nHeader: x' }));
  assert.throws(() => validateAPI({ ...api, model: ' ' }));
  assert.throws(() => validateFill({ ...fill, personalContext: 'x'.repeat(8001) }));
  assert.throws(() => validateQuestion({ ...question, title: 'x'.repeat(8001) }));
  assert.throws(() => validateQuestion({ ...question, choices: Array.from({ length: 101 }, (_, i) => ({ id: `${i}`, label: '' })) }));
  assert.throws(() => validateQuestion({ ...question, choices: [question.choices[0], question.choices[0]] }));
  assert.throws(() => validateQuestion({ ...question, kind: 'unsupported' }));
  assert.deepEqual(validateQuestion({ ...question, previousAnswers: ['private'], form: 'entire form' }), question);
});

test('prompt contains only the current question and explicit personal context', () => {
  const settings = { ...fill, personalContext: 'My name is Sam.', rules: [{ contains: 'secret rule', answers: ['previous answer'] }] };
  const messages = buildPrompt(question, settings, api);
  const data = JSON.parse(messages[1].content);
  assert.deepEqual(Object.keys(data).sort(), ['additionalInstructions', 'personalContext', 'question']);
  assert.equal(data.personalContext, settings.personalContext);
  assert.equal(data.question.id, undefined);
  assert.ok(!JSON.stringify(messages).includes('previous answer'));
  assert.ok(messages[0].content.includes('Never fabricate personal information'));
  assert.ok(messages[0].content.includes('{"text":""}'));
});

test('strict JSON choice and text answers reject invalid IDs and empty transport content', () => {
  assert.deepEqual(parseAnswer('{"choices":["a"]}', question), { questionId: 'q1', choices: ['a'] });
  for (const content of ['', 'not json', '```json\n{"choices":["a"]}\n```', '{"choices":[]}', '{"choices":["a","b"]}', '{"choices":["unknown"]}', '{"choices":["a"],"extra":true}']) assert.throws(() => parseAnswer(content, question));
  const checkbox = { ...question, kind: 'checkbox' as const };
  assert.deepEqual(parseAnswer('{"choices":["a","b"]}', checkbox).choices, ['a', 'b']);
  assert.throws(() => parseAnswer('{"choices":["a","a"]}', checkbox));
  const text = { ...question, kind: 'text' as const, choices: [] };
  assert.deepEqual(parseAnswer('{"text":""}', text), { questionId: 'q1', text: '' });
  assert.deepEqual(parseAnswer('{"text":""}', question), { questionId: 'q1', text: '' });
  assert.equal(parseAnswer('{"text":" Answer "}', text).text, 'Answer');
  assert.throws(() => parseAnswer('{"text":"   "}', text));
  assert.throws(() => parseAnswer(JSON.stringify({ text: 'x'.repeat(8001) }), text));
});

test('grid selections are complete, unique and row-specific', () => {
  const grid: Question = { ...question, kind: 'radio-grid', choices: [], rows: [
    { id: 'r1', label: 'One', choices: [{ id: 'a', label: 'A' }] },
    { id: 'r2', label: 'Two', choices: [{ id: 'b', label: 'B' }, { id: 'c', label: 'C' }] },
  ] };
  assert.deepEqual(parseAnswer('{"rows":{"r1":["a"],"r2":["b"]}}', grid).rows, { r1: ['a'], r2: ['b'] });
  for (const content of ['{"rows":{"r1":["a"]}}', '{"rows":{"r1":["b"],"r2":["b"]}}', '{"rows":{"r1":["a"],"r2":["b","c"]}}', '{"rows":{"r1":["a"],"other":["b"]}}']) assert.throws(() => parseAnswer(content, grid));
  assert.deepEqual(parseAnswer('{"rows":{"r1":["a"],"r2":["b","c"]}}', { ...grid, kind: 'checkbox-grid' }).rows?.r2, ['b', 'c']);
  assert.throws(() => validateQuestion({ ...grid, rows: [{ ...grid.rows[0], id: '__proto__' }] }));
});

test('custom adapter uses fixed saved endpoint, omits credentials and blocks redirects', async () => {
  let checked = '';
  let called = '';
  const adapter = createChatAdapter({
    checkPermission: async url => { checked = url; },
    fetch: async (url, init) => {
      called = String(url);
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer secret-test-key');
      assert.equal(JSON.parse(String(init?.body)).model, api.model);
      return response('{"choices":["a"]}');
    },
  });
  assert.deepEqual(await answerQuestion(adapter, question, fill, { ...api, provider: 'custom' }), { questionId: 'q1', choices: ['a'] });
  assert.equal(checked, api.baseUrl);
  assert.equal(called, 'https://api.openai.com/v1/chat/completions');
  let calls = 0;
  const denied = createChatAdapter({ checkPermission: async () => { throw new Error('Permission denied.'); }, fetch: async () => { calls++; return response('OK'); } });
  await assert.rejects(denied.complete([], api), /Permission denied/);
  assert.equal(calls, 0);
});

test('transient retry is bounded; authentication and malformed content never retry', async () => {
  for (const status of [429, 500]) {
    let calls = 0;
    let checks = 0;
    const adapter = createChatAdapter({ checkPermission: async () => { checks++; }, fetch: async () => ++calls === 1 ? new Response('secret raw error', { status }) : response('OK') });
    assert.equal(await adapter.complete([], { ...api, retryCount: 1 }), 'OK');
    assert.equal(calls, 2);
    assert.equal(checks, 2);
  }
  let networkCalls = 0;
  const network = createChatAdapter({ checkPermission: allowed, fetch: async () => { if (++networkCalls === 1) throw new TypeError('secret network detail'); return response('OK'); } });
  assert.equal(await network.complete([], { ...api, retryCount: 1 }), 'OK');
  for (const status of [400, 401, 403]) {
    let calls = 0;
    const adapter = createChatAdapter({ checkPermission: allowed, fetch: async () => { calls++; return new Response(`secret-test-key raw error`, { status }); } });
    await assert.rejects(adapter.complete([], { ...api, retryCount: 3 }), error => !String(error).includes(api.apiKey));
    assert.equal(calls, 1);
  }
  let calls = 0;
  const invalid = createChatAdapter({ checkPermission: allowed, fetch: async () => { calls++; return new Response('bad json'); } });
  await assert.rejects(invalid.complete([], { ...api, retryCount: 3 }), /invalid JSON/);
  assert.equal(calls, 1);
});

test('AbortController cancellation, total timeout and response size guards', async () => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const adapter = createChatAdapter({ checkPermission: allowed, fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
    started();
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }) });
  const controller = new AbortController();
  const pending = adapter.complete([], api, controller.signal);
  await ready;
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(adapter.complete([], { ...api, timeout: 1000 }), /timed out/);
  const oversized = createChatAdapter({ checkPermission: allowed, fetch: async () => new Response('x'.repeat(128001)) });
  await assert.rejects(oversized.complete([], api), /too large/);
  const empty = createChatAdapter({ checkPermission: allowed, fetch: async () => response('') });
  await assert.rejects(empty.complete([], api), /empty/);
  const echoed = createChatAdapter({ checkPermission: allowed, fetch: async () => response(api.apiKey) });
  assert.equal(await testAPI(echoed, api), 'API connection successful.');
});

test('background sender isolation, storage access, permissions, cancellation and concurrency', async () => {
  const stored: Record<string, unknown> = {};
  let secured = false;
  let permission = true;
  const originalFetch = globalThis.fetch;
  const runtimeId = 'testextension';
  const listeners: unknown[] = [];
  const chromeMock = {
    runtime: { id: runtimeId, onMessage: { addListener: (listener: unknown) => listeners.push(listener) } },
    tabs: {
      onRemoved: { addListener: (listener: unknown) => listeners.push(listener) },
      onUpdated: { addListener: (listener: unknown) => listeners.push(listener) },
    },
    storage: { session: {
      setAccessLevel: async (options: { accessLevel: string }) => { assert.equal(options.accessLevel, 'TRUSTED_CONTEXTS'); },
      get: async (key: string) => ({ [key]: stored[key] }),
      set: async (value: Record<string, unknown>) => { Object.assign(stored, value); },
      remove: async (key: string) => { delete stored[key]; },
    }, local: {
      setAccessLevel: async (options: { accessLevel: string }) => { assert.equal(options.accessLevel, 'TRUSTED_CONTEXTS'); secured = true; },
      get: async (key: string) => { assert.ok(secured); return { [key]: stored[key] }; },
      set: async (value: Record<string, unknown>) => { assert.ok(secured); Object.assign(stored, value); },
    } },
    permissions: { contains: async (options: { origins: string[] }) => { assert.deepEqual(options.origins, ['https://api.openai.com/*']); return permission; } },
  };
  Object.defineProperty(globalThis, 'chrome', { value: chromeMock, configurable: true });
  const ui = { id: runtimeId, url: `chrome-extension://${runtimeId}/options.html` };
  const content = (id: number) => ({ id: runtimeId, tab: { id }, url: 'https://docs.google.com/forms/d/e/form-id/viewform' }) as chrome.runtime.MessageSender;
  const { handleMessage } = await import('../src/background/service-worker');
  try {
    assert.equal(listeners.length, 3);
    assert.equal((await handleMessage({ type: 'SAVE_API', settings: api }, ui)).ok, true);
    assert.deepEqual(await handleMessage({ type: 'GET_API' }, ui), { ok: true, data: api });
    assert.equal((await handleMessage({ type: 'SAVE_FILL', settings: fill }, ui)).ok, true);
    assert.deepEqual(await handleMessage({ type: 'GET_FILL' }, ui), { ok: true, data: fill });
    assert.deepEqual(await handleMessage({ type: 'GET_FORM_FILL' }, { ...content(1), frameId: 0 }), { ok: true, data: fill });
    assert.ok(!JSON.stringify(await handleMessage({ type: 'GET_FORM_FILL' }, { ...content(1), frameId: 0 })).includes(api.apiKey));
    assert.equal((await handleMessage({ type: 'GET_FORM_FILL' }, { ...content(1), frameId: 1 })).ok, false);
    assert.equal((await handleMessage({ type: 'GET_FORM_FILL' }, { ...content(1), frameId: 0, url: 'https://evil.test' })).ok, false);
    for (const type of ['GET_API', 'SAVE_API', 'DELETE_KEY', 'TEST_API', 'GET_FILL', 'SAVE_FILL']) assert.equal((await handleMessage({ type, settings: api }, content(1))).ok, false);
    for (const url of ['https://docs.google.com/document/d/id/edit', 'https://docs.google.com.evil.test/forms/d/id/viewform', 'http://docs.google.com/forms/d/id/viewform', `chrome-extension://other/options.html`]) assert.equal((await handleMessage({ type: 'GET_API' }, { ...content(1), url })).ok, false);
    permission = false;
    assert.equal((await handleMessage({ type: 'SAVE_API', settings: api }, ui)).ok, false);
    let fetched = 0;
    globalThis.fetch = async () => { fetched++; return response('{"choices":["a"]}'); };
    const request = (id: string) => ({ type: 'AI_ANSWER', requestId: id, question, settings: fill, baseUrl: 'https://evil.test' });
    assert.equal((await handleMessage(request('denied'), content(1))).ok, false);
    assert.equal(fetched, 0);
    permission = true;
    const signals: AbortSignal[] = [];
    let ready!: () => void;
    const started = new Promise<void>(resolve => { ready = resolve; });
    globalThis.fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
      signals.push(init!.signal!);
      if (signals.length === 4) ready();
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const first = handleMessage(request('one'), content(1));
    const second = handleMessage(request('two'), content(1));
    assert.match((await handleMessage(request('one'), content(1))).error!, /Duplicate/);
    assert.match((await handleMessage(request('three'), content(1))).error!, /Too many/);
    const third = handleMessage(request('one'), content(2));
    const fourth = handleMessage(request('two'), content(2));
    await started;
    assert.match((await handleMessage(request('one'), content(3))).error!, /Too many/);
    assert.equal((await handleMessage({ type: 'CANCEL_AI' }, content(1))).ok, true);
    assert.ok(signals[0].aborted && signals[1].aborted);
    assert.ok(!signals[2].aborted && !signals[3].aborted);
    assert.equal((await first).ok, false);
    assert.equal((await second).ok, false);
    await handleMessage({ type: 'CANCEL_AI' }, content(2));
    await Promise.all([third, fourth]);
    globalThis.fetch = async () => response(JSON.stringify({ text: api.apiKey }));
    const leaked = await handleMessage({ ...request('no-leak'), question: { ...question, kind: 'text', choices: [] } }, content(1));
    assert.equal(leaked.ok, false);
    assert.ok(!JSON.stringify(leaked).includes(api.apiKey));
    assert.equal((await handleMessage({ type: 'DELETE_KEY' }, ui)).ok, true);
    assert.equal(((await handleMessage({ type: 'GET_API' }, ui)).data as typeof api).apiKey, '');
  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, 'chrome');
  }
});
