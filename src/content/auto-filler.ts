import type { Answer, EngineState, FillSettings, Result } from '../types';
import { DEFAULT_FILL } from '../types';
import { checked, enabled, setText, sleep, visible } from './dom-utils';
import { pageSignature, scanForm, type DOMQuestion } from './form-scanner';
import { planAnswer, validateAnswer, validateFillSettings } from './answer-planner';

export function toViewformUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    if (!url.protocol.startsWith('http')) throw new Error('Not http');
    const cleanedPath = url.pathname.replace(/(?:viewform|formResponse)\/?$/, 'viewform');
    return `${url.origin}${cleanedPath}`;
  } catch {
    return urlStr.split(/[?#]/, 1)[0].replace(/(?:viewform|formResponse)\/?$/, 'viewform');
  }
}

export function formatFormConfirmUrl(baseFormUrl: string, currentUrlStr?: string): string {
  const current = currentUrlStr || (typeof location !== 'undefined' ? location.href : '');
  let base = toViewformUrl(baseFormUrl || current);
  if (!/\/forms\/u\/\d+\//.test(base)) {
    const userMatch = current.match(/\/forms\/u\/(\d+)\//);
    if (userMatch) base = base.replace(/\/forms\/(?:d\/)/, `/forms/u/${userMatch[1]}/d/`);
  }
  return `${base}?usp=form_confirm`;
}

export function isConfirmationPage(): boolean {
  if (scanForm().length > 0) return false;
  const text = (typeof document !== 'undefined' ? (document.body?.innerText || document.body?.textContent || '') : '').normalize('NFC').toLowerCase();
  const accepted = /câu trả lời của bạn đã được ghi|your response has been recorded|phản hồi của bạn đã được ghi|gửi ý kiến phản hồi khác|submit another response/i;
  return accepted.test(text);
}

const initial = (): EngineState => ({ phase: 'idle', questions: [], answers: [], completed: 0, failed: 0, page: 1, logs: [], submitted: 0, target: 1 });
export class AutoFillEngine {
  state = initial();
  constructor(private readonly navigate: (url: string) => void = url => location.assign(url), private readonly currentUrl: () => string = () => location.href) {}
  private controller?: AbortController;
  private settings = DEFAULT_FILL;
  private previewSignature = '';
  private formUrl = '';
  private resumeAfterConfirm = false;
  private log(message: string) { this.state.logs = [...this.state.logs.slice(-49), message]; }
  private scan() { this.state.questions = scanForm().map(item => item.question); }
  private async clearRun() { await chrome.runtime.sendMessage({ type: 'CLEAR_RUN' }); }
  resume(settings: FillSettings, state: EngineState, resumeAfterConfirm = false, formUrl?: string) {
    if (this.controller || this.state.phase !== 'idle') return;
    validateFillSettings(settings);
    this.settings = structuredClone(settings);
    this.formUrl = formUrl || toViewformUrl(this.currentUrl());
    this.resumeAfterConfirm = resumeAfterConfirm;
    this.state = { ...structuredClone(state), questions: [], answers: [] };
    this.controller = new AbortController();
    void this.handleResume(this.controller);
  }
  private async handleResume(controller: AbortController) {
    try {
      await this.continueResume(controller);
    } catch (error) {
      this.state.phase = controller.signal.aborted ? 'stopped' : 'error';
      this.log(controller.signal.aborted ? 'Đã dừng. Giữ nguyên câu trả lời.' : error instanceof Error ? error.message : 'Không thể tiếp tục tác vụ.');
      await this.clearRun().catch(() => {});
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
  private async continueResume(controller: AbortController) {
    const signal = controller.signal;
    for (let attempt = 0; attempt < 150; attempt++) {
      signal.throwIfAborted();
      if (isConfirmationPage() || scanForm().length > 0) break;
      await sleep(100, signal);
    }
    if (isConfirmationPage()) {
      const current = this.state.submitted || 0;
      const target = this.state.target || 1;
      this.log(`Google Forms xác nhận phản hồi ${current}/${target}.`);
      if (current >= target) {
        this.state.phase = 'done';
        await this.clearRun();
        this.log(`Đã hoàn thành toàn bộ ${current}/${target} phản hồi.`);
        if (this.controller === controller) this.controller = undefined;
        return;
      }
      this.log(`Chuẩn bị gửi phản hồi tiếp theo (${current + 1}/${target})...`);
      const progress: EngineState = {
        ...this.state,
        phase: 'planning',
        page: 1,
        questions: [],
        answers: [],
      };
      const saved = await chrome.runtime.sendMessage({
        type: 'SAVE_RUN',
        settings: this.settings,
        state: progress,
        formUrl: this.formUrl,
        resumeAfterConfirm: false,
      }) as Result<boolean>;
      if (!saved?.ok) throw new Error('Không lưu được tiến trình cho phản hồi tiếp theo. Đã dừng.');
      controller.signal.throwIfAborted();
      const nextUrl = formatFormConfirmUrl(this.formUrl, this.currentUrl());
      this.navigate(nextUrl);
      return;
    }
    if (this.resumeAfterConfirm && (this.state.submitted || 0) >= (this.state.target || 1)) {
      throw new Error('Chưa xác nhận phản hồi cuối. Đã dừng để tránh gửi vượt số lượng.');
    }
    this.state.phase = 'planning';
    await this.run(controller, false, true);
  }
  status(): EngineState { return structuredClone(this.state); }
  scanOnly(): EngineState {
    if (this.controller || ['preview', 'planning', 'filling'].includes(this.state.phase)) throw new Error('Dừng tác vụ hoặc Reset preview trước khi quét lại.');
    this.scan(); return this.status();
  }
  stop() {
    this.controller?.abort();
    void chrome.runtime.sendMessage({ type: 'CANCEL_AI' }).catch(() => {});
    void this.clearRun().catch(() => {});
    if (this.controller || ['preview', 'planning', 'filling'].includes(this.state.phase)) this.state.phase = 'stopped';
  }
  reset() {
    if (this.controller) throw new Error('Dừng tác vụ trước khi Reset.');
    this.state = initial(); this.scan(); this.log('Đã đặt lại tác vụ. Câu trả lời trên form được giữ nguyên.');
  }
  start(settings: FillSettings, quantity = 1) {
    if (this.controller || ['preview', 'planning', 'filling'].includes(this.state.phase)) throw new Error('Đang có tác vụ hoặc preview chưa xác nhận.');
    validateFillSettings(settings);
    if (settings.autoSubmit && (!settings.autoNext || settings.preview)) throw new Error('Điền & gửi cần chuyển trang tự động và tắt xem trước.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Số phản hồi phải từ 1–100.');
    this.settings = structuredClone(settings);
    this.formUrl = toViewformUrl(this.currentUrl());
    this.state = { ...initial(), target: settings.autoSubmit ? quantity : 1 };
    this.controller = new AbortController();
    this.state.phase = 'planning';
    void this.run(this.controller);
  }
  apply(answers: Answer[]) {
    if (this.controller || this.state.phase !== 'preview') throw new Error('Không có preview để điền.');
    if (pageSignature() !== this.previewSignature) throw new Error('Trang form đã thay đổi. Reset rồi quét lại.');
    if (!Array.isArray(answers) || answers.length !== this.state.answers.length) throw new Error('Danh sách preview không hợp lệ.');
    const ids = new Set<string>();
    answers.forEach(answer => {
      const original = this.state.answers.find(item => item.questionId === answer.questionId);
      const question = this.state.questions.find(item => item.id === answer.questionId);
      if (!original || !question || ids.has(answer.questionId)) throw new Error('Câu hỏi preview không hợp lệ.');
      ids.add(answer.questionId);
      if (!answer.error) validateAnswer(question, answer);
      else if (answer.error !== original.error) throw new Error('Lỗi preview không hợp lệ.');
    });
    this.state.answers = structuredClone(answers);
    this.controller = new AbortController();
    this.state.phase = 'filling';
    void this.run(this.controller, true);
  }
  private async run(controller: AbortController, applyPreview = false, resumed = false) {
    const signal = controller.signal;
    let navigationPending = false;
    try {
      if (resumed) {
        // Navigation may mount before questions. Never treat Send alone as readiness.
        // ponytail: empty resumed sections stop for manual review; automatic empty-section handling needs a reliable Forms readiness signal.
        const ready = () => {
          const nodes = scanForm();
          return nodes.length > 0 && nodes.every(item => item.text || item.dropdown || item.controls.size || item.rowControls.size) &&
            !!this.navigationButton(/^(next|tiếp|tiếp theo|submit|gửi)$/i);
        };
        let mounted = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          signal.throwIfAborted();
          if (ready()) {
            const before = pageSignature();
            await sleep(300, signal);
            if (ready() && pageSignature() === before) { mounted = true; break; }
          }
          await sleep(100, signal);
        }
        if (!mounted) throw new Error('Chưa xác nhận câu hỏi trang mới đã tải. Phần trống hoặc chưa sẵn sàng cần kiểm tra thủ công; chưa gửi.');
        this.resumeAfterConfirm = false;
      }
      for (;;) {
        signal.throwIfAborted();
        if (!applyPreview) {
          this.state.phase = 'planning'; this.scan(); this.state.answers = [];
          if (!this.state.questions.length && !this.navigationButton(/^(next|tiếp|tiếp theo|submit|gửi)$/i)) throw new Error('Không tìm thấy câu hỏi hoặc nút điều hướng trên trang này.');
          const nodes = scanForm();
          for (const item of nodes) {
            signal.throwIfAborted();
            // Google may populate dropdown options only after opening it.
            if (item.question.kind === 'dropdown' && !item.question.choices.length && item.dropdown) {
              item.dropdown.click(); await sleep(150, signal);
              this.scan();
            }
            const question = this.state.questions.find(question => question.id === item.question.id) || item.question;
            try {
              const answer = await planAnswer(question, this.settings, signal);
              if (answer) this.state.answers.push(answer);
            } catch (error) {
              signal.throwIfAborted();
              const message = error instanceof Error ? error.message : 'Lỗi tạo câu trả lời.';
              this.state.answers.push({ questionId: question.id, error: message });
              this.log(`${question.title}: ${message}`);
            }
          }
          if (this.settings.preview) {
            this.previewSignature = pageSignature(); this.state.phase = 'preview';
            this.log('Kiểm tra và chỉnh sửa đáp án trước khi điền.'); return;
          }
        }
        this.state.phase = 'filling';
        for (const answer of this.state.answers) {
          signal.throwIfAborted();
          if (answer.error) { this.state.failed++; continue; }
          try {
            for (let attempt = 0; ; attempt++) {
              try {
                const item = scanForm().find(item => item.question.id === answer.questionId);
                if (!item) throw new Error('Câu hỏi đã biến mất khỏi DOM.');
                if (attempt === 0 && this.settings.skipAnswered && item.question.answered) break;
                validateAnswer(item.question, answer);
                await this.fill(item, answer, signal); break;
              } catch (error) {
                signal.throwIfAborted();
                if (attempt >= 2) throw error;
                await sleep(200, signal);
              }
            }
            this.state.completed++;
          } catch (error) {
            signal.throwIfAborted(); this.state.failed++;
            this.log(`${answer.questionId}: ${error instanceof Error ? error.message : 'Điền thất bại.'}`);
          }
          await sleep(this.settings.delay, signal);
        }
        this.scan();
        if (this.state.failed > 0 && this.settings.autoSubmit) throw new Error('Có câu điền thất bại. Đã dừng, chưa gửi biểu mẫu.');
        if (!this.settings.autoNext || this.state.failed > 0) break;
        const next = this.navigationButton(/^(next|tiếp|tiếp theo)$/i);
        if (!next) {
          if (this.settings.autoSubmit) {
            this.assertSafeToAdvance();
            const submit = this.navigationButton(/^(submit|gửi)$/i);
            if (!submit) throw new Error('Không tìm thấy nút Gửi khả dụng. Chưa gửi biểu mẫu.');
            const currentSubmitted = this.state.submitted || 0;
            const nextSubmitted = currentSubmitted + 1;
            const target = this.state.target || 1;
            signal.throwIfAborted();
            if (target > 1) {
              const progress: EngineState = {
                ...this.state,
                submitted: nextSubmitted,
                target,
                phase: 'planning',
                page: 1,
                questions: [],
                answers: [],
              };
              const saved = await chrome.runtime.sendMessage({
                type: 'SAVE_RUN',
                settings: this.settings,
                state: progress,
                formUrl: this.formUrl,
                resumeAfterConfirm: true,
              }) as Result<boolean>;
              if (!saved?.ok) throw new Error('Không lưu được tiến trình trước khi gửi.');
            } else {
              await this.clearRun();
            }
            signal.throwIfAborted();
            this.log(`Đang gửi phản hồi (${nextSubmitted}/${target})...`);
            if (target > 1) navigationPending = true;
            submit.click();
            try {
              await this.waitForSubmission(signal);
            } catch (error) {
              navigationPending = false;
              throw error;
            }
            this.state.submitted = nextSubmitted;
            this.log(`Google Forms xác nhận phản hồi ${nextSubmitted}/${target}.`);
            if (nextSubmitted >= target) {
              this.state.phase = 'done';
              await this.clearRun();
              navigationPending = false;
              if (target > 1) this.log(`Đã hoàn thành toàn bộ ${nextSubmitted}/${target} phản hồi.`);
              return;
            }
            navigationPending = true;
            const nextUrl = formatFormConfirmUrl(this.formUrl, this.currentUrl());
            this.navigate(nextUrl);
            await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Đã dừng', 'AbortError')), { once: true }));
          }
          break;
        }
        if (this.state.page >= 20) throw new Error('Đã chạm giới hạn 20 phần. Chưa gửi biểu mẫu.');
        this.assertSafeToAdvance();
        const before = pageSignature();
        const previousHeadings = scanForm().map(item => item.root.querySelector('[role="heading"]')!);
        const checkpoint = await chrome.runtime.sendMessage({ type: 'SAVE_RUN', settings: this.settings, state: { ...this.state, page: this.state.page + 1 }, formUrl: this.formUrl }) as Result<boolean>;
        if (!checkpoint?.ok) throw new Error('Không lưu được tiến trình chuyển phần. Đã dừng.');
        signal.throwIfAborted();
        navigationPending = true;
        next.click();
        await this.waitForPage(before, previousHeadings, signal);
        await this.clearRun();
        navigationPending = false;
        this.state.page++; applyPreview = false;
      }
      this.state.phase = 'done'; this.log('Đã hoàn tất điền. Kiểm tra form và tự xác nhận gửi.');
    } catch (error) {
      this.state.phase = signal.aborted ? 'stopped' : navigationPending ? 'filling' : 'error';
      this.log(signal.aborted ? 'Đã dừng. Các câu trả lời đã điền được giữ nguyên.' : error instanceof Error ? error.message : 'Tác vụ thất bại.');
      if (navigationPending && !signal.aborted) {
        // ponytail: checkpoint expires after 2 minutes; longer navigation needs a longer TTL.
        await sleep(105_000, signal).catch(() => {});
        navigationPending = false;
        this.state.phase = signal.aborted ? 'stopped' : 'error';
        this.log(signal.aborted ? 'Đã dừng. Giữ nguyên câu trả lời.' : 'Hết thời gian chờ trang mới. Đã hủy tiến trình; chưa gửi.');
      }
    } finally {
      if (!navigationPending) await this.clearRun().catch(() => {});
      if (this.controller === controller) this.controller = undefined;
    }
  }
  private navigationButton(pattern: RegExp): HTMLElement | undefined {
    // Google Forms can expose the visible caption separately from its accessible name.
    return [...document.querySelectorAll<HTMLElement>('[role="button"], button')].find(button => {
      if (!visible(button) || !enabled(button) || button.closest('[role="listitem"]')) return false;
      const labelled = button.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
      const names = [button.innerText, button.textContent, button.getAttribute('aria-label'), labelled, button.getAttribute('title'), button.getAttribute('data-value')]
        .filter((text): text is string => !!text).map(text => text.normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim());
      return names.some(text => pattern.test(text) &&
        (!(button instanceof HTMLButtonElement) || button.type !== 'submit' || /^(submit|gửi)$/i.test(text)));
    });
  }
  private assertSafeToAdvance() {
    const invalid = [...document.querySelectorAll('[aria-invalid="true"], input:invalid, textarea:invalid, select:invalid')].some(visible);
    const captcha = [...document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha')].some(visible);
    const missing = scanForm().some(item => item.question.required && !item.question.answered);
    if (invalid || captcha || missing) throw new Error('Còn câu bắt buộc, dữ liệu không hợp lệ hoặc CAPTCHA. Đã dừng, chưa gửi.');
  }
  private async waitForSubmission(signal: AbortSignal) {
    for (let attempt = 0; attempt < 80; attempt++) {
      signal.throwIfAborted();
      if (isConfirmationPage()) return;
      if ([...document.querySelectorAll('[aria-invalid="true"]')].some(visible)) throw new Error('Google Forms từ chối dữ liệu. Không tự gửi lại.');
      await sleep(100, signal);
    }
    throw new Error('Đã bấm Gửi nhưng chưa xác nhận được kết quả. Kiểm tra form; không tự gửi lại.');
  }
  private async fill(item: DOMQuestion, answer: Answer, signal: AbortSignal) {
    if (answer.text !== undefined) {
      const field = item.text;
      if (!field || !enabled(field)) throw new Error('Không tìm thấy trường văn bản khả dụng.');
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        if (field.readOnly) throw new Error('Trường chỉ đọc.');
        if (field.maxLength >= 0 && answer.text.length > field.maxLength) throw new Error('Câu trả lời vượt độ dài tối đa.');
        setText(field, answer.text);
        await sleep(80, signal);
        if (field.value !== answer.text || !field.validity.valid) throw new Error('Nội dung không đáp ứng quy tắc xác thực của form.');
      } else if (field.isContentEditable) {
        field.textContent = answer.text; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
        if (field.textContent !== answer.text) throw new Error('Không xác nhận được nội dung.');
      } else throw new Error('Trường văn bản không hỗ trợ điền an toàn.');
      return;
    }
    if (item.question.kind === 'dropdown') {
      const id = answer.choices![0];
      if (item.dropdown instanceof HTMLSelectElement) {
        const option = item.controls.get(id) as unknown as HTMLOptionElement;
        item.dropdown.value = option.value;
        item.dropdown.dispatchEvent(new Event('input', { bubbles: true })); item.dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        if (item.dropdown.value !== option.value) throw new Error('Dropdown không nhận giá trị.');
      } else {
        item.dropdown?.click(); await sleep(120, signal);
        const refreshed = scanForm().find(node => node.question.id === item.question.id);
        const option = refreshed?.controls.get(id);
        if (!option || !enabled(option)) throw new Error('Không tìm thấy lựa chọn dropdown.');
        option.click(); await sleep(100, signal);
        const latest = scanForm().find(node => node.question.id === item.question.id);
        const selected = latest?.controls.get(id);
        const expected = item.question.choices.find(choice => choice.id === id)!.label;
        if (!latest?.dropdown || (!(selected && checked(selected)) && latest.dropdown.getAttribute('data-value') !== expected)) throw new Error('Không xác nhận được lựa chọn dropdown.');
      }
      return;
    }
    const clickOption = (control: HTMLElement) => {
      const target = control.closest('label')?.querySelector<HTMLElement>('.aDTYNe') ?? control.closest<HTMLElement>('label') ?? control;
      target.click();
    };
    const select = async (controls: Map<string, HTMLElement>, ids: string[], multiple: boolean) => {
      if (multiple) {
        for (const [id, control] of controls) {
          signal.throwIfAborted();
          if (checked(control) !== ids.includes(id)) {
            if (!enabled(control)) throw new Error('Lựa chọn bị vô hiệu hóa.');
            clickOption(control);
            await sleep(60, signal);
          }
        }
      } else {
        const control = controls.get(ids[0]);
        if (!control || !enabled(control)) throw new Error('Không có đáp án hợp lệ.');
        if (!checked(control)) clickOption(control);
      }
      // Forms may update aria-checked after its lazy controller finishes loading.
      for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(80, signal);
        if ([...controls].every(([id, control]) => checked(control) === ids.includes(id))) return;
      }
      throw new Error('Form chưa nhận đúng lựa chọn.');
    };
    if (answer.rows) {
      for (const [rowId, ids] of Object.entries(answer.rows)) await select(item.rowControls.get(rowId)!, ids, item.question.kind === 'checkbox-grid');
    } else await select(item.controls, answer.choices!, item.question.kind === 'checkbox');
  }
  private waitForPage(before: string, previousHeadings: Element[], signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let stable: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error) => { observer.disconnect(); clearTimeout(timeout); clearTimeout(stable); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
      const abort = () => finish(new DOMException('Đã dừng', 'AbortError'));
      const check = () => {
        clearTimeout(stable);
        const questions = scanForm();
        const replaced = questions.length > 0 && questions.every(item => !previousHeadings.includes(item.root.querySelector('[role="heading"]')!));
        if (replaced && pageSignature() !== before && this.navigationButton(/^(next|tiếp|tiếp theo|submit|gửi)$/i)) stable = setTimeout(() => finish(), 300);
      };
      const observer = new MutationObserver(check);
      const timeout = setTimeout(() => finish(new Error('Chưa xác nhận chuyển trang. Giữ tiến trình chờ trang mới tối đa 2 phút; bấm Dừng điền để hủy. Kiểm tra xác thực hoặc CAPTCHA.')), 15000);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      signal.addEventListener('abort', abort, { once: true }); check();
    });
  }
}
export function result<T>(callback: () => T): Result<T> {
  try { return { ok: true, data: callback() }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Lỗi không xác định.' }; }
}
