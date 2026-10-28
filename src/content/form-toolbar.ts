import type { FillSettings, Result } from '../types';
import type { AutoFillEngine } from './auto-filler';

export function mountFormToolbar(engine: AutoFillEngine) {
  const host = document.createElement('div');
  host.id = 'forms-ai-toolbar';
  // Closed shadow keeps extension controls out of the question scanner and Forms CSS.
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host {
      all: initial;
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      color-scheme: light;
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      --surface: #ffffff;
      --surface-raised: #f8fafc;
      --text: #0f172a;
      --text-muted: #475569;
      --text-dim: #64748b;
      --line: #e2e8f0;
      --line-subtle: #f1f5f9;
      --focus: #2548D8;
      --cobalt: #2548D8;
      --cobalt-hover: #1e3bb8;
      --cobalt-soft: #eff4ff;
      --cobalt-border: #bfdbfe;
      --amber: #FFAD42;
      --amber-hover: #ffbe5c;
      --amber-active: #f59e0b;
      --amber-text: #422006;
      --amber-border: #d98218;
      --warning-bg: #fffbeb;
      --warning-border: #fcd34d;
      --warning-title: #78350f;
      --warning-text: #92400e;
      --error: #b91c1c;
      --error-hover: #991b1b;
      --error-bg: #fef2f2;
      --error-border: #fecaca;
      --error-text: #991b1b;
      --success-bg: #f0fdf4;
      --success-border: #bbf7d0;
      --success-text: #166534;
      --shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06);
    }
    :host([data-dark]) {
      color-scheme: dark;
      --surface: #151d2f;
      --surface-raised: #1c273e;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --line: #2d3b55;
      --line-subtle: #192237;
      --focus: #60a5fa;
      --cobalt: #3b82f6;
      --cobalt-hover: #60a5fa;
      --cobalt-soft: #1e2e4f;
      --cobalt-border: #2548D8;
      --amber: #FFAD42;
      --amber-hover: #ffbe5c;
      --amber-active: #f59e0b;
      --amber-text: #2b1400;
      --amber-border: #d98218;
      --warning-bg: #2b1f11;
      --warning-border: #78350f;
      --warning-title: #fde68a;
      --warning-text: #fef3c7;
      --error: #dc2626;
      --error-hover: #b91c1c;
      --error-bg: #351518;
      --error-border: #7f1d1d;
      --error-text: #fca5a5;
      --success-bg: #10291f;
      --success-border: #14532d;
      --success-text: #86efac;
      --shadow: 0 14px 28px -4px rgba(0, 0, 0, 0.6), 0 6px 14px -3px rgba(0, 0, 0, 0.4);
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    [hidden] {
      display: none !important;
    }
    ::selection {
      background: var(--cobalt-soft);
      color: var(--cobalt);
    }
    section {
      width: 320px;
      max-width: calc(100vw - 24px);
      max-height: calc(100dvh - 24px);
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
      font: 13px/1.5 "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      box-shadow: var(--shadow);
      scrollbar-width: thin;
      scrollbar-color: var(--line) transparent;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px 12px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
    }
    .brand-logo {
      width: 28px;
      height: 28px;
      flex: none;
    }
    .brand-text {
      flex: 1;
      min-width: 0;
    }
    .brand-title {
      display: block;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--text);
      letter-spacing: -0.02em;
    }
    .brand-subtitle {
      display: block;
      font-size: 11px;
      color: var(--text-dim);
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    button {
      margin: 0;
      font: inherit;
      -webkit-tap-highlight-color: transparent;
    }
    .collapse {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text-muted);
      cursor: pointer;
      flex: none;
      transition: background-color .15s ease-out, border-color .15s ease-out, color .15s ease-out;
    }
    .collapse:hover:not(:disabled) {
      background: var(--surface-raised);
      color: var(--text);
      border-color: var(--line);
    }
    .collapse:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .collapse:disabled {
      background: var(--line-subtle);
      color: var(--text-dim);
      border-color: var(--line);
      cursor: not-allowed;
      opacity: 0.6;
    }
    .collapse svg {
      width: 18px;
      height: 18px;
      transition: transform .2s ease-out;
    }
    .collapse[aria-expanded="false"] svg {
      transform: rotate(180deg);
    }
    .status-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-raised);
    }
    .phase-wrapper {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .phase-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      flex: none;
    }
    section[data-state="working"] .phase-dot {
      background: var(--cobalt);
      animation: pulse-dot 1.5s ease-in-out infinite;
    }
    section[data-state="preview"] .phase-dot,
    section[data-state="stopped"] .phase-dot {
      background: #f59e0b;
    }
    section[data-state="error"] .phase-dot {
      background: var(--error);
    }
    section[data-state="done"] .phase-dot {
      background: #10b981;
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .phase {
      font-size: 12px;
      font-weight: 650;
      color: var(--text-muted);
      letter-spacing: -0.01em;
    }
    section[data-state="working"] .phase {
      color: var(--cobalt);
    }
    section[data-state="error"] .phase {
      color: var(--error-text);
    }
    section[data-state="preview"] .phase,
    section[data-state="stopped"] .phase {
      color: var(--warning-title);
    }
    section[data-state="done"] .phase {
      color: var(--success-text);
    }
    .controls {
      padding: 14px 16px 16px;
      background: var(--surface);
    }
    .sequence-cue {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      margin-bottom: 12px;
      padding: 6px 8px;
      background: var(--surface-raised);
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 11px;
    }
    .seq-step {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 6px;
      border-radius: 5px;
      border: 1px solid transparent;
      color: var(--text-dim);
      transition: background-color .15s ease-out, color .15s ease-out, border-color .15s ease-out;
    }
    .seq-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      background: var(--line);
      color: var(--text);
      font-size: 9px;
      font-weight: 700;
      line-height: 1;
    }
    .seq-label {
      font-weight: 550;
      white-space: nowrap;
    }
    .seq-arrow {
      color: var(--text-dim);
      font-size: 11px;
      user-select: none;
    }
    section[data-state="idle"] [data-seq="prep"],
    section[data-state="working"][data-subphase="planning"] [data-seq="prep"],
    section[data-state="working"][data-subphase="starting"] [data-seq="prep"] {
      border-color: var(--cobalt-border);
      background: var(--cobalt-soft);
      color: var(--cobalt);
      font-weight: 600;
    }
    section[data-state="idle"] [data-seq="submit"] {
      border-color: var(--amber-border);
      background: var(--warning-bg);
      color: var(--warning-title);
    }
    section[data-state="working"][data-subphase="filling"] [data-seq="fill"] {
      border-color: var(--cobalt-border);
      background: var(--cobalt-soft);
      color: var(--cobalt);
      font-weight: 600;
    }
    section[data-state="working"][data-subphase="filling"] [data-seq="prep"] {
      opacity: 0.6;
    }
    section[data-state="preview"] [data-seq="fill"] {
      border-color: var(--warning-border);
      background: var(--warning-bg);
      color: var(--warning-title);
      font-weight: 600;
    }
    section[data-state="done"] [data-seq="submit"] {
      border-color: var(--success-border);
      background: var(--success-bg);
      color: var(--success-text);
      font-weight: 600;
    }
    section[data-state="done"] [data-seq="prep"],
    section[data-state="done"] [data-seq="fill"] {
      opacity: 0.6;
    }
    .status-box {
      margin-bottom: 12px;
    }
    p {
      margin: 0;
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.5;
      overflow-wrap: anywhere;
      font-variant-numeric: tabular-nums;
    }
    section[data-state="error"] p {
      color: var(--error-text);
      font-weight: 500;
    }
    section[data-state="working"] p {
      color: var(--text);
      font-weight: 550;
    }
    .send-warning {
      margin-bottom: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--warning-border);
      background: var(--warning-bg);
      color: var(--warning-text);
      font-size: 12px;
      line-height: 1.5;
    }
    .warning-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      font-weight: 700;
      color: var(--warning-title);
      font-size: 12px;
    }
    .warning-icon {
      width: 15px;
      height: 15px;
      flex: none;
      color: var(--warning-title);
    }
    .warning-body {
      margin-bottom: 6px;
      color: var(--warning-text);
    }
    .warning-body strong {
      color: var(--warning-title);
      font-weight: 650;
    }
    .warning-hint {
      padding-top: 6px;
      border-top: 1px dashed var(--warning-border);
      color: var(--warning-title);
      font-size: 11px;
      line-height: 1.4;
    }
    section[data-state="working"] .send-warning,
    section[data-state="done"] .send-warning,
    section[data-state="preview"] .send-warning,
    section[data-state="error"] .send-warning {
      display: none;
    }
    .state-hint {
      display: none;
      font-size: 12px;
      line-height: 1.45;
      margin-bottom: 12px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--surface-raised);
      color: var(--text-muted);
    }
    section[data-state="working"] .state-hint-working {
      display: block;
      border-color: var(--cobalt-border);
      background: var(--cobalt-soft);
      color: var(--cobalt);
    }
    section[data-state="preview"] .state-hint-preview {
      display: block;
      border-color: var(--warning-border);
      background: var(--warning-bg);
      color: var(--warning-title);
    }
    section[data-state="done"] .state-hint-done {
      display: block;
      border-color: var(--success-border);
      background: var(--success-bg);
      color: var(--success-text);
    }
    section[data-state="error"] .state-hint-error {
      display: block;
      border-color: var(--error-border);
      background: var(--error-bg);
      color: var(--error-text);
    }
    .action {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 44px;
      padding: 10px 16px;
      border-radius: 8px;
      font: 650 14px/1.4 "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      letter-spacing: -0.01em;
      cursor: pointer;
      transition: background-color .15s ease-out, transform .1s ease-out, border-color .15s ease-out, box-shadow .15s ease-out;
      background: var(--amber);
      color: var(--amber-text);
      border: 1px solid var(--amber-border);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .action:hover:not(:disabled) {
      background: var(--amber-hover);
      border-color: #d98218;
    }
    .action:active:not(:disabled) {
      background: var(--amber-active);
      transform: translateY(1px);
    }
    .action:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .action.stop {
      background: var(--error);
      color: #ffffff;
      border-color: var(--error-hover);
      box-shadow: 0 1px 2px rgba(185, 28, 28, 0.2);
    }
    .action.stop:hover:not(:disabled) {
      background: var(--error-hover);
      border-color: #7f1d1d;
      color: #ffffff;
    }
    .action.stop:active:not(:disabled) {
      background: #7f1d1d;
      transform: translateY(1px);
    }
    .action:disabled {
      background: var(--line-subtle);
      color: var(--text-dim);
      border-color: var(--line);
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
    }
    @media (max-width: 480px) {
      :host {
        right: 12px;
        bottom: 12px;
      }
      section {
        width: calc(100vw - 24px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
    }
  </style><section aria-label="FormNimora" data-state="idle"><header><div class="brand"><svg class="brand-logo" viewBox="0 0 256 256" aria-hidden="true"><g fill="#2548D8"><rect x="44" y="45" width="24" height="24" rx="8"/><rect x="88" y="45" width="124" height="24" rx="12"/><rect x="44" y="101" width="24" height="24" rx="8"/><rect x="88" y="101" width="88" height="24" rx="12"/><rect x="44" y="157" width="24" height="24" rx="8"/></g><path d="M88 169h62l22-22h37" fill="none" stroke="#2548D8" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><circle cx="211" cy="147" r="10" fill="#FFAD42"/></svg><div class="brand-text"><strong class="brand-title">FormNimora</strong><span class="brand-subtitle">Bàn làm việc biểu mẫu</span></div></div><button class="collapse" type="button" aria-expanded="true" aria-controls="toolbar-controls" aria-label="Thu gọn bảng điều khiển"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button></header><div class="status-strip"><div class="phase-wrapper"><span class="phase-dot" aria-hidden="true"></span><span class="phase">Sẵn sàng</span></div></div><div class="controls" id="toolbar-controls"><div class="sequence-cue" aria-label="Trình tự thực hiện" role="group"><div class="seq-step" data-seq="prep"><span class="seq-num">1</span><span class="seq-label">Chuẩn bị</span></div><span class="seq-arrow" aria-hidden="true">→</span><div class="seq-step" data-seq="fill"><span class="seq-num">2</span><span class="seq-label">Điền câu</span></div><span class="seq-arrow" aria-hidden="true">→</span><div class="seq-step" data-seq="submit"><span class="seq-num">3</span><span class="seq-label">Gửi thật</span></div></div><div class="status-box"><p role="status" aria-live="polite" aria-atomic="true">Tự điền các phần, gửi một phản hồi.</p></div><div class="send-warning" role="note"><div class="warning-header"><svg class="warning-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg><strong>Cảnh báo gửi phản hồi thật</strong></div><div class="warning-body">Nhấn nút bên dưới sẽ tự động điền các phần và <strong>gửi 1 phản hồi chính thức</strong> vào Google Form sau khi xác nhận.</div><div class="warning-hint">Cần xem trước mà không gửi? Mở popup FormNimora trên thanh tiện ích để kiểm tra trước.</div></div><div class="state-hint state-hint-working">Đang tự động điền. Nhấn <strong>Dừng điền</strong> nếu cần xem lại trước khi gửi.</div><div class="state-hint state-hint-preview">Đang có dữ liệu xem trước trong popup. Vui lòng mở popup tiện ích để xác nhận hoặc đặt lại.</div><div class="state-hint state-hint-done">Đã hoàn tất gửi 1 phản hồi. Để thực hiện lượt mới, vui lòng tải lại trang biểu mẫu.</div><div class="state-hint state-hint-error">Có lỗi phát sinh. Vui lòng kiểm tra cài đặt hoặc tải lại trang để thử lại.</div><button class="action" type="button">Điền biểu mẫu</button></div></section>`;

  const section = shadow.querySelector('section')!;
  const button = shadow.querySelector<HTMLButtonElement>('.action')!;
  const collapse = shadow.querySelector<HTMLButtonElement>('.collapse')!;
  const controls = shadow.querySelector<HTMLElement>('.controls')!;
  const phase = shadow.querySelector('.phase')!;
  const status = shadow.querySelector('p')!;
  let collapsed = false;
  let starting = false;
  let failure = '';

  // ponytail: Floating shadow DOM toolbar handles 1 submission per run without multi-page preview editing; upgrade to synced webview modal if interactive multi-step preview is needed on-page.
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
    section.dataset.subphase = starting ? 'starting' : state.phase;
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
