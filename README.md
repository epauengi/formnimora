**English** | [日本語](./README.ja.md)

# FormNimora

A Chrome extension for filling Google Forms with random answers, keyword rules, or AI.

## Features

- Supports multiple choice, checkboxes, dropdowns, scales, grids, and text questions.
- Preview and edit answers before applying them; skip existing answers.
- Optional AI answers through an OpenAI-compatible Chat Completions API.
- Automatic section navigation, progress tracking, and a Stop button.
- A separate **Điền biểu mẫu** action fills randomly and submits the requested number of responses (1–100), only after confirmation.

## Install locally

Requires Chrome 120+, Node.js 22+, and npm.

```sh
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked**, then choose the project's `dist` folder.
3. Open a Google Forms response page (`https://docs.google.com/forms/.../viewform`), then click the extension icon to open its side panel.

After code changes, rebuild, reload the extension, and refresh the form tab.

## Usage

1. Select **Quét câu hỏi** to scan the current section.
2. Choose random, rule-based, or AI mode.
3. Select **Chuẩn bị câu trả lời**, review the preview, then **Áp dụng vào biểu mẫu**.
4. Review the form and submit manually. Normal filling does **not** submit.

**Automatic submission sends real responses.** Use **Điền biểu mẫu** only on forms you own or are authorized to test. Stop cannot undo submitted responses. Stop and reset preserve answers already entered; errors stop the run rather than automatically retrying submission.

### Optional AI setup

Open **Cài đặt**, enter your provider's Base URL, API key, and model, then save and test the connection. Grant access to that API host when prompted. The endpoint must support OpenAI Chat Completions; native Gemini APIs and streaming are not supported.

AI sends the current question, its choices where applicable, and any personal context you explicitly provide to the configured provider. AI text answers are off by default. Review generated answers; API usage may incur charges.

**API keys are stored locally in `chrome.storage.local`, without encryption by default.** Content scripts cannot read this storage; API requests run in the background service worker. Avoid privileged keys on shared devices. Deleting a key does not revoke API-host permissions; manage those in Chrome.

## Limitations

- Works on Google Forms response pages, not the editor. Requires Google Forms access; AI-host access is requested separately.
- Date/time, file uploads, “Other” text fields, and grids requiring unique columns are not fully supported. No CAPTCHA or authentication bypass.
- Required text questions need existing answers or AI enabled. Google Forms validation and DOM changes can interrupt filling; verify results before use with important data.

## Development

TypeScript · React 19 · Tailwind CSS 4 · Vite · Chrome Manifest V3.

```sh
npm test       # Scanner, planner, engine, API, and UI checks
npm run build # Type check and build the extension
npm run dev   # UI preview: /popup.html and /options.html
```

The dev server previews UI only; Chrome APIs require the installed extension. `src/content/` scans and fills forms, `src/background/` handles messages and API calls, and `src/popup/` / `src/options/` provide the interface.
