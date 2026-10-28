import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FILL, type Answer, type ContentCommand, type EngineState, type FillSettings, type FixedAnswer, type Question, type QuestionKind } from '../types';
import { AIWarning, Header, Notice, browserNotice, errorText, extensionAvailable, isFormUrl, runtime, unwrap } from '../ui/shared';

const kinds: Record<QuestionKind, string> = { radio: 'Một lựa chọn', checkbox: 'Nhiều lựa chọn', dropdown: 'Danh sách thả xuống', scale: 'Thang điểm', 'radio-grid': 'Lưới một lựa chọn', 'checkbox-grid': 'Lưới nhiều lựa chọn', text: 'Trả lời ngắn', paragraph: 'Đoạn văn', unsupported: 'Chưa hỗ trợ' };
const phases: Record<EngineState['phase'], string> = { idle: 'Sẵn sàng', planning: 'Đang chuẩn bị', preview: 'Chờ xem trước', filling: 'Đang điền', done: 'Hoàn tất', stopped: 'Đã dừng', error: 'Có lỗi' };

function AnswerEditor({ question, answer, onChange }: { question: Question; answer: Answer; onChange: (answer: Answer) => void }) {
  const id = `answer-${question.id}`;
  const titleId = `title-${question.id}`;
  const choiceControl = (choices: Question['choices'], selected: string[], multiple: boolean, controlId: string, label: string, change: (ids: string[]) => void) => <label className="field" htmlFor={controlId}><span id={`${controlId}-label`}>{label}</span><select id={controlId} aria-labelledby={`${titleId} ${controlId}-label`} multiple={multiple} size={multiple ? Math.min(5, Math.max(2, choices.length)) : undefined} value={multiple ? selected : selected[0] || ''} onChange={event => change(Array.from(event.currentTarget.selectedOptions, option => option.value).filter(Boolean))}>{!multiple && <option value="">Chưa chọn</option>}{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>{multiple && <small>Giữ Ctrl / ⌘ để chọn nhiều mục.</small>}</label>;
  return <article className="question"><div className="question-title"><h3 id={titleId}>{question.title || 'Câu hỏi không có tiêu đề'}{question.required && <span aria-label="Bắt buộc"> *</span>}</h3><span className="kind">{kinds[question.kind]}</span></div>
    {question.kind === 'text' || question.kind === 'paragraph' ? <label className="field" htmlFor={id}><span id={`${id}-label`}>Câu trả lời</span><textarea id={id} aria-labelledby={`${titleId} ${id}-label`} rows={question.kind === 'paragraph' ? 4 : 2} value={answer.text || ''} onChange={event => onChange({ ...answer, text: event.target.value })}/></label> : question.kind === 'radio-grid' || question.kind === 'checkbox-grid' ? question.rows.map(row => <div key={row.id}>{choiceControl(row.choices, answer.rows?.[row.id] || [], question.kind === 'checkbox-grid', `${id}-${row.id}`, row.label, ids => onChange({ ...answer, rows: { ...answer.rows, [row.id]: ids } }))}</div>) : question.kind !== 'unsupported' ? choiceControl(question.choices, answer.choices || [], question.kind === 'checkbox', id, 'Câu trả lời', choices => onChange({ ...answer, choices })) : <p className="muted">Loại câu hỏi này không thể điền tự động.</p>}
    {answer.error && <p className="inline-error">{answer.error}</p>}
  </article>;
}

function RatioEditor({ question, ratio, page, onChange }: { question: Question; ratio?: NonNullable<FillSettings['answerRatios']>[number]; page: number; onChange: (ratio: NonNullable<FillSettings['answerRatios']>[number] | undefined) => void }) {
  const total = ratio?.choices.reduce((sum, choice) => sum + (Number.isFinite(choice.percent) ? choice.percent : 0), 0) ?? 0;
  return <article className="question ratio-question"><h3>{question.title || 'Câu hỏi không có tiêu đề'}</h3>{ratio ? <><div className="ratio-list">{question.choices.map(choice => <label className="ratio-row" key={choice.id}><span>{choice.label}</span><div><input aria-label={`Tỉ lệ ${choice.label}`} type="number" min="0" max="100" step="1" value={ratio.choices.find(item => item.choiceId === choice.id)?.percent ?? 0} onChange={event => { const percent = event.target.valueAsNumber; if (Number.isInteger(percent) && percent >= 0 && percent <= 100) onChange({ ...ratio, choices: ratio.choices.map(item => item.choiceId === choice.id ? { ...item, percent } : item) }); }}/><span>%</span></div></label>)}</div><small className={total === 100 ? '' : 'inline-error'}>Tổng: {total}%{total !== 100 ? ' · cần đúng 100%' : ''}</small><button type="button" className="text-button" onClick={() => onChange(undefined)}>Bỏ tỉ lệ</button></> : <button type="button" onClick={() => onChange({ questionId: question.id, page, choices: question.choices.map((choice, index) => ({ choiceId: choice.id, percent: Math.floor(100 / question.choices.length) + (index < 100 % question.choices.length ? 1 : 0) })) })}>Chia đều</button>}</article>;
}

function FixedAnswerEditor({ question, index, answer, onChange }: { question: Question; index: number; answer?: FixedAnswer; onChange: (selection: Pick<FixedAnswer, 'choices' | 'rows'> | undefined) => void }) {
  const control = (choices: Question['choices'], selected: string[], id: string, label: string, change: (ids: string[]) => void) => {
    const multiple = question.kind === 'checkbox' || question.kind === 'checkbox-grid';
    return <label className="field" htmlFor={id}><span id={`${id}-label`}>{label}</span><select id={id} aria-labelledby={`fixed-title-${question.id} ${id}-label`} multiple={multiple} size={multiple ? Math.min(5, choices.length + 1) : undefined} value={multiple ? selected.length ? selected : [''] : selected[0] || ''} onChange={event => change(Array.from(event.currentTarget.selectedOptions, option => option.value).filter(Boolean))}><option value="">Ngẫu nhiên</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>{multiple && <small>Giữ Ctrl / ⌘ để chọn nhiều đáp án. Bỏ chọn để trở về ngẫu nhiên.</small>}</label>;
  };
  return <article className="question"><h3 id={`fixed-title-${question.id}`}>Câu {index + 1}. {question.title}</h3>{question.rows.length ? question.rows.map(row => <div key={row.id}>{control(row.choices, answer?.rows?.[row.id] || [], `fixed-${question.id}-${row.id}`, row.label, ids => {
    const rows = { ...answer?.rows };
    if (ids.length) rows[row.id] = ids; else delete rows[row.id];
    onChange(Object.keys(rows).length ? { rows } : undefined);
  })}</div>) : control(question.choices, answer?.choices || [], `fixed-${question.id}`, 'Đáp án cho mọi phản hồi', choices => onChange(choices.length ? { choices } : undefined))}</article>;
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
  // ponytail: configure scanned pages for this run only; saved per-form presets need form-scoped storage.
  const [fixedAnswers, setFixedAnswers] = useState<FixedAnswer[]>([]);
  const [answerRatios, setAnswerRatios] = useState<NonNullable<FillSettings['answerRatios']>>([]);
  const [fixedTextAnswers, setFixedTextAnswers] = useState<NonNullable<FillSettings['fixedTextAnswers']>>([]);
  const [configurationPage, setConfigurationPage] = useState(1);
  const tabId = useRef<number | undefined>(undefined);
  const active = engine?.phase === 'planning' || engine?.phase === 'filling';
  const activeRef = useRef(active);
  activeRef.current = active;
  const usesAI = settings.mode === 'ai' || settings.aiText;
  const configuredPage = engine?.formPages?.find(page => page.page === configurationPage);
  const configurationQuestions = configuredPage?.questions || engine?.questions || [];
  const pageForConfiguration = configuredPage?.page || engine?.page || 1;

  useEffect(() => {
    if (!extensionAvailable) return;
    let disposed = false;
    let formIdentity = '';
    async function initialize() {
      const fillPromise = runtime<FillSettings>({ type: 'GET_FILL' });
      const formPromise = (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined || !isFormUrl(tab.url)) throw new Error('Mở trang Google Forms có đường dẫn /viewform rồi mở lại tiện ích.');
        const identity = new URL(tab.url!).pathname.replace(/^\/forms\/(?:u\/\d+\/)?/, '/forms/').replace(/(?:viewform|formResponse)\/?$/, '');
        if (formIdentity !== identity || tabId.current !== tab.id) {
          formIdentity = identity;
          if (!disposed) { setFixedAnswers([]); setAnswerRatios([]); setFixedTextAnswers([]); setConfigurationPage(1); }
        }
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
    const onTabActivated = () => { if (!activeRef.current) void initialize(); };
    const onTabUpdated = (_id: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.status === 'complete' && !activeRef.current) void initialize();
    };
    chrome.tabs?.onActivated?.addListener?.(onTabActivated);
    chrome.tabs?.onUpdated?.addListener?.(onTabUpdated);
    return () => {
      disposed = true;
      chrome.tabs?.onActivated?.removeListener?.(onTabActivated);
      chrome.tabs?.onUpdated?.removeListener?.(onTabUpdated);
    };
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
      if (message.type === 'START' && message.settings.answerRatios?.some(ratio => ratio.choices.reduce((sum, choice) => sum + choice.percent, 0) !== 100)) throw new Error('Tỉ lệ mỗi câu hỏi phải cộng đúng 100%.');
      if (message.type === 'START' && message.settings.fixedTextAnswers?.some(answer => !answer.text.trim())) throw new Error('Đáp án văn bản không được để trống.');
      if (message.type === 'START' && !message.settings.autoSubmit && !await runtime<boolean>({ type: 'SAVE_FILL', settings: message.settings })) throw new Error('Không thể lưu cách điền.');
      const state = unwrap<EngineState>(await chrome.tabs.sendMessage(tabId.current, message));
      setEngine(state); setAnswers(state.answers);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  }
  function editAnswer(next: Answer) { const edited = { ...next, error: undefined }; setAnswers(previous => previous.map(answer => answer.questionId === edited.questionId ? edited : answer)); }
  function setRatio(questionId: string, page: number, ratio: NonNullable<FillSettings['answerRatios']>[number] | undefined) {
    setAnswerRatios(previous => [...previous.filter(item => item.questionId !== questionId || item.page !== page), ...(ratio ? [ratio] : [])]);
    if (ratio) setFixedAnswers(previous => previous.filter(item => item.questionId !== questionId || item.page !== page));
  }
  function fixAnswer(questionId: string, selection: Pick<FixedAnswer, 'choices' | 'rows'> | undefined) {
    const page = engine?.page || 1;
    setFixedAnswers(previous => [...previous.filter(answer => answer.questionId !== questionId || answer.page !== page), ...(selection ? [{ questionId, page, ...selection }] : [])]);
    if (selection) setFixedTextAnswers(previous => previous.filter(answer => answer.questionId !== questionId || answer.page !== page));
    if (selection) setAnswerRatios(previous => previous.filter(answer => answer.questionId !== questionId || answer.page !== page));
  }

  const step = engine?.phase === 'preview' || engine?.phase === 'done' ? 3 : engine?.questions.length ? 2 : 1;
  const ratioQuestions = configurationQuestions.filter(question => ['radio', 'dropdown', 'scale'].includes(question.kind) && question.choices.length > 0);
  const textQuestions = configurationQuestions.filter(question => ['text', 'paragraph'].includes(question.kind));
  const fixedChoiceQuestions = (engine?.questions || []).filter(question => !['text', 'paragraph', 'unsupported'].includes(question.kind) && (question.choices.length > 0 || question.rows.length > 0));

  const nextActionHint = (() => {
    if (engine?.phase === 'preview') return 'Kiểm tra và sửa câu trả lời ở trên, sau đó bấm “Áp dụng vào biểu mẫu” để ghi vào form.';
    if (active) return 'Đang thực hiện điền biểu mẫu. Bạn có thể bấm “Dừng điền” bất cứ lúc nào.';
    if (!ready || !engine) return 'Mở thẻ Google Forms rồi bấm “Quét câu hỏi” để bắt đầu.';
    if (!engine.questions.length) return 'Bấm “Quét câu hỏi” để nạp các câu hỏi từ trang Google Forms hiện tại.';
    if (settings.preview) return 'Bấm “Chuẩn bị câu trả lời” để tạo và xem trước đáp án trước khi điền.';
    return 'Bấm “Bắt đầu điền” để điền câu trả lời trực tiếp vào biểu mẫu.';
  })();

  return <main className={`popup-shell ${settings.dark ? 'theme-dark' : ''}`}><Header><button className="icon-button" aria-label="Mở cài đặt" title="Mở cài đặt" onClick={() => { if (extensionAvailable) void chrome.runtime.openOptionsPage().catch(failure => setError(errorText(failure))); else setError(browserNotice); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg></button></Header>
    <div className="popup-workspace">
      <nav className="workflow-rail" aria-label="Tiến trình">
        <ol>
          <li className={`workflow-step ${step === 1 ? 'current' : 'done'}`} aria-current={step === 1 ? 'step' : undefined}><span className="step-number" aria-hidden="true">1</span><span>Quét</span></li>
          <li className={`workflow-step ${step === 2 ? 'current' : step > 2 ? 'done' : ''}`} aria-current={step === 2 ? 'step' : undefined}><span className="step-number" aria-hidden="true">2</span><span>Chuẩn bị</span></li>
          <li className={`workflow-step ${step === 3 ? (engine?.phase === 'done' ? 'done' : 'current') : ''}`} aria-current={step === 3 && engine?.phase !== 'done' ? 'step' : undefined}><span className="step-number" aria-hidden="true">3</span><span>Xem trước</span></li>
        </ol>
      </nav>
      <div className="popup-content">
        <section className="form-status">
          <div className="section-heading"><h2>Biểu mẫu hiện tại</h2><span className={`status-pill ${active ? 'working' : ''}`}>{engine ? phases[engine.phase] : 'Chưa kết nối'}</span></div>
          {engine ? <><p className="muted">{engine.questions.length} câu hỏi · {engine.questions.filter(question => !['text', 'paragraph', 'unsupported'].includes(question.kind)).length} trắc nghiệm · {engine.questions.filter(question => ['text', 'paragraph'].includes(question.kind)).length} tự luận · Trang {engine.page}</p>{engine.target! > 1 && <><p className="muted">Đã gửi {engine.submitted || 0}/{engine.target} phản hồi</p><progress className="run-progress" max={engine.target} value={engine.submitted || 0}/></>}<div className="metrics"><div><strong>{engine.completed}</strong><span>Đã điền</span></div><div><strong>{engine.failed}</strong><span>Không thành công</span></div><div><strong>{engine.questions.filter(question => question.answered).length}</strong><span>Đã có trả lời</span></div></div></> : <div className="empty-state"><p className="muted">Mở Google Forms để quét câu hỏi và chuẩn bị câu trả lời. Chế độ thường không gửi; nút Điền biểu mẫu có thể tự gửi sau xác nhận.</p><ol className="connection-steps"><li>Mở biểu mẫu Google Forms trong một thẻ trình duyệt.</li><li>Bấm <strong>Quét câu hỏi</strong> ở thanh bên dưới để nạp nội dung.</li><li>Chọn chế độ điền và cấu hình nếu muốn trước khi bắt đầu.</li></ol></div>}
        </section>
        {engine?.phase !== 'preview' ? <><section className="panel"><h2>Cách điền</h2><label className="field" htmlFor="popup-mode"><span>Chế độ</span><select id="popup-mode" value={settings.mode} disabled={!!busy || active} onChange={event => { setSettings(previous => ({ ...previous, mode: event.target.value as FillSettings['mode'] })); setConsent(false); }}><option value="random">Ngẫu nhiên</option><option value="rules">Theo quy tắc</option><option value="ai">AI · cần API và đồng ý gửi dữ liệu</option></select></label><label className="check-row"><input type="checkbox" checked={settings.preview} disabled={!!busy || active} onChange={event => setSettings(previous => ({ ...previous, preview: event.target.checked }))}/><span>Xem và sửa câu trả lời trước khi điền<small>{settings.preview ? 'Chưa ghi vào biểu mẫu khi chuẩn bị.' : 'Câu trả lời sẽ được điền trực tiếp.'}</small></span></label>{usesAI && <><AIWarning/><label className="check-row"><input type="checkbox" checked={consent} disabled={active} onChange={event => setConsent(event.target.checked)}/><span>Tôi đồng ý gửi dữ liệu trên tới nhà cung cấp API.{settings.mode !== 'ai' && settings.aiText && <small>Đang bật AI cho câu hỏi văn bản từ Cài đặt.</small>}</span></label></>}</section>
        <details className="auto-fill-options advanced-options"><summary>Điền & gửi tự động <span className="status-pill caution">Gửi thật</span></summary><p className="muted">Giữ đáp án cố định cho câu đã chọn, ngẫu nhiên các câu còn lại; tự bấm Tiếp và gửi đủ số phản hồi. Câu văn bản cần AI hoặc đã có đáp án; gặp lỗi sẽ dừng.</p><label className="field" htmlFor="response-quantity"><span>Số lượng phản hồi</span><input id="response-quantity" type="number" min="1" max="100" step="1" value={quantity} disabled={!!busy || active} onChange={event => setQuantity(event.target.valueAsNumber)}/><small>1–100. Mỗi phản hồi sẽ được gửi thật.</small></label>
          {!!engine?.formPages?.length && <label className="field"><span>Trang cần cấu hình</span><select value={pageForConfiguration} disabled={!ready || !!busy || active} onChange={event => setConfigurationPage(Number(event.target.value))}>{engine.formPages.map(page => <option key={page.page} value={page.page}>{page.page}. {page.title}</option>)}</select><small>Cấu hình mọi trang trước khi chạy, kể cả nhánh chưa mở. Tỉ lệ nhánh tính trên tổng lượt; câu chỉ được điền khi đi qua nhánh đó.</small></label>}
          <details className="ratio-options"><summary>Phân bổ tỉ lệ · Trang {pageForConfiguration} ({answerRatios.filter(item => item.page === pageForConfiguration).length})</summary><p className="muted">Mỗi câu phải đủ 100%. Lượt lẻ chia gần nhất. Câu không đặt tỉ lệ vẫn ngẫu nhiên.</p><fieldset aria-label="Tỉ lệ đáp án cho các câu hỏi" disabled={!ready || !!busy || active}><button type="button" onClick={() => void command({ type: 'SCAN' })}>Quét câu hỏi trên trang</button>{ratioQuestions.length > 0 ? ratioQuestions.map(question => <RatioEditor key={`${pageForConfiguration}-${question.id}`} question={question} page={pageForConfiguration} ratio={answerRatios.find(item => item.questionId === question.id && item.page === pageForConfiguration)} onChange={ratio => setRatio(question.id, pageForConfiguration, ratio)}/>) : <p className="muted">{configurationQuestions.length === 0 ? 'Chưa có câu hỏi. Bấm Quét câu hỏi để tải danh sách.' : 'Trang này không có câu hỏi trắc nghiệm hoặc thang điểm phù hợp để chia tỉ lệ.'}</p>}<button type="button" disabled={!answerRatios.length} onClick={() => setAnswerRatios([])}>Bỏ tất cả tỉ lệ</button></fieldset></details>
          <details className="fixed-text-options"><summary>Đáp án văn bản · Trang {pageForConfiguration} ({fixedTextAnswers.filter(item => item.page === pageForConfiguration).length})</summary><p className="muted">Câu trả lời ngắn: mỗi dòng một đáp án (ví dụ tên trường); mỗi phản hồi chọn ngẫu nhiên một dòng, bỏ dòng trống. Đoạn văn giữ nguyên toàn bộ nội dung.</p><fieldset disabled={!ready || !!busy || active}>{textQuestions.length > 0 ? textQuestions.map(question => <label className="field" key={`${pageForConfiguration}-${question.id}`}><span>{question.title}{question.required ? ' *' : ''}</span><textarea maxLength={12000} rows={4} placeholder={question.kind === 'text' ? 'Mỗi dòng một đáp án' : 'Nhập nội dung đoạn văn'} value={fixedTextAnswers.find(item => item.questionId === question.id && item.page === pageForConfiguration)?.text || ''} onChange={event => { const text = event.target.value; setFixedTextAnswers(previous => [...previous.filter(item => item.questionId !== question.id || item.page !== pageForConfiguration), ...(text.trim() ? [{ questionId: question.id, page: pageForConfiguration, text }] : [])]); }}/></label>) : <p className="muted">{configurationQuestions.length === 0 ? 'Chưa có câu hỏi. Bấm Quét câu hỏi để tải danh sách.' : 'Trang này không có câu hỏi tự luận (trả lời ngắn hoặc đoạn văn).'}</p>}<button type="button" disabled={!fixedTextAnswers.length} onClick={() => setFixedTextAnswers([])}>Bỏ tất cả đáp án văn bản</button></fieldset></details>
          <details className="fixed-answer-options"><summary>Đáp án cố định ({fixedAnswers.length})</summary><p className="muted">Chọn đáp án dùng cho mọi lượt trong đợt chạy này, kể cả sau reload. Câu hoặc hàng để Ngẫu nhiên vẫn chọn như bình thường. Chỉ hiện câu trắc nghiệm trên trang hiện tại; bấm Quét câu hỏi nếu danh sách trống.</p><fieldset aria-label="Đáp án cố định cho các câu đã quét" disabled={!ready || !!busy || active}><button type="button" onClick={() => void command({ type: 'SCAN' })}>Quét câu hỏi trên trang</button>{fixedChoiceQuestions.length > 0 ? fixedChoiceQuestions.map((question, index) => <FixedAnswerEditor key={question.id} question={question} index={index} answer={fixedAnswers.find(answer => answer.questionId === question.id && answer.page === (engine?.page || 1))} onChange={selection => fixAnswer(question.id, selection)}/>) : <p className="muted">{!engine?.questions.length ? 'Chưa có câu hỏi. Bấm Quét câu hỏi để chọn đáp án cố định.' : 'Trang hiện tại không có câu hỏi trắc nghiệm để chọn đáp án cố định.'}</p>}<button type="button" disabled={!fixedAnswers.length} onClick={() => setFixedAnswers([])}>Bỏ tất cả đáp án cố định</button></fieldset></details>
          <button className="primary full-width submit-action" disabled={!ready || !!busy || active || (settings.aiText && !consent) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100} onClick={() => {
          if (window.confirm(`Tự điền biểu mẫu và GỬI ${quantity} phản hồi thật? Chỉ dùng với biểu mẫu bạn sở hữu hoặc được phép gửi dữ liệu thử. Đã gửi thì không thể thu hồi.`)) {
            void command({ type: 'START', settings: { ...settings, mode: 'random', preview: false, autoNext: true, autoSubmit: true, fixedAnswers, answerRatios, fixedTextAnswers }, quantity });
          }
        }}>Điền biểu mẫu</button></details></> : <section className="preview-section"><div className="section-heading"><h2>Xem trước câu trả lời</h2><span className="muted">{answers.length} câu trả lời</span></div><p className="muted">Kiểm tra nội dung trước khi áp dụng. Bản xem trước được giữ khi đóng tiện ích.</p>{engine.questions.map(question => { const answer = answers.find(item => item.questionId === question.id); return answer ? <AnswerEditor key={question.id} question={question} answer={answer} onChange={editAnswer}/> : <article className="question" key={question.id}><h3>{question.title || 'Không có tiêu đề'}</h3><span className="kind">{kinds[question.kind]}</span><p className="muted">Không có câu trả lời được tạo{question.answered ? ' · Đã có trả lời trên biểu mẫu' : ''}.</p></article>; })}</section>}
        <Notice error={error || (engine?.phase === 'error' ? engine.logs.at(-1) || 'Tác vụ thất bại. Kiểm tra nhật ký.' : '')} busy={busy || (active && engine ? `${phases[engine.phase]}… Có thể dừng bất cứ lúc nào.` : '')} message={!extensionAvailable ? browserNotice : undefined}/>
        {engine && engine.phase !== 'preview' && engine.questions.length > 0 && <details className="details"><summary>Câu hỏi đã quét ({engine.questions.length})</summary><ul className="question-list">{engine.questions.map(question => <li key={question.id}><span>{question.title || 'Không có tiêu đề'}{question.required ? ' *' : ''}</span><small>{kinds[question.kind]}{question.answered ? ' · Đã trả lời' : ''}</small></li>)}</ul></details>}
        {engine && <details className="details"><summary>Nhật ký ({engine.logs.length})</summary>{engine.logs.length ? <ol className="logs">{engine.logs.map((log, index) => <li key={index}>{log}</li>)}</ol> : <p className="muted">Chưa có hoạt động.</p>}</details>}
      </div>
    </div>
    <div className="popup-bottom-bar">
      <p className="next-action-hint">{nextActionHint}</p>
      {engine?.phase === 'preview' ? <div className="action-row"><button className="primary full-width" disabled={!ready || !!busy || !answers.length} onClick={() => void command({ type: 'APPLY', answers })}>Áp dụng vào biểu mẫu</button><button className="danger" disabled={!ready || !!busy} onClick={() => void command({ type: 'RESET' })}>Hủy xem trước</button></div> : <div className="action-row"><button disabled={!ready || !!busy || active} onClick={() => void command({ type: 'SCAN' })}>Quét câu hỏi</button>{active ? <button className="danger" disabled={!!busy} onClick={() => void command({ type: 'STOP' })}>Dừng điền</button> : <button className="primary" disabled={!ready || !!busy || (usesAI && !consent)} onClick={() => void command({ type: 'START', settings })}>{settings.preview ? 'Chuẩn bị câu trả lời' : 'Bắt đầu điền'}</button>}</div>}
      <footer className="popup-footer"><span>Chỉ “Điền biểu mẫu” tự gửi</span><button className="text-button" disabled={!ready || !!busy || active} onClick={() => { if (window.confirm('Xóa bản xem trước và tiến trình đang lưu? Không thể hoàn tác. Câu trả lời đã điền trên biểu mẫu được giữ nguyên.')) void command({ type: 'RESET' }); }}>Làm mới tiến trình</button></footer>
    </div></main>;
}
export default App;
