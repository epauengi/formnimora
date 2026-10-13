import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { AutoFillEngine } from '../src/content/auto-filler';
import { DEFAULT_FILL } from '../src/types';
function setup() {
  const dom = new JSDOM(`<div role="listitem"><h2 role="heading">Màu sắc</h2><div role="radiogroup"><div role="radio" aria-label="Đỏ" aria-checked="false"></div><div role="radio" aria-label="Xanh" aria-checked="false"></div></div></div><button type="button">Submit</button>`);
  for (const key of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLOptionElement', 'HTMLButtonElement', 'Event', 'MutationObserver'] as const) Object.assign(globalThis, { [key]: dom.window[key] });
  Object.assign(globalThis, { document: dom.window.document, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), chrome: { runtime: { sendMessage: async () => ({ ok: true, data: true }) } } });
  for (const radio of dom.window.document.querySelectorAll('[role="radio"]')) radio.addEventListener('click', () => {
    dom.window.document.querySelectorAll('[role="radio"]').forEach(item => item.setAttribute('aria-checked', String(item === radio)));
  });
  return dom.window.document;
}
async function waitFor(engine: AutoFillEngine, phase: string) {
  const deadline = Date.now() + 1500;
  while (engine.state.phase !== phase && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(engine.state.phase, phase, engine.state.logs.join('\n'));
}
test('engine previews before changing form, validates edits, fills and never submits', async () => {
  const doc = setup(); let submitted = false;
  doc.querySelector('button')!.addEventListener('click', () => { submitted = true; });
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: true, autoNext: true, delay: 0 });
  await waitFor(engine, 'preview');
  assert.equal(doc.querySelectorAll('[aria-checked="true"]').length, 0);
  assert.throws(() => engine.start(DEFAULT_FILL));
  assert.throws(() => engine.apply([{ questionId: engine.state.questions[0].id, choices: ['fabricated'] }]));
  engine.apply(engine.status().answers);
  await waitFor(engine, 'done');
  assert.equal(engine.state.completed, 1); assert.equal(engine.state.failed, 0);
  assert.equal(doc.querySelectorAll('[aria-checked="true"]').length, 1); assert.equal(submitted, false);
});
test('native dropdown fills, verifies and Reset preserves value', async () => {
  const doc = setup();
  doc.querySelector('[role="listitem"]')!.innerHTML = '<h2 role="heading">Chọn thành phố</h2><select><option value="">Chọn</option><option value="HN">Hà Nội</option><option value="HCM">TP HCM</option></select>';
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, delay: 0 });
  await waitFor(engine, 'done');
  assert.equal(engine.state.completed, 1); assert.equal(engine.state.failed, 0);
  assert.ok(doc.querySelector('select')!.value);
  engine.reset(); assert.ok(doc.querySelector('select')!.value);
});
test('checkbox grid selects configured count per row', async () => {
  const doc = setup();
  const row = (name: string) => `<div role="group" aria-label="${name}"><div role="checkbox" aria-label="A" aria-checked="false"></div><div role="checkbox" aria-label="B" aria-checked="false"></div></div>`;
  doc.querySelector('[role="listitem"]')!.innerHTML = `<h2 role="heading">Bảng đánh giá</h2>${row('Hàng 1')}${row('Hàng 2')}`;
  doc.querySelectorAll('[role="checkbox"]').forEach(control => control.addEventListener('click', () => control.setAttribute('aria-checked', String(control.getAttribute('aria-checked') !== 'true'))));
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, checkboxCount: 2, delay: 0 });
  await waitFor(engine, 'done');
  assert.equal(engine.state.failed, 0); assert.equal(doc.querySelectorAll('[aria-checked="true"]').length, 4);
});
test('autoNext observes next page and stops before Submit', async () => {
  const doc = setup(); let submits = 0;
  const button = doc.querySelector('button')!; button.textContent = 'Next';
  button.addEventListener('click', () => {
    if (button.textContent === 'Submit') { submits++; return; }
    doc.querySelector('[role="listitem"]')!.innerHTML = '<h2 role="heading">Trang thứ hai</h2><input type="text" value="Đã có"/>';
    button.textContent = 'Submit';
  });
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, delay: 0 });
  await waitFor(engine, 'done');
  assert.equal(engine.state.page, 2); assert.equal(submits, 0);
});
test('one-click run goes Next and submits exactly once after confirmation opt-in', async () => {
  const doc = setup(); let submits = 0;
  const button = doc.querySelector('button')!; button.textContent = 'Tiếp';
  button.addEventListener('click', () => {
    if (button.textContent === 'Gửi') {
      submits++; doc.body.innerHTML = '<p>Câu trả lời của bạn đã được ghi lại.</p>'; return;
    }
    doc.querySelector('[role="listitem"]')!.innerHTML = '<h2 role="heading">Phần cuối</h2><input type="text" required value="Có sẵn"/>';
    button.textContent = 'Gửi';
  });
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
  await waitFor(engine, 'done');
  assert.equal(engine.state.page, 2); assert.equal(submits, 1);
  assert.match(engine.state.logs.at(-1)!, /xác nhận/);
});
test('auto submit refuses missing required answers and refuses unsafe flags', async () => {
  const doc = setup(); let submits = 0;
  doc.querySelector('[role="listitem"]')!.innerHTML = '<h2 role="heading">Email *</h2><input type="email" required/>';
  doc.querySelector('button')!.addEventListener('click', () => submits++);
  const engine = new AutoFillEngine();
  assert.throws(() => engine.start({ ...DEFAULT_FILL, autoSubmit: true }));
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
  await waitFor(engine, 'error'); assert.equal(submits, 0);
});
test('Stop before final submit cancels sending', async () => {
  const doc = setup(); let submits = 0;
  doc.querySelector('button')!.addEventListener('click', () => submits++);
  const engine = new AutoFillEngine();
  doc.querySelectorAll('[role="radio"]').forEach(control => control.addEventListener('click', () => engine.stop()));
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
  await waitFor(engine, 'stopped'); assert.equal(submits, 0);
});
test('submission validation failure does not retry Submit', async () => {
  const doc = setup(); let submits = 0;
  doc.querySelector('button')!.addEventListener('click', () => {
    submits++; doc.querySelector('[role="radio"]')!.setAttribute('aria-invalid', 'true');
  });
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
  await waitFor(engine, 'error'); assert.equal(submits, 1);
});
test('AI text triggers input/change, preview edits are applied', async () => {
  const doc = setup();
  doc.querySelector('[role="listitem"]')!.innerHTML = '<h2 role="heading">Đề xuất</h2><textarea></textarea>';
  const field = doc.querySelector('textarea')!; let inputs = 0; let changes = 0;
  field.addEventListener('input', () => inputs++); field.addEventListener('change', () => changes++);
  Object.assign(globalThis, { chrome: { runtime: { sendMessage: async (message: { question?: { id: string } }) => ({ ok: true, data: { questionId: message.question?.id, text: 'Mở thêm sách.' } }) } } });
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, aiText: true, preview: true, delay: 0 });
  await waitFor(engine, 'preview'); assert.equal(field.value, '');
  engine.apply([{ questionId: engine.state.questions[0].id, text: 'Bổ sung sách tiếng Việt.' }]);
  await waitFor(engine, 'done'); assert.equal(field.value, 'Bổ sung sách tiếng Việt.');
  assert.equal(inputs, 1); assert.equal(changes, 1); assert.equal(engine.state.failed, 0);
});
test('Stop cancels planning, rejects overlapping task until settled and preserves values', async () => {
  setup(); const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false });
  engine.stop();
  assert.throws(() => engine.start(DEFAULT_FILL));
  await waitFor(engine, 'stopped');
  await new Promise(resolve => setTimeout(resolve, 20));
  engine.reset(); assert.equal(engine.state.phase, 'idle');
});
