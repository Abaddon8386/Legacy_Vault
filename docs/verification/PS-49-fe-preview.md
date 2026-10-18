# PS-49 — FE preview

- Jira: https://thaithai9785.atlassian.net/browse/PS-49
- Bản nền: develop d612b5dfa2675fb92eb4c399aa699686523d9c94.
- Nguồn: phần FE chưa commit trên feature/PS-49-56-sprint-3-ui tại checkout repo nhóm Legacy_Vault ngày 18/10/2026; không lấy từ repo cũ hoặc backup.
- Xem bằng `npm ci`, `npm run dev`, mở `/legal/approval-review?preview=true` trên Vite DEV.
- Preview dùng dữ liệu tổng hợp, không chứng minh tích hợp BE/SQL Server. Production và phiên có token thật không được mô phỏng thành công.
- Endpoint/DTO chưa được chốt là đề xuất, không phải contract chính thức. Nối API và kiểm thử live khi BE hoàn thành.
- PR chỉ triển khai ticket PS-49; không đưa các thao tác bàn giao tài sản, ký nhận, tiến độ kép, close/archive PS-53–56 hay subscription/thanh toán.
- PS-50, PS-51, PS-52 có trang preview độc lập để review từng ticket; không chia sẻ state runtime hoặc tuyên bố E2E giữa các trang.

## Kiểm chứng ngày 18/10/2026

- Full FE suite: 428/428 pass; 0 fail/skipped/cancelled.
- ESLint: đạt. Production build: đạt; cảnh báo bundle lớn hơn 500 kB.
- Có kiểm thử UI và kiểm tra production không trả thành công mô phỏng.
- Cảnh báo React `flexShrink` xuất phát từ các màn hình có sẵn trong develop. Chưa kiểm thử live API/SQL Server hoặc E2E toàn quy trình.
