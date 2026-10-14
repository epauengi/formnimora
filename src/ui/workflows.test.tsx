// Run: npx tsx src/ui/workflows.test.tsx
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_API, DEFAULT_FILL, type ContentCommand, type EngineState, type FillSettings } from '../types';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://extension.test/options.html' });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
const calls: { type: string; [key: string]: unknown }[] = [];
let engine: EngineState = { phase: 'preview', page: 2, completed: 0, failed: 0, logs: ['Kiểm tra câu trả lời.'], questions: [{ id: 'q1', title: 'Chọn môn học', kind: 'radio', choices: [{ id: 'choice-math', label: 'Toán' }, { id: 'choice-art', label: 'Mỹ thuật' }], rows: [], answered: false, required: true }], answers: [{ questionId: 'q1', choices: ['choice-math'] }] };
const api = { ...DEFAULT_API, apiKey: 'fixture-key' };
Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
  runtime: { id: 'fixture-extension', openOptionsPage: async () => {}, sendMessage: async (message: { type: string }) => { calls.push(message); return { ok: true, data: message.type === 'GET_FILL' ? { ...DEFAULT_FILL } : message.type === 'GET_API' ? api : message.type === 'TEST_API' ? 'fixture response' : true }; } },
  tabs: { query: async () => [{ id: 7, url: 'https://docs.google.com/forms/d/e/id/viewform' }], sendMessage: async (tab: number, command: ContentCommand) => { assert.equal(tab, 7); calls.push(command); if (command.type === 'APPLY') { engine = { ...engine, phase: 'filling', answers: command.answers }; } return { ok: true, data: engine }; } },
  scripting: { executeScript: async (options: unknown) => { calls.push({ type: 'INJECT', options }); } },
  permissions: { request: (options: unknown) => { calls.push({ type: 'PERMISSION', options }); return Promise.resolve(true); } },
} });
const { App } = await import('../popup/App');
const { Settings } = await import('../options/Settings');
const root = createRoot(document.getElementById('root')!);
await act(async () => { root.render(<App/>); });
assert.equal(calls.filter(call => call.type === 'INJECT').length, 1);
assert.equal(calls.some(call => call.type === 'STATUS'), true);
assert.match(document.body.textContent || '', /Trang 2/);
const answer = document.querySelector<HTMLSelectElement>('#answer-q1')!;
assert.equal(answer.value, 'choice-math');
await act(async () => { answer.value = 'choice-art'; answer.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
const apply = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Áp dụng vào biểu mẫu')!;
await act(async () => { apply.click(); });
const applyCall = calls.find(call => call.type === 'APPLY') as { answers: { choices: string[] }[] } | undefined;
assert.deepEqual(applyCall?.answers[0].choices, ['choice-art']);
assert.ok(document.body.textContent?.includes('Dừng điền'));
await act(async () => { root.render(<div/>); });
engine = { ...engine, phase: 'idle' };
await act(async () => { root.render(<App/>); });
const autoOptions = document.querySelector<HTMLDetailsElement>('.auto-fill-options')!;
assert.equal(autoOptions.open, false, 'Real submission options are secondary by default.');
autoOptions.open = true;
const auto = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Điền biểu mẫu')!;
assert.equal(document.querySelector('h1')?.textContent, 'FormNimora');
dom.window.confirm = () => false;
calls.length = 0;
await act(async () => { auto.click(); });
assert.equal(calls.some(call => call.type === 'START'), false);
dom.window.confirm = () => true;
await act(async () => { auto.click(); });
const start = calls.find(call => call.type === 'START') as unknown as { settings: FillSettings };
assert.equal(start.settings.autoSubmit, true); assert.equal(start.settings.autoNext, true);
assert.equal(start.settings.preview, false); assert.equal(start.settings.mode, 'random');
assert.equal(calls.some(call => call.type === 'SAVE_FILL'), false);
await act(async () => { root.render(<Settings/>); });
calls.length = 0;
const save = document.querySelector<HTMLFormElement>('.api-card')!;
await act(async () => { save.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
assert.deepEqual(calls.map(call => call.type), ['PERMISSION', 'SAVE_API']);
assert.deepEqual(calls[0].options, { origins: ['https://api.openai.com/*'] });
calls.length = 0;
const test = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Lưu & kiểm tra API')!;
await act(async () => { test.click(); });
assert.deepEqual(calls.map(call => call.type), ['PERMISSION', 'SAVE_API', 'TEST_API']);
assert.ok(document.querySelector('[aria-live]')?.textContent?.includes('fixture response'));
await act(async () => { root.unmount(); });
dom.window.close();
console.log('UI preview editing, injection and permission/save/test ordering passed.');
