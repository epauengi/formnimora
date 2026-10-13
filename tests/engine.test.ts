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
test('cold Forms controllers can acknowledge choice clicks after 80ms', async () => {
  const doc = setup();
  doc.querySelector('[role="listitem"]')!.innerHTML = '<h2 role="heading">Cold controller</h2><div role="radio" aria-label="A" aria-checked="false"></div>';
  let clicks = 0;
  const radio = doc.querySelector('[role="radio"]')!;
  radio.addEventListener('click', () => { clicks++; setTimeout(() => radio.setAttribute('aria-checked', 'true'), 600); });
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, delay: 0 });
  await waitFor(engine, 'done'); assert.equal(engine.state.failed, 0); assert.equal(clicks, 1);
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
  const button = doc.querySelector('button')!; button.textContent = 'Tiếp'; button.setAttribute('aria-label', 'Tiếp');
  button.addEventListener('click', () => {
    if (button.textContent === 'Gửi') {
      submits++; doc.body.innerHTML = '<p>Câu trả lời của bạn đã được ghi lại.</p>'; return;
    }
    doc.querySelector('[role="listitem"]')!.innerHTML = '<h2 role="heading">Phần cuối</h2><input type="text" required value="Có sẵn"/>';
    button.textContent = 'Gửi'; button.setAttribute('aria-label', 'Gửi');
  });
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
  await waitFor(engine, 'done');
  assert.equal(engine.state.page, 2); assert.equal(submits, 1);
  assert.match(engine.state.logs.at(-1)!, /xác nhận/);
});
test('Google Forms Send matches individual captions, not concatenated names', async () => {
  for (const markup of [
    '<div role="button" data-value="Gửi"><span>Gửi</span></div>',
    '<div role="button" aria-label="Gửi biểu mẫu"><span>Gửi</span></div>',
    '<button type="submit" aria-label="Gửi" aria-labelledby="send-caption"><span id="send-caption">Gửi</span></button>',
    '<div role="button" aria-label="Gửi"><span>Gửi</span></div>',
    '<div role="button"><span>Gửi\u200B</span></div>',
    '<span id="external-caption">Gửi</span><div role="button" aria-labelledby="external-caption"></div>',
    '<div role="button" data-value="Gửi"></div>',
  ]) {
    const doc = setup(); let submits = 0;
    doc.querySelector('button')!.outerHTML = markup;
    doc.querySelector('[role="button"], button')!.addEventListener('click', () => {
      submits++; doc.body.innerHTML = '<p>Câu trả lời của bạn đã được ghi lại.</p>';
    });
    const engine = new AutoFillEngine();
    engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
    await waitFor(engine, 'done'); assert.equal(submits, 1, markup);
  }
});
test('first run continues when the next page uses decomposed Vietnamese captions', async () => {
  const doc = setup(); let submits = 0; let page = 1;
  const button = doc.querySelector('button')!; button.textContent = 'Tiếp';
  button.addEventListener('click', () => {
    if (page === 3) {
      submits++; doc.body.innerHTML = '<p>Câu trả lời của bạn đã được ghi lại.</p>'; return;
    }
    page++;
    doc.querySelector('[role="listitem"]')!.innerHTML = `<h2 role="heading">Phần ${page}</h2><input type="text" value="Có sẵn"/>`;
    button.textContent = (page === 2 ? 'Tiếp' : 'Gửi').normalize('NFD');
    button.setAttribute('aria-label', button.textContent);
  });
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
  await waitFor(engine, 'done'); assert.equal(engine.state.page, 3); assert.equal(submits, 1);
});
test('resume waits for destination Forms DOM before filling', async () => {
  const doc = setup(); const content = doc.body.innerHTML; doc.body.innerHTML = '';
  const engine = new AutoFillEngine(); let submits = 0;
  engine.resume({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 },
    { ...engine.status(), page: 2, phase: 'planning' });
  await new Promise(resolve => setTimeout(resolve, 100));
  doc.body.innerHTML = content;
  doc.querySelectorAll('[role="radio"]').forEach(radio => radio.addEventListener('click', () => {
    doc.querySelectorAll('[role="radio"]').forEach(item => item.setAttribute('aria-checked', String(item === radio)));
  }));
  doc.querySelector('button')!.addEventListener('click', () => {
    submits++; doc.body.innerHTML = '<p>Câu trả lời của bạn đã được ghi lại.</p>';
  });
  await waitFor(engine, 'done'); assert.equal(submits, 1); assert.equal(engine.state.page, 2);
});
test('first resumed page with a Google Forms section heading continues automatically', async () => {
  const doc = setup(); let submits = 0;
  doc.body.insertAdjacentHTML('afterbegin', '<div role="listitem"><div role="heading" aria-level="2">PHẦN 1. HOẠT ĐỘNG VÀ NHU CẦU</div></div>');
  doc.querySelector('button')!.addEventListener('click', () => {
    submits++; doc.body.innerHTML = '<p>Câu trả lời của bạn đã được ghi lại.</p>';
  });
  const engine = new AutoFillEngine();
  engine.resume({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 },
    { ...engine.status(), page: 2, phase: 'planning' });
  await waitFor(engine, 'done'); assert.equal(submits, 1); assert.equal(engine.state.completed, 1);
});
test('resume cannot Send while navigation mounts before questions', async () => {
  const doc = setup(); const question = doc.querySelector('[role="listitem"]')!.outerHTML;
  doc.querySelector('[role="listitem"]')!.remove();
  let submits = 0;
  doc.querySelector('button')!.addEventListener('click', () => {
    assert.equal(doc.querySelectorAll('[aria-checked="true"]').length, 1, 'questions must be filled before Send');
    submits++; doc.body.innerHTML = '<p>Câu trả lời của bạn đã được ghi lại.</p>';
  });
  const engine = new AutoFillEngine();
  engine.resume({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 },
    { ...engine.status(), page: 2, phase: 'planning' });
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal(submits, 0);
  doc.body.insertAdjacentHTML('afterbegin', question);
  doc.querySelectorAll('[role="radio"]').forEach(radio => radio.addEventListener('click', () => {
    doc.querySelectorAll('[role="radio"]').forEach(item => item.setAttribute('aria-checked', String(item === radio)));
  }));
  await waitFor(engine, 'done'); assert.equal(submits, 1); assert.equal(engine.state.completed, 1);
});
test('resume stops safely on empty sections instead of treating Send as readiness', async () => {
  const doc = setup(); doc.querySelector('[role="listitem"]')!.remove(); let submits = 0;
  doc.querySelector('button')!.addEventListener('click', () => submits++);
  const timeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) => timeout(callback, ms === 100 ? 0 : ms, ...args)) as typeof setTimeout;
  const engine = new AutoFillEngine();
  try {
    engine.resume({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 },
      { ...engine.status(), page: 2, phase: 'planning' });
    const deadline = Date.now() + 10000;
    while (engine.state.phase !== 'error' && Date.now() < deadline) await new Promise(resolve => timeout(resolve, 10));
    assert.equal(engine.state.phase, 'error'); assert.equal(submits, 0);
    assert.match(engine.state.logs.at(-1)!, /kiểm tra thủ công/);
  } finally { engine.stop(); globalThis.setTimeout = timeout; }
});
test('transient question removal cannot clear a pending document-navigation checkpoint', async () => {
  const doc = setup(); const messages: string[] = [];
  doc.querySelector('[role="listitem"]')!.insertAdjacentHTML('afterend', '<div role="listitem"><h2 role="heading">Tạm thời</h2><input value="Có sẵn"/></div>');
  const button = doc.querySelector('button')!; button.textContent = 'Tiếp';
  button.addEventListener('click', () => {
    doc.querySelectorAll('[role="listitem"]')[1].remove();
    button.hidden = true;
  });
  Object.assign(globalThis, { chrome: { runtime: { sendMessage: async (message: { type: string }) => {
    messages.push(message.type); return { ok: true, data: true };
  } } } });
  const timeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) => timeout(callback, ms === 15000 ? 500 : ms, ...args)) as typeof setTimeout;
  const engine = new AutoFillEngine();
  try {
    engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
    const deadline = Date.now() + 1500;
    while (!engine.state.logs.some(log => log.includes('Chưa xác nhận chuyển trang')) && Date.now() < deadline) await new Promise(resolve => timeout(resolve, 10));
    assert.match(engine.state.logs.at(-1)!, /Chưa xác nhận chuyển trang/);
    assert.equal(engine.state.phase, 'filling');
    assert.deepEqual(messages, ['SAVE_RUN']);
    assert.equal(engine.state.page, 1);
    assert.throws(() => engine.start(DEFAULT_FILL));
    engine.stop();
    assert.equal(engine.state.phase, 'stopped');
    await new Promise(resolve => timeout(resolve, 10));
    assert.ok(messages.includes('CLEAR_RUN'), 'explicit Stop must remove pending navigation');
  } finally { globalThis.setTimeout = timeout; }
});
test('native submit controls cannot masquerade as Next', async () => {
  const doc = setup(); let clicks = 0;
  doc.querySelector('button')!.outerHTML = '<button type="submit" aria-label="Tiếp">Tiếp</button>';
  doc.querySelector('button')!.addEventListener('click', () => clicks++);
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, delay: 0 });
  await waitFor(engine, 'done'); assert.equal(clicks, 0);
});
test('navigation ignores hidden, disabled and question-local Send controls', async () => {
  const doc = setup(); let unsafeClicks = 0;
  doc.querySelector('button')!.remove();
  doc.querySelector('[role="listitem"]')!.insertAdjacentHTML('beforeend', '<div role="button">Gửi</div>');
  doc.body.insertAdjacentHTML('beforeend', '<div role="button" hidden>Gửi</div><div role="button" aria-disabled="true">Gửi</div>');
  doc.querySelectorAll('[role="button"]').forEach(button => button.addEventListener('click', () => unsafeClicks++));
  const engine = new AutoFillEngine();
  engine.start({ ...DEFAULT_FILL, preview: false, autoNext: true, autoSubmit: true, delay: 0 });
  await waitFor(engine, 'error'); assert.equal(unsafeClicks, 0);
  assert.match(engine.state.logs.at(-1)!, /Không tìm thấy nút Gửi/);
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
