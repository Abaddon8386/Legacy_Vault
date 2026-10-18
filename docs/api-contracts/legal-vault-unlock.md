# Legal Vault Unlock — PS-59 (LV-LEG-001)

`POST /api/v1/legal-verifications/verification-cases/{caseId}/unlock` chỉ dành cho `LEGAL_VERIFIER`.

Trong một transaction, backend khóa Vault → verification case → dossier và chỉ cho phép mở khóa khi ca còn `OPEN`, Vault ở `LEGAL_BASIS_VERIFICATION`, dossier đã forward, không hold/chờ re-review, và Legal approval mới nhất khớp dossier version, SHA-256, dispute state và allocation scope hiện hành. Với route `COURT`, quyết định Court hợp lệ cho đúng version cũng là điều kiện bắt buộc.

Khi hợp lệ, Vault chuyển sang `UNLOCKED`; audit `LEGAL_VAULT_UNLOCKED` được ghi trong cùng transaction. Nếu cập nhật hoặc audit thất bại, transaction rollback. Danh tính actor lấy từ principal đã xác thực; endpoint không nhận actor, role hoặc snapshot từ client.

DMS timeout, giấy tờ tử vong riêng lẻ, approval thiếu/từ chối/stale, version chưa forward, hold hoặc re-review đều không đủ điều kiện mở khóa. Không lưu nội dung tài liệu trong audit. Response trả `caseId`, `vaultId`, trạng thái, actor public ID và thời điểm cập nhật.

Lỗi: 401 chưa đăng nhập; 403 sai role; 404 không tìm thấy ca; 409 ca/dossier không ở trạng thái hợp lệ, đang hold, thiếu kết luận Court hoặc approval không hiện hành.
