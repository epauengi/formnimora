# FormNimora

Logo identity: Form cadence. Editable masters in `assets/brand/`; Chrome icons in `public/icons/formnimora-*.png`.

Chrome Extension Manifest V3, TypeScript, React 19, Tailwind CSS 4 và Vite. Điền Google Forms trên **trang trả lời**, không trên trang chỉnh sửa. Chế độ thường không gửi; nút **Điền biểu mẫu** tự chọn ngẫu nhiên, chuyển phần và gửi **một phản hồi**, sau xác nhận rõ ràng của người dùng.

## Quyền Google Forms và kiểm thử chuyển trang

Extension cần quyền `https://docs.google.com/forms/*` để Chrome nạp `content.js` sau mỗi lần bấm Tiếp tải trang mới. Không chạy trên các trang Google Docs khác. Chrome match pattern giới hạn script theo đường dẫn; quyền host được Chrome quản lý theo máy chủ. Sau cập nhật, chấp nhận quyền nếu Chrome yêu cầu và tải lại tab form.

Kiểm thử hồi quy full-document navigation (không gửi mạng đến Google): sau build, chạy `python tests/browser-navigation.py` khi có Python Playwright và Microsoft Edge. Test nạp extension thật, mở form fixture được intercept, tự điền hai phần qua tải tài liệu mới, xác nhận Submit đúng một lần.

## Điền và gửi toàn bộ bằng một nút

1. Reload extension trong `chrome://extensions`, tải lại tab Google Forms.
2. Bấm **Điền biểu mẫu** ở bảng nổi góc dưới bên phải Google Form; không cần mở popup. Nút cùng tên trong popup vẫn dùng được.
3. Xác nhận cảnh báo gửi dữ liệu thật. Extension bỏ qua preview, dùng Random, tự bấm **Tiếp** qua tối đa 20 phần rồi bấm **Gửi** đúng một lần.
4. Bảng nổi hiển thị phần đang chạy, số câu đã điền và nút **Dừng điền**. Có thể dừng trước khi gửi; không thể thu hồi phản hồi đã gửi bằng Stop.

Nút trên form dùng cài đặt đã lưu trong extension, không nhận API Key. Nếu bật AI tự luận, xác nhận trên form bao gồm việc gửi câu hỏi và ngữ cảnh cá nhân tới API đã cấu hình.

Chỉ dùng dữ liệu thử khi có quyền. Câu tự luận bắt buộc cần bật AI trong Settings hoặc điền sẵn. Extension không bịa đáp án cá nhân, không vượt CAPTCHA/xác thực. Khi có lỗi, thiếu câu bắt buộc hoặc không xác nhận được kết quả gửi, extension dừng và **không tự thử gửi lại**.

Tiến trình qua tải lại trang được giữ tạm trong `chrome.storage.session` (hết hạn 2 phút); không lưu câu hỏi/đáp án hoặc API Key vào checkpoint. Tự gửi chỉ bật cho lần chạy được xác nhận, không lưu làm mặc định.

## Cài đặt

Yêu cầu Node.js 20.19+ hoặc 22+, npm và Chrome 120+.

```powershell
npm install
npm test
npm run build
```

1. Mở `chrome://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked**, chọn thư mục `dist` của dự án.
4. Ghim extension. Mở Google Forms có URL `https://docs.google.com/forms/.../viewform` rồi mở popup.
5. Chọn **Scan Form**, cấu hình chế độ, chọn **Auto Fill**.
6. Mặc định có preview: kiểm tra/sửa đáp án, xác nhận điền. Sau đó tự kiểm tra và gửi form.

Sau khi sửa code: build lại, bấm Reload extension và tải lại tab form. `npm run dev` dùng xem UI tại `/popup.html` và `/options.html`; không thay thế build extension, không gọi Chrome API từ trang web thông thường.

## Cấu hình AI

Mở **Settings** và nhập:

| Trường | Ví dụ / ý nghĩa |
|---|---|
| Provider | OpenAI-compatible hoặc Custom; cả hai dùng Chat Completions |
| Base URL | `https://api.example.com/v1` |
| API Key | Khóa của người dùng, không có khóa hardcode |
| Model | Tên model thực tế do nhà cung cấp hỗ trợ |
| Temperature | Độ ngẫu nhiên |
| Max Tokens | Giới hạn token phản hồi |
| System Prompt | Chỉ dẫn bổ sung của người dùng |
| Timeout | Thời gian tối đa mỗi lần gọi |
| Retry Count | Số lần thử lại lỗi tạm thời |

Đường dẫn `/chat/completions` được nối vào Base URL, hoặc có thể nhập sẵn endpoint kết thúc bằng `/chat/completions`. Query string, URL chứa tài khoản/mật khẩu và HTTP công khai bị từ chối. HTTP chỉ dành cho `localhost`/`127.0.0.1` (ví dụ Ollama có endpoint OpenAI-compatible).

**Save/Test** xin quyền đúng máy chủ API đang cấu hình, không cấp sẵn quyền tất cả website. Sau khi lưu, chọn **Test API Connection**. Với Custom, endpoint phải hỗ trợ payload và response OpenAI Chat Completions; chưa hỗ trợ ánh xạ JSON tùy ý, streaming hay API Gemini native.

AI cho tự luận mặc định tắt. Chỉ bật khi chấp nhận gửi câu hỏi và thông tin cá nhân chủ động nhập trong cài đặt đến nhà cung cấp. AI Choice cũng gửi lựa chọn của chính câu hỏi đang xử lý. Không gửi nguyên form, lịch sử đáp án hoặc tự thu thập thông tin cá nhân từ tab.

**API Key lưu trên thiết bị trong `chrome.storage.local`, không mặc định được mã hóa.** Có nút xóa khóa. Storage giới hạn `TRUSTED_CONTEXTS`; content script không đọc được cấu hình hay khóa. Background chịu trách nhiệm gọi API. Người có quyền truy cập hồ sơ Chrome/thiết bị vẫn có thể đọc dữ liệu; không dùng khóa sản xuất đặc quyền cao trên thiết bị dùng chung. Xóa khóa không thu hồi quyền máy chủ đã cấp; có thể quản lý quyền trong Chrome.

## Tính năng

- Scan: radio, checkbox, dropdown, linear scale, multiple-choice grid, checkbox grid, short answer, paragraph.
- Random: không chọn đáp án disabled, chọn số checkbox theo cấu hình, không lặp đáp án.
- Rule-Based: nội dung câu hỏi chứa từ khóa (không phân biệt hoa thường); đáp án khớp nhãn hoàn toàn. Không khớp thì random. Với grid, quy tắc áp dụng nhãn đáp án cho mỗi hàng.
- AI Choice: yêu cầu JSON, chỉ chấp nhận ID đáp án thật; response sai bị báo lỗi, không click đáp án tự bịa.
- Preview: sửa tự luận, chọn đáp án và từng hàng trước khi điền. Preview chỉ nằm trong bộ nhớ content script, không lưu vào storage.
- Delay, Stop, bỏ qua câu đã trả lời, độ dài và ngôn ngữ tự luận, ngữ cảnh cá nhân chủ động cung cấp, Dark Mode.
- Chuyển trang tùy chọn: chỉ click nút có nhãn chính xác `Next`, `Tiếp`, `Tiếp theo`; chờ DOM thay đổi. Dừng ở trang cuối, lỗi xác thực hoặc giới hạn 20 trang.
- Khi bật preview cùng chuyển trang, mỗi trang đều cần xác nhận preview riêng.
- Reset đặt lại tác vụ/thống kê, **không xóa đáp án hiện có trên form**. Stop cũng giữ đáp án đã điền. Muốn xóa form, dùng chức năng của Google Forms hoặc sửa thủ công.
- Không chạy đồng thời nhiều tác vụ trong cùng tab; popup đóng không hủy engine. Mở popup lại đọc trạng thái hiện tại. Reload tab hủy trạng thái.
- Chỉ nút **Điền biểu mẫu** với xác nhận rõ ràng mới bật tự gửi một lần; chế độ thường không Submit. **Batch Test tùy chọn chưa triển khai**.

## Kiến trúc và luồng

```text
Popup / Settings (React)
  ├─ chrome.runtime.sendMessage ─ Background service worker
  │                                ├─ Storage TRUSTED_CONTEXTS
  │                                └─ AI client → adapter Chat Completions → API
  └─ Forms manifest content script → content.js (isolated world)
                                  ├─ Scanner / question detector
                                  ├─ Answer planner → background AI, không có API Key
                                  └─ Auto Fill Engine → DOM + input/change
```

1. Chrome nạp content script trên `https://docs.google.com/forms/*` ở mỗi lần tải trang. Popup kiểm tra URL; script idempotent, chỉ khôi phục tác vụ có checkpoint hợp lệ, không tự bắt đầu trên form mới.
2. Scan DOM bằng role/ARIA, tạo câu hỏi có ID ổn định trên trang, tách DOM references khỏi dữ liệu truyền qua messaging.
3. Planner bỏ qua câu đã trả lời theo cấu hình; tạo đáp án random/rule/AI.
4. AI background xác thực nguồn message, cấu hình, quyền endpoint, payload và phản hồi. Timeout, retry có giới hạn và cancellation theo tab.
5. Preview nếu bật; validate lại đáp án và chữ ký trang trước khi điền.
6. Rescan trước mỗi câu để hạn chế DOM reference cũ; điền và kiểm tra lại; thử lại DOM tối đa hai lần.
7. Chuyển trang nếu bật, không có lỗi, và tìm được nút Next chính xác. MutationObserver chờ DOM mới ổn định; nếu tải tài liệu mới, Chrome tự nạp script và khôi phục checkpoint. Chế độ thường không Submit; Điền biểu mẫu gửi một lần ở phần cuối.

`AbortController` dùng cho delay, engine và fetch. Khi Stop, lệnh cancel gửi về background. Lỗi một câu được ghi log và không làm mất đáp án các câu đã điền.

### Source chính

| Đường dẫn | Trách nhiệm |
|---|---|
| `public/manifest.json` | MV3, quyền tối thiểu, optional API hosts, CSP |
| `vite.config.ts`, `vite.content.config.ts` | UI/background ESM và content script IIFE riêng |
| `src/types/index.ts` | Câu hỏi, đáp án, cấu hình, hợp đồng message |
| `src/popup/` | Dashboard, preview, điều khiển |
| `src/options/` | Cấu hình API và điền form |
| `src/content/question-detector.ts` | Phân loại câu hỏi |
| `src/content/form-scanner.ts` | Scan và ánh xạ DOM |
| `src/content/answer-planner.ts` | Random/rule/AI, validation |
| `src/content/auto-filler.ts` | Engine, Stop, preview, retry, chuyển trang |
| `src/content/dom-utils.ts` | ARIA, sự kiện, delay có hủy |
| `src/background/service-worker.ts` | Message boundary, cancellation, gọi AI |
| `src/ai/` | Client, prompt builder, provider adapter |
| `src/storage/` | Cấu hình local chỉ trusted contexts |
| `tests/` | Unit test scanner, planner, engine và AI |

Adapter là điểm mở rộng cho nhà cung cấp có giao thức khác; không cần adapter mới cho OpenRouter/Ollama đã tương thích OpenAI.

## Kiểm thử thủ công trên Google Forms mẫu

Tạo form riêng hoặc được phép kiểm thử, không dùng khảo sát công khai của người khác để gửi dữ liệu thử.

1. Tạo các câu: `Giới tính` (Nam/Nữ), checkbox Sở thích (3 lựa chọn), dropdown Thành phố, scale 1–5, radio grid 2 hàng/3 cột, checkbox grid 2 hàng/3 cột, short answer `Mã người tham gia`, paragraph `Đề xuất cải thiện thư viện`. Thêm câu bắt buộc và chia thành 2 trang.
2. Mở bản Preview/viewform của Google Forms. Scan phải nhận đủ câu trên **trang hiện tại**; không tính các trang chưa mở.
3. Random, AI tự luận tắt, số checkbox 2: Auto Fill phải tạo preview; chưa click/điền trước xác nhận. Xác nhận, kiểm tra checkbox đủ 2 và mỗi hàng grid hợp lệ.
4. Rule-Based: từ khóa `Giới tính`, đáp án `Nam`. Kiểm tra chọn Nam; quy tắc nhãn không tồn tại phải fallback random.
5. Cấu hình API thật, Test API, bật AI tự luận. Nhập ngữ cảnh chủ động `Mã người tham gia: TEST-001`. Chạy, sửa đoạn AI trong preview, xác nhận và kiểm tra giá trị trên form. Không cung cấp mã thì AI phải từ chối bịa, để câu lỗi/trống cho sửa tay.
6. AI Choice: kiểm tra đáp án nằm trong danh sách. Dùng endpoint thử trả về ID giả: phải báo lỗi, không tự chọn giá trị đó.
7. Điền trước một câu rồi bật bỏ qua: phải giữ câu cũ. Tắt bỏ qua để thay thế.
8. Bật autoNext: xác nhận trang 1 rồi trang 2; trên trang cuối extension không gửi form. Chưa điền câu bắt buộc hoặc lỗi validation: báo không chuyển được và giữ dữ liệu.
9. Stop khi gọi API hoặc delay: không tiếp tục điền; mở lại popup thấy stopped. Reset giữ đáp án trên form. Reload tab rồi Scan lại.
10. Test API với URL sai, model sai, 401, endpoint chậm, 429/5xx; phải hiển thị lỗi rõ, không hiển thị API Key. Xóa khóa và test lại.
11. Kiểm tra Settings bằng bàn phím, Dark Mode; Tab tới tất cả nút và trường, trạng thái lỗi/loading có văn bản.
12. Chrome DevTools: service worker Network có request API; DOM Google Forms và message content không chứa API Key. Không có code tải về thực thi/eval.

Không có URL form mẫu hardcode vì cần form thuộc quyền người kiểm thử. Unit test dùng DOM fixtures, không gửi dữ liệu ra Google Forms thật.

## Giới hạn

- Google Forms có thể thay đổi ARIA/cấu trúc DOM; selector bảo thủ có thể bỏ qua câu thay vì click nhầm. Chỉ hỗ trợ form có heading và listitem nhận diện được.
- Câu có nhãn số được phân loại scale; multiple choice chỉ toàn số có cùng hành vi radio nhưng có thể hiển thị nhãn loại scale.
- Date/time, số, upload, CAPTCHA, auth, yêu cầu đăng nhập, xác thực đặc thù, đáp án `Other` cần nhập thêm và unique-column grid chưa hỗ trợ đầy đủ. Không vượt giới hạn truy cập.
- Grid yêu cầu cột không được chọn trùng giữa các hàng có thể bị validation; phải sửa preview/thủ công. Email/URL dùng validation HTML nếu có; regex Google Forms có thể chỉ kiểm tra khi chuyển trang/gửi.
- Service worker MV3 có thể bị Chrome dừng; trạng thái fetch không persist. Có thể chạy lại sau khi kiểm tra đáp án đã điền, không tự phát lại request/submit.
- Timeout giới hạn toàn bộ chuỗi gọi và retry cho một câu hỏi. AI có chi phí và có thể trả sai; preview mặc định bật, người dùng chịu trách nhiệm kiểm tra.
- Không có batch submit. Chế độ Điền biểu mẫu chỉ gửi một phản hồi, không tự click nút có nhãn lạ/ngôn ngữ chưa hỗ trợ và không reset dữ liệu form tự động.

Build và test chỉ xác nhận các trường hợp tự động được kiểm tra; cần kiểm thử lại trên Google Forms thật và nhà cung cấp API của bạn trước khi sử dụng dữ liệu quan trọng.
