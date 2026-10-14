import type { FillSettings, Result } from '../types';
import type { AutoFillEngine } from './auto-filler';

export function mountFormToolbar(engine: AutoFillEngine) {
  const host = document.createElement('div');
  host.id = 'forms-ai-toolbar';
  // Closed shadow keeps extension controls out of the question scanner and Forms CSS.
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; color-scheme: light; --surface: #fff; --soft: #f1f5f9; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --focus: #2548D8; --error: #b91c1c; --error-soft: #fef2f2; --active: #1e3a8a; --active-soft: #eff6ff; --warning: #713f12; --warning-soft: #fff4df; }
    :host([data-dark]) { color-scheme: dark; --surface: #0f172a; --soft: #1e293b; --text: #f8fafc; --muted: #cbd5e1; --line: #475569; --focus: #93b4ff; --error: #fca5a5; --error-soft: #3b1720; --active: #b8ccff; --active-soft: #182b57; --warning: #ffd08a; --warning-soft: #382b18; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    section { width: 328px; max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px); overflow-y: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--text); font: 14px/1.5 "Segoe UI", system-ui, sans-serif; scrollbar-color: var(--muted) var(--soft); }
    ::selection { color: #0f172a; background: #FFAD42; }
    header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; }
    header > svg { width: 28px; height: 28px; flex: none; }
    .brand { flex: 1; min-width: 0; }
    .brand strong { display: block; font-size: 16px; font-weight: 650; }
    .brand span { display: block; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    button { min-height: 44px; padding: 10px 14px; border: 1px solid transparent; border-radius: 6px; font: 600 14px/1.5 "Segoe UI", system-ui, sans-serif; cursor: pointer; transition: background-color .15s ease-out; }
    button:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
    button:disabled { background: var(--soft); color: var(--muted); border-color: var(--line); cursor: not-allowed; }
    .collapse { display: grid; place-items: center; width: 44px; flex: none; padding: 10px; border-color: var(--line); color: var(--text); background: var(--surface); }
    .collapse:hover:not(:disabled) { background: var(--soft); }
    .collapse svg { width: 20px; height: 20px; }
    .collapse[aria-expanded="false"] svg { transform: rotate(180deg); }
    .phase { padding: 8px 16px; border-block: 1px solid var(--line); background: var(--soft); color: var(--muted); font-size: 12px; font-weight: 600; }
    section[data-state="working"] .phase { background: var(--active-soft); color: var(--active); }
    section[data-state="error"] .phase { background: var(--error-soft); color: var(--error); }
    section[data-state="preview"] .phase, section[data-state="stopped"] .phase { background: var(--warning-soft); color: var(--warning); }
    .controls { padding: 16px; }
    p { margin: 0 0 16px; color: var(--muted); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    .action { width: 100%; background: #2548D8; color: #fff; }
    .action:hover:not(:disabled) { background: #1d3bb5; }
    .action.stop { background: #FFAD42; color: #0f172a; border-color: #FFAD42; }
    .action.stop:hover:not(:disabled) { background: #ffbf6b; }
    section[data-state="error"] p { color: var(--error); }
    @media (max-width: 480px) { :host { right: 12px; bottom: 12px; } }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  </style><section aria-label="FormNimora"><header><svg viewBox="0 0 256 256" aria-hidden="true"><g fill="#2548D8"><rect x="44" y="45" width="24" height="24" rx="8"/><rect x="88" y="45" width="124" height="24" rx="12"/><rect x="44" y="101" width="24" height="24" rx="8"/><rect x="88" y="101" width="88" height="24" rx="12"/><rect x="44" y="157" width="24" height="24" rx="8"/></g><path d="M88 169h62l22-22h37" fill="none" stroke="#2548D8" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><circle cx="211" cy="147" r="10" fill="#FFAD42"/></svg><div class="brand"><strong>FormNimora</strong><span>Bàn làm việc biểu mẫu</span></div><button class="collapse" type="button" aria-expanded="true" aria-controls="toolbar-controls" aria-label="Thu gọn bảng điều khiển"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button></header><div class="phase">Sẵn sàng</div><div class="controls" id="toolbar-controls"><p role="status" aria-live="polite" aria-atomic="true">Tự điền các phần, gửi một phản hồi.</p><button class="action" type="button">Điền biểu mẫu</button></div></section>`;
  const section = shadow.querySelector('section')!;
  const button = shadow.querySelector<HTMLButtonElement>('.action')!;
  const collapse = shadow.querySelector<HTMLButtonElement>('.collapse')!;
  const controls = shadow.querySelector<HTMLElement>('.controls')!;
  const phase = shadow.querySelector('.phase')!;
  const status = shadow.querySelector('p')!;
  let collapsed = false;
  let starting = false;
  let failure = '';
  function render() {
    const state = engine.state;
    const running = state.phase === 'planning' || state.phase === 'filling';
    if (running || starting) collapsed = false;
    controls.hidden = collapsed;
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.setAttribute('aria-label', collapsed ? 'Mở rộng bảng điều khiển' : 'Thu gọn bảng điều khiển');
    collapse.disabled = running || starting;
    collapse.title = running || starting ? 'Luôn mở khi đang điền để có thể dừng.' : '';
    button.classList.toggle('stop', running);
    section.dataset.state = failure ? 'error' : running || starting ? 'working' : state.phase;
    const phaseLabel = failure || state.phase === 'error' ? 'Cần kiểm tra' : starting ? 'Đang chuẩn bị' : running ? 'Đang điền' : state.phase === 'preview' ? 'Chờ xác nhận' : state.phase === 'done' ? 'Đã hoàn tất' : state.phase === 'stopped' ? 'Đã dừng' : 'Sẵn sàng';
    if (phase.textContent !== phaseLabel) phase.textContent = phaseLabel;
    const action = running ? 'Dừng điền' : 'Điền biểu mẫu';
    if (button.textContent !== action) button.textContent = action;
    button.disabled = starting || state.phase === 'preview' || state.phase === 'done';
    const message = failure || (starting ? 'Đang lấy cài đặt…' : running ? `Phần ${state.page} · Đã điền ${state.completed} câu. Có thể dừng trước khi gửi.` : state.phase === 'preview' ? 'Có preview trong popup. Xác nhận hoặc Reset tại đó.' : state.phase === 'idle' ? 'Tự điền các phần, gửi một phản hồi.' : state.logs.at(-1) || (state.phase === 'stopped' ? 'Đã dừng. Giữ nguyên câu trả lời.' : 'Kiểm tra biểu mẫu.'));
    if (status.textContent !== message) status.textContent = message;
  }
  collapse.addEventListener('click', () => {
    collapsed = !collapsed;
    render();
  });
  button.addEventListener('click', async event => {
    // Do not let page scripts trigger a real submission through synthetic events.
    if (!event.isTrusted || starting) return;
    failure = '';
    if (engine.state.phase === 'planning' || engine.state.phase === 'filling') { engine.stop(); render(); return; }
    starting = true; render();
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_FORM_FILL' }) as Result<FillSettings>;
      if (!response?.ok || !response.data) throw new Error('Không lấy được cài đặt. Reload extension và tải lại trang.');
      const settings = response.data;
      host.toggleAttribute('data-dark', settings.dark);
      const consent = 'Tự điền ngẫu nhiên tất cả các phần và GỬI 1 phản hồi thật? Chỉ dùng với biểu mẫu bạn sở hữu hoặc được phép gửi dữ liệu thử. Sau khi gửi không thể thu hồi bằng extension.' + (settings.aiText ? '\n\nAI đang bật: nội dung câu tự luận và ngữ cảnh cá nhân sẽ được gửi tới API đã cấu hình. Đồng ý tiếp tục?' : '\n\nCâu tự luận bắt buộc cần điền sẵn hoặc bật AI trong cài đặt extension.');
      if (!window.confirm(consent)) return;
      engine.start({ ...settings, mode: 'random', preview: false, autoNext: true, autoSubmit: true });
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Không thể bắt đầu. Tải lại trang rồi thử lại.';
    } finally { starting = false; render(); }
  });
  document.body.append(host);
  render();
  const interval = window.setInterval(render, 300);
  window.addEventListener('pagehide', () => window.clearInterval(interval), { once: true });
}
