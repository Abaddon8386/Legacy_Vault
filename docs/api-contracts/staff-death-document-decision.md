# Kết quả Legal trên giấy tờ khai tử dành cho Staff

Contract bổ sung được người dùng chốt ngày 02/11/2026, sau khi thử giấy tờ thứ hai trên HS-2026-000006 (UH-05).

GET danh sách và chi tiết tại `/api/v1/staff/verification-cases/{caseId}/death-documents[/{recordId}]` giữ nguyên metadata hiện có và thêm `legalDecision`:

```json
{"legalDecision":{"result":"REJECTED","reason":"Thiếu thông tin trong bản mới","decidedAt":"2026-11-02T03:22:42Z"}}
```

- Kết quả: APPROVED (Đã chấp thuận), REJECTED (Đã từ chối), NEEDS_CORRECTION (Cần bổ sung giấy tờ).
- `legalDecision: null`: giấy tờ này chưa có quyết định, hiển thị Chờ Legal kiểm tra. Không đồng nhất việc Staff tiếp nhận với việc Legal chấp thuận.
- Mỗi quyết định được đọc theo đúng death_document_record_id, gồm lý do và thời gian UTC do server lưu. Giấy mới không kế thừa kết quả giấy cũ. Không suy kết quả từ trạng thái Vault hay notification history.
- Staff phải đúng assignment trước khi đọc danh sách/quyết định. Sai vai trò 403, ngoài scope 404 như API cũ. Không trả khóa nội bộ; không đổi quyền ghi/phê duyệt hay dữ liệu nghiệp vụ.
- Quyết định đọc batch theo các giấy tờ trong ca để tránh truy vấn từng dòng. Receipt POST tiếp nhận mới có legalDecision=null; với client cũ các field cũ và notification giữ nguyên.
- FE đọc no-store và cập nhật khi quay lại tab/cửa sổ, mỗi 30 giây khi trang hiển thị và không đang ghi/upload. Kết quả bị thiếu field do BE cũ hoặc lỗi schema phải phân biệt với chưa quyết định, không âm thầm báo đang chờ.
- Không cần migration; dùng legal_verifications hiện có. File OpenAPI bổ sung: staff-death-document-decision.openapi.json.
