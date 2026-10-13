import type { ReactNode } from 'react';
import type { APISettings, Result } from '../types';

export const extensionAvailable = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
export const browserNotice = 'Đây là giao diện xem trước. Mở tiện ích trong Chrome để đọc biểu mẫu và lưu cài đặt.';
export function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function unwrap<T>(result: Result<T> | undefined): T {
  if (!result?.ok || result.data === undefined) throw new Error(result?.error || 'Không nhận được phản hồi từ tiện ích.');
  return result.data;
}
export async function runtime<T>(message: object): Promise<T> {
  if (!extensionAvailable) throw new Error(browserNotice);
  return unwrap<T>(await chrome.runtime.sendMessage(message));
}
export function isFormUrl(value: string | undefined): boolean {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'docs.google.com' && !url.port && /^\/forms\/(?:[^/]+\/)+(?:viewform|formResponse)\/?$/.test(url.pathname) && !url.username && !url.password; }
  catch { return false; }
}
export function apiOrigin(baseUrl: string): string {
  const url = new URL(baseUrl);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) {
    throw new Error('URL API phải dùng HTTPS; chỉ localhost được dùng HTTP. Không thêm tài khoản, query hoặc fragment vào URL.');
  }
  return `${url.origin}/*`;
}
export function validateApi(settings: APISettings): string {
  const origin = apiOrigin(settings.baseUrl.trim());
  if (settings.baseUrl.trim().length > 2048) throw new Error('URL API quá dài.');
  if (!settings.model.trim() || settings.model.trim().length > 200 || /[\x00-\x1f]/.test(settings.model)) throw new Error('Nhập tên mô hình hợp lệ, tối đa 200 ký tự.');
  if (settings.apiKey.length > 4096 || /[\r\n\x00]/.test(settings.apiKey)) throw new Error('Khóa API không hợp lệ.');
  if (settings.systemPrompt.length > 8000) throw new Error('Chỉ dẫn AI tối đa 8000 ký tự.');
  if (!Number.isFinite(settings.temperature) || settings.temperature < 0 || settings.temperature > 2) throw new Error('Temperature phải từ 0 đến 2.');
  if (!Number.isInteger(settings.maxTokens) || settings.maxTokens < 1 || settings.maxTokens > 4096) throw new Error('Max tokens phải từ 1 đến 4096.');
  if (!Number.isInteger(settings.timeout) || settings.timeout < 1000 || settings.timeout > 25000) throw new Error('Thời gian chờ phải từ 1000 đến 25000 ms.');
  if (!Number.isInteger(settings.retryCount) || settings.retryCount < 0 || settings.retryCount > 3) throw new Error('Số lần thử lại phải từ 0 đến 3.');
  return origin;
}
export function Header({ settings, children }: { settings?: boolean; children?: ReactNode }) {
  return <header className="app-header"><div className="brand"><svg className="document-mark" width="34" height="40" viewBox="0 0 34 40" fill="none" aria-hidden="true"><path d="M5 1h16l12 12v23a3 3 0 0 1-3 3H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4Z" fill="currentColor"/><path d="M21 1v12h12" fill="white" opacity=".3"/><path d="M9 21h16M9 27h16M9 33h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg><div><h1>Form Assist</h1><p>{settings ? 'Cài đặt tiện ích' : 'Điền biểu mẫu, có kiểm soát'}</p></div></div>{children}</header>;
}
export function Notice({ error, busy, message }: { error?: string; busy?: string; message?: string }) {
  return <div aria-live="polite" aria-atomic="true" className={error ? 'notice error' : busy || message ? 'notice' : 'live-empty'}>{error || busy || message || ''}</div>;
}
export function AIWarning() {
  return <p className="privacy-note">Khi dùng AI hoặc bật AI cho câu hỏi văn bản, nội dung câu hỏi và ngữ cảnh cá nhân sẽ được gửi tới nhà cung cấp API đã cấu hình. Không dùng với dữ liệu nhạy cảm nếu chưa được phép.</p>;
}
