import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_API, DEFAULT_FILL, type ContentCommand, type EngineState, type FillSettings } from '../types';
import { mountFormToolbar } from '../content/form-toolbar';
import { AutoFillEngine } from '../content/auto-filler';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://extension.test/popup.html' });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

const calls: { type: string; [key: string]: unknown }[] = [];
let engine: EngineState = { phase: 'idle', page: 1, completed: 0, failed: 0, logs: [], questions: [], answers: [] };
const question = { id: 'q1', title: 'Mục đích', kind: 'radio' as const, choices: [{ id: 'c1', label: 'Học tập' }], rows: [], answered: false, required: true };

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    runtime: {
      id: 'fixture-ext',
      openOptionsPage: async () => {},
      sendMessage: async (m: { type: string }) => {
        calls.push(m);
        return { ok: true, data: m.type === 'GET_FILL' ? { ...DEFAULT_FILL } : m.type === 'GET_API' ? { ...DEFAULT_API } : true };
      },
    },
    tabs: {
      query: async () => [{ id: 7, url: 'https://docs.google.com/forms/d/e/id/viewform' }],
      sendMessage: async (_id: number, cmd: ContentCommand) => {
        calls.push(cmd);
        return { ok: true, data: cmd.type === 'STATUS' ? engine : { ...engine, phase: 'filling' } };
      },
      onActivated: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    scripting: { executeScript: async () => [{ result: undefined }] },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    permissions: { request: async () => true },
  },
});

const { App } = await import('../popup/App');
const { Settings } = await import('../options/Settings');

test('popup workflow rail derives idle, questions, preview and done states with accessible list', async () => {
  const root = createRoot(document.getElementById('root')!);
  try {
    // 1. Idle (0 questions) -> step 1 current
    engine = { ...engine, phase: 'idle', questions: [] };
    await act(async () => { root.render(<App key="idle" />); });
    const rail = document.querySelector('nav.workflow-rail')!;
    assert.ok(rail.getAttribute('aria-label'));
    const steps = [...rail.querySelectorAll('li.workflow-step')];
    assert.equal(steps.length, 3);
    steps.forEach((el, i) => assert.equal(el.querySelector('.step-number')?.textContent?.trim(), String(i + 1)));
    assert.equal(steps[0].getAttribute('aria-current'), 'step');
    assert.equal(steps[1].getAttribute('aria-current'), null);

    // 2. Questions loaded -> step 1 done, step 2 current
    engine = { ...engine, phase: 'idle', questions: [question] };
    await act(async () => { root.render(<App key="scanned" />); });
    const scannedSteps = document.querySelectorAll('.workflow-step');
    assert.ok(scannedSteps[0].classList.contains('done'));
    assert.equal(scannedSteps[1].getAttribute('aria-current'), 'step');

    // 3. Preview phase -> steps 1 & 2 done, step 3 current
    engine = { ...engine, phase: 'preview', questions: [question], answers: [{ questionId: 'q1', choices: ['c1'] }] };
    await act(async () => { root.render(<App key="preview" />); });
    const previewSteps = document.querySelectorAll('.workflow-step');
    assert.ok(previewSteps[1].classList.contains('done'));
    assert.equal(previewSteps[2].getAttribute('aria-current'), 'step');

    // 4. Done phase -> all steps done, step 3 clears aria-current
    engine = { ...engine, phase: 'done', questions: [question] };
    await act(async () => { root.render(<App key="done" />); });
    const doneSteps = document.querySelectorAll('.workflow-step');
    assert.ok(doneSteps[2].classList.contains('done'));
    assert.equal(doneSteps[2].getAttribute('aria-current'), null);
  } finally {
    await act(async () => { root.unmount(); });
  }
});

test('popup auto-fill disclosure guards real submission with confirmation', async () => {
  const root = createRoot(document.getElementById('root')!);
  try {
    engine = { ...engine, phase: 'idle', questions: [question] };
    await act(async () => { root.render(<App key="submit" />); });

    const auto = document.querySelector<HTMLDetailsElement>('.auto-fill-options')!;
    assert.equal(auto.open, false);
    assert.match(auto.querySelector('.status-pill.caution')?.textContent || '', /gửi.*thật/i);
    auto.open = true;

    const submit = auto.querySelector<HTMLButtonElement>('button.submit-action, button.primary')!;
    let confirmed = false;
    dom.window.confirm = () => confirmed;

    calls.length = 0;
    await act(async () => { submit.click(); });
    assert.equal(calls.some(c => c.type === 'START'), false);

    confirmed = true;
    await act(async () => { submit.click(); });
    const start = calls.find(c => c.type === 'START') as unknown as { settings: FillSettings } | undefined;
    assert.equal(start?.settings?.autoSubmit, true);
  } finally {
    await act(async () => { root.unmount(); });
  }
});

test('settings layout renders accessible navigation anchors for form sections', async () => {
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => { root.render(<Settings />); });

    assert.ok(document.querySelector('.settings-layout'));
    const nav = document.querySelector('nav.settings-nav')!;
    assert.ok(nav.getAttribute('aria-label'));
    const fillLink = nav.querySelector<HTMLAnchorElement>('a[href="#fill-settings"]')!;
    const apiLink = nav.querySelector<HTMLAnchorElement>('a[href="#api-settings"]')!;
    const fillForm = document.querySelector<HTMLFormElement>('#fill-settings')!;
    const apiForm = document.querySelector<HTMLFormElement>('#api-settings')!;

    assert.equal(fillForm.getAttribute('tabindex'), '-1');
    assert.equal(apiForm.getAttribute('tabindex'), '-1');

    // Nav anchor click moves focus to target form with tabindex -1
    await act(async () => { apiLink.click(); });
    assert.equal(document.activeElement, apiForm);
    await act(async () => { fillLink.click(); });
    assert.equal(document.activeElement, fillForm);

    const checkDescribedBy = () => {
      for (const el of document.querySelectorAll('[aria-describedby]')) {
        for (const id of el.getAttribute('aria-describedby')!.split(/\s+/).filter(Boolean)) {
          assert.ok(document.getElementById(id), `aria-describedby ID #${id} must exist`);
        }
      }
    };
    checkDescribedBy();

    // Expand AI mode and details, verify all aria-describedby references remain valid
    const mode = document.querySelector<HTMLSelectElement>('#mode')!;
    await act(async () => {
      mode.value = 'ai';
      mode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    for (const d of document.querySelectorAll<HTMLDetailsElement>('details')) d.open = true;
    checkDescribedBy();
  } finally {
    await act(async () => { root.unmount(); });
  }
});

test('toolbar displays visible real send warning and accessible collapse toggle', () => {
  let shadow!: ShadowRoot;
  const origAttach = dom.window.HTMLElement.prototype.attachShadow;
  dom.window.HTMLElement.prototype.attachShadow = function (options) {
    shadow = origAttach.call(this, options) as unknown as ShadowRoot;
    return shadow;
  };

  try {
    mountFormToolbar(new AutoFillEngine());
    assert.match(shadow.querySelector('.send-warning')?.textContent || '', /gửi.*thật/i);

    const collapse = shadow.querySelector<HTMLButtonElement>('.collapse')!;
    const controls = shadow.getElementById(collapse.getAttribute('aria-controls')!)!;
    assert.equal(collapse.getAttribute('aria-expanded'), 'true');
    assert.equal(controls.hidden, false);

    collapse.click();
    assert.equal(collapse.getAttribute('aria-expanded'), 'false');
    assert.equal(controls.hidden, true);

    collapse.click();
    assert.equal(collapse.getAttribute('aria-expanded'), 'true');
    assert.equal(controls.hidden, false);
  } finally {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.document.getElementById('forms-ai-toolbar')?.remove();
    dom.window.HTMLElement.prototype.attachShadow = origAttach;
  }
});

after(() => {
  dom.window.close();
});
