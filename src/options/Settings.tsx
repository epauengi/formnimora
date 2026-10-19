import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_API, DEFAULT_FILL, type APISettings, type FillSettings } from '../types';
import { AIWarning, Header, Notice, browserNotice, errorText, extensionAvailable, runtime, validateApi } from '../ui/shared';

function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) { return <label className="field" htmlFor={id}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) { return <label className="check-row"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><span>{label}{hint && <small>{hint}</small>}</span></label>; }

export function Settings() {
  const [fill, setFill] = useState<FillSettings>({ ...DEFAULT_FILL });
  const [api, setApi] = useState<APISettings>({ ...DEFAULT_API });
  const [showKey, setShowKey] = useState(false);
  const [loadedFill, setLoadedFill] = useState(false);
  const [loadedApi, setLoadedApi] = useState(false);
  const [busy, setBusy] = useState(extensionAvailable ? 'Đang tải cài đặt…' : '');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [aiConsent, setAiConsent] = useState(false);
  const usesAI = fill.mode === 'ai' || fill.aiText;
  const changeFill = <K extends keyof FillSettings>(key: K, value: FillSettings[K]) => { setFill(previous => ({ ...previous, [key]: value })); if (key === 'mode' || key === 'aiText') setAiConsent(false); };
  const changeApi = <K extends keyof APISettings>(key: K, value: APISettings[K]) => setApi(previous => ({ ...previous, [key]: value }));
  function changeProvider(provider: APISettings['provider']) {
    setShowKey(false);
    setApi(previous => previous.provider === provider ? previous : {
      ...previous, provider,
      ...(provider === 'google' ? { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', apiKey: '' }
        : provider === 'openai' ? { baseUrl: DEFAULT_API.baseUrl, model: DEFAULT_API.model, apiKey: '' } : {}),
    });
  }

  useEffect(() => {
    if (!extensionAvailable) return;
    let disposed = false;
    void Promise.allSettled([runtime<FillSettings>({ type: 'GET_FILL' }), runtime<APISettings>({ type: 'GET_API' })]).then(([fillResult, apiResult]) => {
      if (disposed) return;
      if (fillResult.status === 'fulfilled') { setFill(fillResult.value); setLoadedFill(true); }
      if (apiResult.status === 'fulfilled') { setApi(apiResult.value); setLoadedApi(true); }
      setError([fillResult, apiResult].filter(result => result.status === 'rejected').map(result => errorText((result as PromiseRejectedResult).reason)).join(' '));
      setBusy('');
    });
    return () => { disposed = true; };
  }, []);

  async function saveFill() {
    setError(''); setMessage('');
    if (!Number.isInteger(fill.delay) || fill.delay < 0 || fill.delay > 5000 || !Number.isInteger(fill.checkboxCount) || fill.checkboxCount < 1 || fill.checkboxCount > 20) { setError('Độ trễ phải từ 0–5000 ms; số lựa chọn phải từ 1–20, dùng số nguyên.'); return; }
    if (fill.rules.length > 100 || fill.rules.some(rule => !rule.contains.trim() || rule.contains.length > 500 || rule.answers.length > 100 || rule.answers.some(answer => answer.length > 2000) || !rule.answers.some(answer => answer.trim()))) { setError('Mỗi quy tắc cần từ khóa (tối đa 500 ký tự) và câu trả lời (tối đa 2000 ký tự). Tối đa 100 quy tắc và 100 câu trả lời mỗi quy tắc.'); return; }
    if (fill.personalContext.length > 6000) { setError('Ngữ cảnh cá nhân tối đa 6000 ký tự.'); return; }
    if (usesAI && !aiConsent) { setError('Đồng ý gửi dữ liệu tới nhà cung cấp trước khi lưu chế độ AI.'); return; }
    setBusy('Đang lưu cách điền…');
    try { if (!await runtime<boolean>({ type: 'SAVE_FILL', settings: { ...fill, rules: fill.rules.map(rule => ({ contains: rule.contains.trim(), answers: rule.answers.map(answer => answer.trim()).filter(Boolean) })) } })) throw new Error('Không thể lưu cách điền.'); setMessage('Đã lưu cách điền.'); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  }

  // Request permission before any await: Chrome requires the direct Save/Test gesture.
  function saveApi(test: boolean) {
    setError(''); setMessage('');
    if (!extensionAvailable) { setError(browserNotice); return; }
    let origin: string;
    try { origin = validateApi(api); if (test && !api.apiKey.trim()) throw new Error('Nhập khóa API trước khi kiểm tra.'); }
    catch (failure) { setError(errorText(failure)); return; }
    const snapshot = { ...api, baseUrl: api.baseUrl.trim(), model: api.model.trim(), apiKey: api.apiKey.trim() };
    let permission: Promise<boolean>;
    try { permission = chrome.permissions.request({ origins: [origin] }); }
    catch (failure) { setError(errorText(failure)); return; }
    setBusy(test ? 'Đang xin quyền và kiểm tra API…' : 'Đang xin quyền và lưu API…');
    void (async () => {
      try {
        if (!await permission) throw new Error('Quyền truy cập API chưa được cấp. Cài đặt chưa được lưu.');
        if (!await runtime<boolean>({ type: 'SAVE_API', settings: snapshot })) throw new Error('Không thể lưu cấu hình API.');
        setApi(snapshot);
        if (test) { setMessage(`Đã lưu cấu hình. Kết quả kiểm tra: ${await runtime<string>({ type: 'TEST_API' })}`); }
        else setMessage('Đã lưu cấu hình API.');
      } catch (failure) { setError(errorText(failure)); }
      finally { setBusy(''); }
    })();
  }

  async function deleteKey() {
    if (!window.confirm('Xóa khóa API đang lưu trên thiết bị này? Bạn cần nhập lại để sử dụng AI.')) return;
    setError(''); setMessage(''); setBusy('Đang xóa khóa…');
    try { if (!await runtime<boolean>({ type: 'DELETE_KEY' })) throw new Error('Không thể xóa khóa API.'); setApi(previous => ({ ...previous, apiKey: '' })); setMessage('Đã xóa khóa API.'); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  }

  return <main className={`settings-shell ${fill.dark ? 'theme-dark' : ''}`}><div className="settings-inner">
    <Header settings/>
    <div className="settings-intro">
      <div>
        <h2>Cài đặt</h2>
        <p className="muted">Chọn cách trả lời, xem trước và quản lý kết nối AI. Chế độ thường không gửi.</p>
      </div>
      <nav className="settings-nav" aria-label="Các mục cài đặt"><a href="#fill-settings">Cách điền & câu trả lời</a><a href="#api-settings">Nhà cung cấp & bảo mật</a></nav>
    </div>
    <Notice error={error} busy={busy} message={!extensionAvailable ? browserNotice : message}/>
    <div className="settings-grid">
      <form id="fill-settings" className="settings-card" aria-labelledby="fill-settings-title" onInvalidCapture={event => { const details = (event.target as HTMLElement).closest('details'); if (details) details.open = true; }} onSubmit={event => { event.preventDefault(); void saveFill(); }}>
        <div className="card-heading"><h2 id="fill-settings-title">Cách điền & câu trả lời</h2><p>Áp dụng cho lần bắt đầu tiếp theo.</p></div>
        <fieldset disabled={!!busy || !extensionAvailable || !loadedFill}>
          <section className="settings-section" aria-labelledby="answer-settings-title">
            <h3 id="answer-settings-title">Cách trả lời</h3>
            <Field id="mode" label="Chế độ điền"><select id="mode" value={fill.mode} onChange={event => changeFill('mode', event.target.value as FillSettings['mode'])}><option value="random">Ngẫu nhiên</option><option value="rules">Theo quy tắc</option><option value="ai">AI · gửi dữ liệu tới API</option></select></Field>
            <Toggle label="AI cho câu hỏi văn bản" checked={fill.aiText} onChange={value => changeFill('aiText', value)} hint="Mặc định tắt. Khi bật, câu hỏi văn bản dùng API cả trong chế độ ngẫu nhiên hoặc quy tắc."/>
            {usesAI && <><AIWarning/><Toggle label="Tôi đồng ý gửi câu hỏi và ngữ cảnh cá nhân tới nhà cung cấp API." checked={aiConsent} onChange={setAiConsent}/></>}
          </section>
          <section className="settings-section" aria-labelledby="control-settings-title">
            <h3 id="control-settings-title">Kiểm soát thao tác</h3>
            <div className="toggle-group"><Toggle label="Xem trước khi điền" checked={fill.preview} onChange={value => changeFill('preview', value)} hint="Cho phép chỉnh sửa câu trả lời trước khi áp dụng."/><Toggle label="Bỏ qua câu đã trả lời" checked={fill.skipAnswered} onChange={value => changeFill('skipAnswered', value)}/><Toggle label="Tự chuyển sang trang tiếp theo" checked={fill.autoNext} onChange={value => changeFill('autoNext', value)} hint="Không tự nhấn nút Gửi."/><Toggle label="Giao diện tối" checked={fill.dark} onChange={value => changeFill('dark', value)}/></div>
            <details className="advanced-options"><summary>Tùy chọn thao tác</summary>
              <div className="field-pair"><Field id="delay" label="Độ trễ (ms)" hint="0–5000 ms giữa các thao tác"><input id="delay" type="number" min="0" max="5000" step="1" required value={fill.delay} onChange={event => changeFill('delay', event.target.valueAsNumber)}/></Field><Field id="checkbox-count" label="Số lựa chọn (hộp kiểm)" hint="1–20 lựa chọn"><input id="checkbox-count" type="number" min="1" max="20" step="1" required value={fill.checkboxCount} onChange={event => changeFill('checkboxCount', event.target.valueAsNumber)}/></Field></div>
            </details>
          </section>
          {usesAI && <section className="settings-section" aria-labelledby="ai-context-title">
            <h3 id="ai-context-title">Ngữ cảnh trả lời AI</h3>
            <div className="field-pair"><Field id="answer-length" label="Độ dài trả lời AI"><select id="answer-length" value={fill.answerLength} onChange={event => changeFill('answerLength', event.target.value as FillSettings['answerLength'])}><option value="short">Ngắn</option><option value="medium">Vừa</option><option value="long">Dài</option></select></Field><Field id="language" label="Ngôn ngữ trả lời AI"><select id="language" value={fill.language} onChange={event => changeFill('language', event.target.value as FillSettings['language'])}><option value="auto">Theo biểu mẫu</option><option value="vi">Tiếng Việt</option><option value="en">Tiếng Anh</option></select></Field></div>
            <Field id="personal-context" label="Ngữ cảnh cá nhân cho AI" hint="Chỉ nhập thông tin bạn đồng ý gửi tới nhà cung cấp API."><textarea id="personal-context" rows={4} value={fill.personalContext} onChange={event => changeFill('personalContext', event.target.value)} placeholder="Ví dụ: Tôi là sinh viên, ưu tiên câu trả lời ngắn gọn."/></Field>
          </section>}
          <details className="advanced-options rules-section" open={fill.mode === 'rules' || fill.rules.length > 0}>
            <summary>Quy tắc trả lời</summary>
            <div className="section-heading"><p className="muted">Khớp từ khóa trong câu hỏi. Với lựa chọn, nhập đúng nhãn; dùng dấu phẩy để tách nhiều câu trả lời.</p><button type="button" className="text-button" onClick={() => setFill(previous => ({ ...previous, rules: [...previous.rules, { contains: '', answers: [] }] }))}>+ Thêm quy tắc</button></div>
            {fill.rules.length === 0 && <p className="empty-rule">Chưa có quy tắc. Thêm từ khóa và câu trả lời của bạn.</p>}
            {fill.rules.map((rule, index) => <div className="rule-row" key={index}><Field id={`rule-contains-${index}`} label={`Quy tắc ${index + 1} · Câu hỏi chứa`}><input id={`rule-contains-${index}`} required value={rule.contains} onChange={event => setFill(previous => ({ ...previous, rules: previous.rules.map((item, row) => row === index ? { ...item, contains: event.target.value } : item) }))} placeholder="Ví dụ: nghề nghiệp"/></Field><Field id={`rule-answers-${index}`} label="Câu trả lời (cách nhau bằng dấu phẩy)"><input id={`rule-answers-${index}`} required value={rule.answers.join(',')} onChange={event => setFill(previous => ({ ...previous, rules: previous.rules.map((item, row) => row === index ? { ...item, answers: event.target.value.split(',') } : item) }))} placeholder="Ví dụ: Sinh viên, Nhân viên"/></Field><button type="button" className="text-button danger-text" aria-label={`Xóa quy tắc ${index + 1}`} onClick={() => setFill(previous => ({ ...previous, rules: previous.rules.filter((_, row) => row !== index) }))}>Xóa quy tắc</button></div>)}
          </details>
          <div className="settings-actions"><button className="primary full-width" type="submit" disabled={usesAI && !aiConsent}>Lưu cách điền</button></div>
        </fieldset>
      </form>
      <form id="api-settings" className="settings-card api-card" aria-labelledby="api-settings-title" onInvalidCapture={event => { const details = (event.target as HTMLElement).closest('details'); if (details) details.open = true; }} onSubmit={event => { event.preventDefault(); saveApi(false); }}>
        <div className="card-heading"><h2 id="api-settings-title">Nhà cung cấp & bảo mật</h2><p>OpenAI, Google Gemini hoặc API tương thích OpenAI.</p></div>
        <fieldset disabled={!!busy || !extensionAvailable || !loadedApi}>
          <section className="settings-section" aria-labelledby="connection-settings-title">
            <h3 id="connection-settings-title">Kết nối API</h3>
            <Field id="provider" label="Nhà cung cấp" hint="Chọn Google hoặc OpenAI sẽ đặt URL, mô hình mặc định và xóa khóa đang nhập; nhập khóa của nhà cung cấp mới."><select id="provider" value={api.provider} onChange={event => changeProvider(event.target.value as APISettings['provider'])}><option value="openai">OpenAI</option><option value="google">Google (Gemini)</option><option value="custom">API tùy chỉnh (tương thích OpenAI)</option></select></Field>
            <Field id="base-url" label="URL API" hint={api.provider === 'google' ? 'Endpoint tương thích OpenAI chính thức của Gemini. Dùng khóa từ Google AI Studio.' : 'HTTPS, ví dụ https://api.openai.com/v1. HTTP chỉ được dùng với localhost.'}><input id="base-url" type="url" required value={api.baseUrl} onChange={event => changeApi('baseUrl', event.target.value)} spellCheck={false}/></Field>
            <Field id="api-key" label="Khóa API"><input id="api-key" type={showKey ? 'text' : 'password'} autoComplete="off" value={api.apiKey} onChange={event => changeApi('apiKey', event.target.value)} spellCheck={false}/></Field><Toggle label="Hiện khóa API" checked={showKey} onChange={setShowKey}/>
            <p className="privacy-note">Khóa được lưu cục bộ trong Chrome, không được mã hóa. Khóa không bao giờ được gửi tới trang biểu mẫu. Chỉ cấp quyền cho đúng máy chủ API khi bạn nhấn Lưu hoặc Kiểm tra.</p>
            <Field id="model" label="Mô hình"><input id="model" required value={api.model} onChange={event => changeApi('model', event.target.value)} placeholder={api.provider === 'google' ? 'gemini-3.8-flash' : 'gpt-4o-mini'} spellCheck={false}/></Field>
          </section>
          <details className="advanced-options"><summary>Tùy chọn AI nâng cao</summary>
            <div className="field-pair"><Field id="temperature" label="Temperature" hint="0–2 · thấp hơn, ổn định hơn"><input id="temperature" type="number" min="0" max="2" step="0.1" required value={api.temperature} onChange={event => changeApi('temperature', event.target.valueAsNumber)}/></Field><Field id="max-tokens" label="Max tokens" hint="1–4096"><input id="max-tokens" type="number" min="1" max="4096" step="1" required value={api.maxTokens} onChange={event => changeApi('maxTokens', event.target.valueAsNumber)}/></Field></div>
            <div className="field-pair"><Field id="timeout" label="Thời gian chờ (ms)" hint="1000–25000 ms"><input id="timeout" type="number" min="1000" max="25000" step="1" required value={api.timeout} onChange={event => changeApi('timeout', event.target.valueAsNumber)}/></Field><Field id="retry-count" label="Số lần thử lại" hint="0–3 lần"><input id="retry-count" type="number" min="0" max="3" step="1" required value={api.retryCount} onChange={event => changeApi('retryCount', event.target.valueAsNumber)}/></Field></div>
            <Field id="system-prompt" label="Chỉ dẫn cho AI" hint="Được gửi cùng yêu cầu tới nhà cung cấp API."><textarea id="system-prompt" rows={4} value={api.systemPrompt} onChange={event => changeApi('systemPrompt', event.target.value)} placeholder="Ví dụ: Trả lời tự nhiên, không bịa thông tin cá nhân."/></Field>
          </details>
          <div className="settings-actions">
            <div className="action-row"><button type="submit" className="primary">Lưu cấu hình API</button><button type="button" onClick={() => saveApi(true)}>Lưu & kiểm tra API</button></div>
            <button type="button" className="text-button danger-text full-width" disabled={!api.apiKey.trim()} onClick={() => void deleteKey()}>Xóa khóa đã lưu</button>
            <p className="muted api-footnote">Kiểm tra sẽ lưu cấu hình hiện tại và gửi một yêu cầu tới API; nhà cung cấp có thể tính phí.</p>
          </div>
        </fieldset>
      </form>
    </div>
    <footer className="settings-footer">FormNimora · Dữ liệu cài đặt được lưu trên thiết bị này.</footer>
  </div></main>;
}
export default Settings;
