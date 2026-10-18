# PS-70 — Dual Completion Gate: phần chuẩn bị

> Superseded: GET .../handover-sessions/{sessionId}/completion-progress và requireReady
> dùng cùng một snapshot có khóa Vault → case → dossier → session trong transaction.
> SQL integration chưa chạy được vì V25 trên develop lỗi batch; giữ nguyên V25 theo yêu cầu.

Trạng thái **QUEUED / chưa tích hợp**, nhánh riêng từ develop `d612b5d`.
Nguồn: [PS-70](https://thaithai9785.atlassian.net/browse/PS-70), LV-CLOSE-001:
complete chỉ khi assetsDelivered=100% AND beneficiariesConfirmed=100%.

## Đã chuẩn bị

`handover.policy.DualCompletionGate` đánh giá AND từ bốn số đếm backend:
deliveredAssets/totalAssets và confirmedBeneficiaries/totalBeneficiaries.
Kết quả nội bộ READY, ASSETS_PENDING, BENEFICIARIES_PENDING, BOTH_PENDING,
EMPTY_SCOPE; không phải public API hoặc ErrorCode đã chốt.
So sánh số nguyên trực tiếp, không làm tròn tỷ lệ hoặc nhân gây overflow.
Đầu vào âm/completed vượt total bị từ chối.

Unit tests bao phủ bốn tổ hợp AND, 0/0, scope chỉ rỗng một vế,
số đếm sai và sát Long.MAX_VALUE. Helper không tự kết luận scope rỗng là hoàn thành;
cần chốt với nhóm trước khi tích hợp workflow thực tế.

## Còn thiếu để đạt AC atomic

- PS-57/58/60/64/65/66 và PS-67/68/69 cung cấp approval/session/scope,
  fully delivered assets và confirmations đúng phiên.
- Use case đọc hai vế **trong cùng transaction và dưới cùng lock** với mutation
  delivery/confirmation/close. Không lấy hai kết quả GET khác thời điểm rồi AND lại.
- Xác minh current approval/version/hash và lifecycle sau khi lấy khóa; refresh entity
  để tránh first-level cache cũ. Quyết định READY không thay các guard này.
- Thống nhất thứ tự khóa với PS-60/65/71/72, không tạo vòng khóa ngược.
- Guard được gọi lại trong transaction close, không tin cờ ready/count từ client.
- Mapping API/error vi/en/OpenAPI; SQL concurrency tests cho close đua với confirmation,
  delivery, approval invalidation, audit failure và rollback.

Chưa có endpoint/query/migration hoặc bằng chứng atomic trên SQL Server.
Không chuyển Jira Done; hỏi người dùng trước khi tiếp tục khi dependency đã đủ.
