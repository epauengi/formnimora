import type { FillSettings, Result } from '../types';
import type { AutoFillEngine } from './auto-filler';

export function mountFormToolbar(engine: AutoFillEngine) {
  const host = document.createElement('div');
  host.id = 'forms-ai-toolbar';
  // Closed shadow keeps extension controls out of the question scanner and Forms CSS.
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; }
    section { box-sizing: border-box; width: 280px; max-width: calc(100vw - 24px); padding: 14px; border: 1px solid #dadce0; border-radius: 12px; background: #fff; color: #202124; box-shadow: 0 4px 20px #20212426; font: 14px/1.5 Arial, sans-serif; }
    strong { font-size: 13px; }
    p { margin: 6px 0 12px; color: #5f6368; overflow-wrap: anywhere; }
    button { width: 100%; min-height: 44px; padding: 10px 14px; border: 0; border-radius: 6px; background: #673ab7; color: white; font: 600 14px Arial, sans-serif; cursor: pointer; }
    button:hover { background: #512da8; }
    button:focus-visible { outline: 3px solid #202124; outline-offset: 3px; }
    button:disabled { opacity: .6; cursor: default; }
    @media (max-width: 480px) { :host { right: 12px; bottom: 12px; } section { width: 240px; } }
  </style><section aria-label="FormNimora"><strong>FormNimora</strong><p role="status" aria-live="polite">Tự điền các phần, gửi một phản hồi.</p><button type="button">Điền biểu mẫu</button></section>`;
  const button = shadow.querySelector('button')!;
  const status = shadow.querySelector('p')!;
  let starting = false;
  let failure = '';
  function render() {
    const state = engine.state;
    const running = state.phase === 'planning' || state.phase === 'filling';
    const action = running ? 'Dừng điền' : 'Điền biểu mẫu';
    if (button.textContent !== action) button.textContent = action;
    button.disabled = starting || state.phase === 'preview' || state.phase === 'done';
    const message = failure || (starting ? 'Đang lấy cài đặt…' : running ? `Phần ${state.page} · Đã điền ${state.completed} câu. Có thể dừng trước khi gửi.` : state.phase === 'preview' ? 'Có preview trong popup. Xác nhận hoặc Reset tại đó.' : state.phase === 'idle' ? 'Tự điền các phần, gửi một phản hồi.' : state.logs.at(-1) || (state.phase === 'stopped' ? 'Đã dừng. Giữ nguyên câu trả lời.' : 'Kiểm tra biểu mẫu.'));
    if (status.textContent !== message) status.textContent = message;
  }
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
