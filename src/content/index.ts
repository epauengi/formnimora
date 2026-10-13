import type { Answer, ContentCommand } from '../types';
import { AutoFillEngine, result } from './auto-filler';
import { mountFormToolbar } from './form-toolbar';
const scope = globalThis as typeof globalThis & { __formsAIInstalled?: boolean };
if (!scope.__formsAIInstalled && location.hostname === 'docs.google.com' && /^\/forms\/.+\/(?:viewform|formResponse)\/?$/.test(location.pathname)) {
  scope.__formsAIInstalled = true;
  const engine = new AutoFillEngine();
  const initialized = chrome.runtime.sendMessage({ type: 'RESUME_RUN' }).then(result => {
    if (result?.ok && result.data) engine.resume(result.data.settings, result.data.state, result.data.resumeAfterConfirm, result.data.formUrl);
  }).catch(() => {}).then(() => mountFormToolbar(engine));
  chrome.runtime.onMessage.addListener((message: ContentCommand, sender, respond) => {
    if (sender.id !== chrome.runtime.id || sender.tab || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
    void initialized.then(() => respond(result(() => {
      switch (message?.type) {
        case 'STATUS': return engine.status();
        case 'SCAN': return engine.scanOnly();
        case 'START': engine.start(message.settings, message.quantity); return engine.status();
        case 'APPLY': engine.apply(message.answers as Answer[]); return engine.status();
        case 'STOP': engine.stop(); return engine.status();
        case 'RESET': engine.reset(); return engine.status();
        default: throw new Error('Lệnh không hợp lệ.');
      }
    })));
    return true;
  });
  // Loading a Forms page only installs the listener; a saved, unexpired run is
  // required to resume. No automatic start on unrelated forms.
}
