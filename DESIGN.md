---
name: FormNimora
description: Bàn làm việc biểu mẫu · Form cadence
colors:
  primary: "#2548D8"
  primary-hover: "#1E3BB8"
  accent-amber: "#FFAD42"
  surface: "#FFFFFF"
  background: "#F8FAFC"
  title: "#0F172A"
  text: "#334155"
  muted: "#64748B"
  border: "#E2E8F0"
  border-subtle: "#F1F5F9"
  amber-bg: "#FFF8EB"
  amber-border: "#FDE68A"
  amber-text: "#92400E"
  error: "#DC2626"
  error-bg: "#FEF2F2"
typography:
  display:
    fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
---

## Overview

Hệ thống giao diện cho Chrome Extension FormNimora: phong cách Bàn làm việc biểu mẫu (Form cadence). Tối ưu cho người kiểm thử thao tác nhanh, rõ ràng, phân cấp mạch lạc, tương thích bảng màu Cobalt `#2548D8` và Amber `#FFAD42` của thương hiệu.

## Colors

- **Chủ đạo (Primary):** Cobalt `#2548D8`, hover `#1E3BB8`. Dành cho các hành động chính: Bắt đầu điền, Áp dụng vào biểu mẫu, Lưu cấu hình.
- **Điểm nhấn hành động & cảnh báo (Accent Amber):** Amber `#FFAD42`, text `#92400E`, nền `#FFF8EB`. Dành cho nút dừng (`Dừng điền`), nhãn cảnh báo gửi thật (`Gửi thật`), hộp ghi chú bảo mật API.
- **Nền & bề mặt (Neutrals):**
  - Nền trang / popup: `#F8FAFC` (Dark: `#0B111E`).
  - Thẻ & bảng điều khiển: `#FFFFFF` (Dark: `#151D2F`).
  - Đường viền: `#E2E8F0` (Dark: `#222F46`).
  - Văn bản tiêu đề: `#0F172A` (Dark: `#F8FAFC`).
  - Văn bản nội dung: `#334155` (Dark: `#CBD5E1`).
  - Phụ chú: `#64748B` (Dark: `#94A3B8`).

## Typography

Hệ phông chữ native Segoe UI / system sans đảm bảo tốc độ nạp 0ms, không tải font ngoài trong môi trường Extension.
- H1: 19px (Popup) / 26px (Options), font-weight 700, tracking -0.03em.
- H2: 15px - 18px, font-weight 650.
- Body: 13px, font-weight 400.
- Số liệu thống kê: 20px, font-weight 700, font-variant-numeric: tabular-nums.

## Layout

- **Popup (420px):** Phân 3 tầng:
  1. Header thương hiệu & trạng thái kết nối.
  2. Vùng cuộn nội dung: khối metrics, thẻ cấu hình chính, accordion tùy chọn tự động gửi thật.
  3. Thanh công cụ cố định (Bottom Bar): chứa nút quét, chuẩn bị, áp dụng hoặc dừng; kèm dòng thông tin an toàn.
- **Cài đặt (Options):** Lưới 2 cột song song (Cách điền & câu trả lời / Nhà cung cấp & bảo mật) trên desktop; gập thành 1 cột mượt mà trên mobile/màn hình nhỏ (<800px).
- **Bảng nổi (Toolbar):** Widget 328px cô lập trong Closed Shadow DOM, neo góc dưới bên phải, hỗ trợ thu gọn/mở rộng.

## Elevation & Depth

Tuân thủ nguyên tắc đường viền đơn nét (1px border), không dùng bóng đổ mờ nhạt tùy tiện hay viền kép. Bóng đổ chỉ xuất hiện tinh tế ở nút hành động chính (tactile feedback).

## Shapes

- Nút bấm & trường nhập liệu: bo góc 8px (`rounded.md`).
- Thẻ giao diện & bảng panel: bo góc 10px - 14px (`rounded.lg` / `rounded.xl`).
- Huy hiệu & tag trạng thái: bo góc 6px (`rounded.sm`).

## Components

- **Thanh đo (Metrics Strip):** 3 ô thẻ độc lập trên nền xám nhạt hiển thị số liệu tức thời.
- **Nhóm chuyển đổi (Toggle Group):** Hàng checkbox bo góc, có hiệu ứng hover đổi màu nền rõ rệt.
- **Khối mở rộng (Native Details):** Sử dụng thẻ `<details>` và `<summary>` chuẩn HTML để ẩn các cài đặt nâng cao ít dùng, tự động mở khi có lỗi xác thực.

## Do's and Don'ts

- **DO:** Luôn hiển thị nhãn `Gửi thật` và hộp thoại xác nhận khi thực hiện hành vi gửi dữ liệu biểu mẫu.
- **DO:** Giữ toàn bộ nút bấm và trường nhập liệu đạt chiều cao tối thiểu 40px - 44px phục vụ khả năng tiếp cận.
- **DON'T:** Không sử dụng icon emoji, gradient text hoặc hiệu ứng làm mờ kính (glassmorphism) trang trí làm chậm UI.
- **DON'T:** Không đặt các hành vi gửi thật tự động ngang hàng với luồng chuẩn bị và xem trước câu trả lời.
