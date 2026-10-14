# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Người kiểm thử Google Forms trên những biểu mẫu họ có quyền sử dụng.

## Product Purpose

FormNimora giúp quét, chuẩn bị, xem trước và điền Google Forms. Người dùng kiểm soát đáp án, cấu hình và việc gửi phản hồi.

## Operating Context

Chrome Extension Manifest V3. Ba bề mặt: popup, trang cài đặt, bảng điều khiển nổi trên trang trả lời Google Forms. Giao diện tiếng Việt; React 19, TypeScript, Tailwind CSS 4, Vite.

## Capabilities and Constraints

Giữ toàn bộ nghiệp vụ hiện có: random, quy tắc, AI tùy chọn, preview chỉnh sửa, dừng/reset, trạng thái và nhật ký, chuyển phần, cài đặt API và kiểm tra kết nối. Chế độ thường không gửi. Hành động Điền biểu mẫu gửi phản hồi thật sau xác nhận rõ ràng; bảng nổi gửi một phản hồi, popup hiện hỗ trợ số lượng 1–100 theo mã nguồn. Không tự thử gửi lại khi kết quả không chắc chắn. Không vượt CAPTCHA hay xác thực. API Key lưu local, không mặc định mã hóa; content script không được đọc khóa. AI có thể gửi câu hỏi và ngữ cảnh chủ động nhập đến endpoint được cấp quyền.

## Brand Commitments

Giữ tên FormNimora, logo Form cadence trong assets/brand/, cobalt và amber của logo. Thiết kế lại đồng bộ cả popup, cài đặt và bảng nổi; không thay đổi chức năng hay hạ thấp cảnh báo bảo mật.

## Evidence on Hand

README.md mô tả tính năng, giới hạn, quyền và quy trình kiểm thử. assets/brand/README.md cùng SVG là nguồn nhận diện. src/ và tests/ là nguồn nghiệp vụ; ảnh người dùng cung cấp minh họa giao diện cũ rối, bố cục và màu chưa hợp logo.

## Product Principles

- Hành động tiếp theo phải dễ tìm.
- Cấu hình ít dùng không lấn át thao tác chính.
- Xem trước và xác nhận là quyền kiểm soát của người dùng.
- Giữ an toàn dữ liệu và khả năng dừng tác vụ.
