import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { AutoFillEngine } from '../src/content/auto-filler';
import { mountFormToolbar } from '../src/content/form-toolbar';

test('toolbar collapses natively, expands for work, preserves submission guard', () => {
  const dom = new JSDOM('<body></body>');
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  let shadow!: ShadowRoot;
  let render!: () => void;
  let messages = 0;
  let confirmations = 0;
  let starts = 0;
  let stops = 0;
  const attachShadow = dom.window.HTMLElement.prototype.attachShadow;
  dom.window.HTMLElement.prototype.attachShadow = function (options) {
    assert.equal(options.mode, 'closed');
    shadow = attachShadow.call(this, options) as unknown as ShadowRoot;
    return shadow;
  };
  dom.window.setInterval = ((callback: () => void) => { render = callback; return 1; }) as typeof dom.window.setInterval;
  dom.window.confirm = () => { confirmations++; return true; };
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    chrome: { runtime: { sendMessage: async () => { messages++; return { ok: true }; } } },
  });
  try {
    const engine = new AutoFillEngine();
    engine.start = () => { starts++; };
    engine.stop = () => { stops++; };
    mountFormToolbar(engine);
    const host = dom.window.document.getElementById('forms-ai-toolbar')!;
    assert.equal(host.shadowRoot, null);
    const collapse = shadow.querySelector<HTMLButtonElement>('.collapse')!;
    const controls = shadow.getElementById(collapse.getAttribute('aria-controls')!)!;
    const action = shadow.querySelector<HTMLButtonElement>('.action')!;
    const status = shadow.querySelector('[role="status"]')!;
    assert.equal(collapse.getAttribute('aria-expanded'), 'true');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    collapse.click();
    assert.equal(collapse.getAttribute('aria-expanded'), 'false');
    assert.equal(controls.hidden, true);
    assert.match(collapse.getAttribute('aria-label')!, /Mở rộng/);
    collapse.click();
    assert.equal(controls.hidden, false);
    for (const phase of ['planning', 'filling'] as const) {
      engine.state.phase = 'idle'; render(); collapse.click();
      assert.equal(controls.hidden, true);
      engine.state.phase = phase;
      engine.state.page = 2; engine.state.completed = 3;
      render();
      assert.equal(controls.hidden, false);
      assert.equal(collapse.getAttribute('aria-expanded'), 'true');
      assert.equal(collapse.disabled, true);
      collapse.click();
      assert.equal(controls.hidden, false);
      assert.equal(action.disabled, false);
      assert.equal(action.textContent, 'Dừng điền');
      assert.equal(action.classList.contains('stop'), true);
      assert.match(status.textContent!, /Phần 2 · Đã điền 3 câu/);
      action.click();
    }
    for (const phase of ['preview', 'done', 'error', 'stopped', 'idle'] as const) {
      engine.state.phase = phase; render();
      assert.equal(action.disabled, phase === 'preview' || phase === 'done');
      assert.equal(action.classList.contains('stop'), false);
      assert.equal(collapse.disabled, false);
      assert.equal(shadow.querySelector('section')!.dataset.state, phase);
    }
    action.click();
    assert.deepEqual([messages, confirmations, starts, stops], [0, 0, 0, 0]);
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  } finally {
    dom.window.close();
    for (const key of ['document', 'window', 'chrome']) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
