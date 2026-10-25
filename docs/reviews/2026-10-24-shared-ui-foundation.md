# FE-00 — kiểm tra thành phần giao diện chung

Nhánh: `feat/shared-ui-foundation`, bắt đầu từ `origin/develop` tại `ebd7c2b`. Thay đổi chỉ thuộc FE; không thay contract, dữ liệu, quyền hoặc quy trình nghiệp vụ.

## Kết quả

| Mức độ | Vị trí | Trước | Sau | Lý do |
| --- | --- | --- | --- | --- |
| HIGH | `components/layout/AppShell.css` | Khi tăng vùng bấm trên mobile 320px, tên trang Owner chỉ còn khoảng 5px | Thanh công cụ tự xuống hàng, tên trang còn đủ khoảng 120px cho nhãn VI | Giữ tên trang và công cụ quan trọng trong vùng nhìn thấy |
| MEDIUM | `common/Button.css`, `EmptyState.css`, `ErrorState.css` | Nút nhỏ dưới 44px; CTA vàng/chữ trắng khoảng 2,46:1 | Component Button tối thiểu 44px; nút chính xanh/chữ trắng 13,93:1 | Phân biệt hành động và tăng khả năng đọc/chạm |
| MEDIUM | `common/LanguageToggle.css`, `Modal.css` | Vùng bấm ngôn ngữ/nút đóng nhỏ; CSS ngôn ngữ bị khai báo ở hai nơi | Ngôn ngữ và nút đóng tối thiểu 44px; một stylesheet ngôn ngữ | Tránh quy tắc ghi đè và thao tác khó trên mobile |
| MEDIUM | `common/FeedbackNotice.jsx` | Cảnh báo phải tự dựng tại từng nơi | Bốn tone có biểu tượng, chữ và viền riêng; tương phản thông báo 5,60–6,60:1 | Hiểu trạng thái bằng cả nội dung và hình thức |
| MEDIUM | `layout/WorkspaceFoundation.css` | Tiêu đề khu vực làm việc dùng nhiều font khác nhau | Font sans trong khung làm việc và dialog chung; sidebar giữ kiểu nhận diện | Tăng tính nhất quán mà không đổi sidebar |

Các đường dẫn trong bảng thuộc `frontend/src/components/`.

## Phạm vi kiểm tra

- Trình duyệt: bản kiểm tra component riêng tại desktop 1440px và mobile 320px; nội dung VI/EN, nhãn dài, khung thông báo có nút hành động. Không tràn ngang ở các kích thước đã kiểm tra.
- Kiểm tra đảo chiều RTL của các component: viền thông báo đổi sang cạnh đầu, nội dung không tràn ngang tại 320px. Không tuyên bố toàn hệ thống hỗ trợ RTL.
- Phóng đại bằng CSS 200% tại desktop 1440px: không tràn ngang sau khi thanh công cụ cho phép xuống hàng. **Chưa xác minh zoom 200% thực của trình duyệt.**
- Bàn phím: focus hiển thị; mở dialog, Escape đóng và trả focus về nút đã mở. Không thay cơ chế quản lý focus hiện có.
- Staff: mở danh sách hồ sơ thật tại desktop và tablet 768px, xác minh font sans, nút ngôn ngữ/refresh/menu mobile 44 × 44px, sidebar vẫn xanh; không tràn ngang ở 768px. Không thực hiện quyết định hoặc thay đổi hồ sơ.
- 66 kiểm tra hồi quy có sẵn đạt: Admin, tài sản, Legal live, Staff live và tải chứng cứ. 6 kiểm tra mới đạt: khóa nút đang xử lý, callback/nhãn lỗi, announcement và trạng thái tải.
- Lint và production build đạt. Build vẫn có cảnh báo kích thước bundle lớn sẵn có; không mở rộng FE-00 sang chia bundle.

Ảnh và số đo trực quan lưu ngoài Git tại `C:/Users/HOME/Documents/Codex/fe00-review-2026-10-24/`. Trang kiểm tra component tạm thời được xóa trước commit; không thêm route hoặc dữ liệu mẫu vào ứng dụng.

## Bàn giao

Xem `docs/frontend/shared-ui-foundation.md` để dùng component trong các task FE tiếp theo. Các form/nút viết riêng của từng trang chưa được chuyển đổi hàng loạt; xử lý trong task của người phụ trách trang đó.

Approve cho các component và kích thước đã kiểm tra. Không xác nhận nghiệm thu toàn bộ ứng dụng, đầy đủ WCAG hoặc luồng nghiệp vụ từ kết quả này.
