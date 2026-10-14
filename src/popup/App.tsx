import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FILL, type Answer, type ContentCommand, type EngineState, type FillSettings, type Question, type QuestionKind } from '../types';
import { AIWarning, Header, Notice, browserNotice, errorText, extensionAvailable, isFormUrl, runtime, unwrap } from '../ui/shared';

const kinds: Record<QuestionKind, string> = { radio: 'Một lựa chọn', checkbox: 'Nhiều lựa chọn', dropdown: 'Danh sách thả xuống', scale: 'Thang điểm', 'radio-grid': 'Lưới một lựa chọn', 'checkbox-grid': 'Lưới nhiều lựa chọn', text: 'Trả lời ngắn', paragraph: 'Đoạn văn', unsupported: 'Chưa hỗ trợ' };
const phases: Record<EngineState['phase'], string> = { idle: 'Sẵn sàng', planning: 'Đang chuẩn bị', preview: 'Chờ xem trước', filling: 'Đang điền', done: 'Hoàn tất', stopped: 'Đã dừng', error: 'Có lỗi' };

function AnswerEditor({ question, answer, onChange }: { question: Question; answer: Answer; onChange: (answer: Answer) => void }) {
  const id = `answer-${question.id}`;
  const titleId = `title-${question.id}`;
  const choiceControl = (choices: Question['choices'], selected: string[], multiple: boolean, controlId: string, label: string, change: (ids: string[]) => void) => <label className="field" htmlFor={controlId}><span>{label}</span><select id={controlId} aria-labelledby={`${titleId} ${controlId}`} multiple={multiple} size={multiple ? Math.min(5, Math.max(2, choices.length)) : undefined} value={multiple ? selected : selected[0] || ''} onChange={event => change(Array.from(event.currentTarget.selectedOptions, option => option.value).filter(Boolean))}>{!multiple && <option value="">Chưa chọn</option>}{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>{multiple && <small>Giữ Ctrl / ⌘ để chọn nhiều mục.</small>}</label>;
  return <article className="question"><div className="question-title"><h3 id={titleId}>{question.title || 'Câu hỏi không có tiêu đề'}{question.required && <span aria-label="Bắt buộc"> *</span>}</h3><span className="kind">{kinds[question.kind]}</span></div>
    {question.kind === 'text' || question.kind === 'paragraph' ? <label className="field" htmlFor={id}><span>Câu trả lời</span><textarea id={id} aria-labelledby={`${titleId} ${id}`} rows={question.kind === 'paragraph' ? 4 : 2} value={answer.text || ''} onChange={event => onChange({ ...answer, text: event.target.value })}/></label> : question.kind === 'radio-grid' || question.kind === 'checkbox-grid' ? question.rows.map(row => <div key={row.id}>{choiceControl(row.choices, answer.rows?.[row.id] || [], question.kind === 'checkbox-grid', `${id}-${row.id}`, row.label, ids => onChange({ ...answer, rows: { ...answer.rows, [row.id]: ids } }))}</div>) : question.kind !== 'unsupported' ? choiceControl(question.choices, answer.choices || [], question.kind === 'checkbox', id, 'Câu trả lời', choices => onChange({ ...answer, choices })) : <p className="muted">Loại câu hỏi này không thể điền tự động.</p>}
    {answer.error && <p className="inline-error">{answer.error}</p>}
  </article>;
}

export function App() {
  const [settings, setSettings] = useState<FillSettings>({ ...DEFAULT_FILL });
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(extensionAvailable ? 'Đang kết nối biểu mẫu…' : '');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const tabId = useRef<number | undefined>(undefined);
  const active = engine?.phase === 'planning' || engine?.phase === 'filling';
  const usesAI = settings.mode === 'ai' || settings.aiText;

  useEffect(() => {
    if (!extensionAvailable) return;
    let disposed = false;
    async function initialize() {
      const fillPromise = runtime<FillSettings>({ type: 'GET_FILL' });
      const formPromise = (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined || !isFormUrl(tab.url)) throw new Error('Mở trang Google Forms có đường dẫn /viewform rồi mở lại tiện ích.');
        tabId.current = tab.id;
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        return unwrap<EngineState>(await chrome.tabs.sendMessage(tab.id, { type: 'STATUS' } satisfies ContentCommand));
      })();
      const [fill, form] = await Promise.allSettled([fillPromise, formPromise]);
      if (disposed) return;
      if (fill.status === 'fulfilled') setSettings(fill.value);
      if (form.status === 'fulfilled') { setEngine(form.value); setAnswers(form.value.answers); }
      const failures = [fill, form].filter(result => result.status === 'rejected').map(result => errorText((result as PromiseRejectedResult).reason));
      setError(failures.join(' '));
      setReady(fill.status === 'fulfilled' && form.status === 'fulfilled');
      setBusy('');
    }
    void initialize();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!active || !ready || tabId.current === undefined) return;
    let disposed = false;
    let pending = false;
    let disconnectedAt = 0;
    const interval = window.setInterval(async () => {
      if (pending || tabId.current === undefined) return;
      pending = true;
      try {
        const state = unwrap<EngineState>(await chrome.tabs.sendMessage(tabId.current, { type: 'STATUS' } satisfies ContentCommand));
        disconnectedAt = 0;
        if (!disposed) { setEngine(state); setAnswers(state.answers); setError(''); }
      } catch (failure) {
        if (disposed) return;
        const text = errorText(failure);
        if (/Receiving end does not exist|message port closed|channel closed|Could not establish connection/i.test(text)) {
          disconnectedAt ||= Date.now();
          if (Date.now() - disconnectedAt < 20000) setError('Đang chuyển phần, chờ kết nối lại…');
          else { setError('Không kết nối lại được sau 20 giây. Kiểm tra tab biểu mẫu rồi mở lại tiện ích.'); setReady(false); }
        } else { setError(text); setReady(false); }
      }
      finally { pending = false; }
    }, 650);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [active, ready]);

  async function command(message: ContentCommand) {
    if (!ready || tabId.current === undefined) return;
    setError(''); setBusy('Đang xử lý…');
    try {
      if (message.type === 'START' && !message.settings.autoSubmit && !await runtime<boolean>({ type: 'SAVE_FILL', settings: message.settings })) throw new Error('Không thể lưu cách điền.');
      const state = unwrap<EngineState>(await chrome.tabs.sendMessage(tabId.current, message));
      setEngine(state); setAnswers(state.answers);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  }
  function editAnswer(next: Answer) { const edited = { ...next, error: undefined }; setAnswers(previous => previous.map(answer => answer.questionId === edited.questionId ? edited : answer)); }

  return <main className={`popup-shell ${settings.dark ? 'theme-dark' : ''}`}><Header><button className="icon-button" aria-label="Mở cài đặt" title="Mở cài đặt" onClick={() => { if (extensionAvailable) void chrome.runtime.openOptionsPage().catch(failure => setError(errorText(failure))); else setError(browserNotice); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg></button></Header>
    <div className="popup-content"><section className="form-status"><div className="section-heading"><h2>Biểu mẫu hiện tại</h2><span className={`status-pill ${active ? 'working' : ''}`}>{engine ? phases[engine.phase] : 'Chưa kết nối'}</span></div>{engine ? <><p className="muted">{engine.questions.length} câu hỏi · {engine.questions.filter(question => !['text', 'paragraph', 'unsupported'].includes(question.kind)).length} trắc nghiệm · {engine.questions.filter(question => ['text', 'paragraph'].includes(question.kind)).length} tự luận · Trang {engine.page}</p>{engine.target! > 1 && <><p className="muted">Đã gửi {engine.submitted || 0}/{engine.target} phản hồi</p><progress className="run-progress" max={engine.target} value={engine.submitted || 0}/></>}<div className="metrics"><div><strong>{engine.completed}</strong><span>Đã điền</span></div><div><strong>{engine.failed}</strong><span>Không thành công</span></div><div><strong>{engine.questions.filter(question => question.answered).length}</strong><span>Đã có trả lời</span></div></div></> : <p className="muted">Mở Google Forms để quét câu hỏi và chuẩn bị câu trả lời. Chế độ thường không gửi; nút Điền biểu mẫu có thể tự gửi sau xác nhận.</p>}</section>
    {engine?.phase !== 'preview' ? <><section className="panel"><h2>Cách điền</h2><label className="field" htmlFor="popup-mode"><span>Chế độ</span><select id="popup-mode" value={settings.mode} disabled={!!busy || active} onChange={event => { setSettings(previous => ({ ...previous, mode: event.target.value as FillSettings['mode'] })); setConsent(false); }}><option value="random">Ngẫu nhiên</option><option value="rules">Theo quy tắc</option><option value="ai">AI · cần API và đồng ý gửi dữ liệu</option></select></label><label className="check-row"><input type="checkbox" checked={settings.preview} disabled={!!busy || active} onChange={event => setSettings(previous => ({ ...previous, preview: event.target.checked }))}/><span>Xem và sửa câu trả lời trước khi điền<small>{settings.preview ? 'Chưa ghi vào biểu mẫu khi chuẩn bị.' : 'Câu trả lời sẽ được điền trực tiếp.'}</small></span></label>{usesAI && <><AIWarning/><label className="check-row"><input type="checkbox" checked={consent} disabled={active} onChange={event => setConsent(event.target.checked)}/><span>Tôi đồng ý gửi dữ liệu trên tới nhà cung cấp API.{settings.mode !== 'ai' && settings.aiText && <small>Đang bật AI cho câu hỏi văn bản từ Cài đặt.</small>}</span></label></>}</section>
    <details className="auto-fill-options advanced-options"><summary>Điền & gửi tự động <span className="status-pill caution">Gửi thật</span></summary><p className="muted">Chọn ngẫu nhiên, tự bấm Tiếp, gửi đủ số phản hồi. Câu văn bản cần AI hoặc đã có đáp án; gặp lỗi sẽ dừng.</p><label className="field" htmlFor="response-quantity"><span>Số lượng phản hồi</span><input id="response-quantity" type="number" min="1" max="100" step="1" value={quantity} disabled={!!busy || active} onChange={event => setQuantity(event.target.valueAsNumber)}/><small>1–100. Mỗi phản hồi sẽ được gửi thật.</small></label><button className="primary full-width" disabled={!ready || !!busy || active || (settings.aiText && !consent) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100} onClick={() => {
      if (window.confirm(`Tự điền biểu mẫu và GỬI ${quantity} phản hồi thật? Chỉ dùng với biểu mẫu bạn sở hữu hoặc được phép gửi dữ liệu thử. Đã gửi thì không thể thu hồi.`)) {
        void command({ type: 'START', settings: { ...settings, mode: 'random', preview: false, autoNext: true, autoSubmit: true }, quantity });
      }
    }}>Điền biểu mẫu</button></details></> : <section className="preview-section"><div className="section-heading"><h2>Xem trước câu trả lời</h2><span className="muted">{answers.length} câu trả lời</span></div><p className="muted">Kiểm tra nội dung trước khi áp dụng. Bản xem trước được giữ khi đóng tiện ích.</p>{engine.questions.map(question => { const answer = answers.find(item => item.questionId === question.id); return answer ? <AnswerEditor key={question.id} question={question} answer={answer} onChange={editAnswer}/> : <article className="question" key={question.id}><h3>{question.title || 'Không có tiêu đề'}</h3><span className="kind">{kinds[question.kind]}</span><p className="muted">Không có câu trả lời được tạo{question.answered ? ' · Đã có trả lời trên biểu mẫu' : ''}.</p></article>; })}</section>}
    <Notice error={error || (engine?.phase === 'error' ? engine.logs.at(-1) || 'Tác vụ thất bại. Kiểm tra nhật ký.' : '')} busy={busy || (active && engine ? `${phases[engine.phase]}… Có thể dừng bất cứ lúc nào.` : '')} message={!extensionAvailable ? browserNotice : undefined}/>
    {engine && engine.phase !== 'preview' && engine.questions.length > 0 && <details className="details"><summary>Câu hỏi đã quét ({engine.questions.length})</summary><ul className="question-list">{engine.questions.map(question => <li key={question.id}><span>{question.title || 'Không có tiêu đề'}{question.required ? ' *' : ''}</span><small>{kinds[question.kind]}{question.answered ? ' · Đã trả lời' : ''}</small></li>)}</ul></details>}
    {engine && <details className="details"><summary>Nhật ký ({engine.logs.length})</summary>{engine.logs.length ? <ol className="logs">{engine.logs.map((log, index) => <li key={index}>{log}</li>)}</ol> : <p className="muted">Chưa có hoạt động.</p>}</details>}
    </div>
    <div className="popup-bottom-bar">
      {engine?.phase === 'preview' ? <div className="action-row"><button className="primary full-width" disabled={!ready || !!busy || !answers.length} onClick={() => void command({ type: 'APPLY', answers })}>Áp dụng vào biểu mẫu</button><button className="danger" disabled={!ready || !!busy} onClick={() => void command({ type: 'RESET' })}>Hủy xem trước</button></div> : <div className="action-row"><button disabled={!ready || !!busy || active} onClick={() => void command({ type: 'SCAN' })}>Quét câu hỏi</button>{active ? <button className="danger" disabled={!!busy} onClick={() => void command({ type: 'STOP' })}>Dừng điền</button> : <button className="primary" disabled={!ready || !!busy || (usesAI && !consent)} onClick={() => void command({ type: 'START', settings })}>{settings.preview ? 'Chuẩn bị câu trả lời' : 'Bắt đầu điền'}</button>}</div>}
      <footer className="popup-footer"><span>Chỉ “Điền biểu mẫu” tự gửi</span><button className="text-button" disabled={!ready || !!busy || active} onClick={() => { if (window.confirm('Xóa bản xem trước và tiến trình đang lưu? Không thể hoàn tác. Câu trả lời đã điền trên biểu mẫu được giữ nguyên.')) void command({ type: 'RESET' }); }}>Làm mới tiến trình</button></footer>
    </div></main>;
}
export default App;
