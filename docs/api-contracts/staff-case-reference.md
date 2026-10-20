# Mã hồ sơ xác minh — cập nhật 19/10/2026

Theo yêu cầu người dùng, response danh sách, chi tiết và nhận xử lý hồ sơ tại
`/api/v1/staff/verification-cases` bổ sung `caseNumber`, ví dụ `HS-2026-000123`.

- `caseId` vẫn là UUID dùng trong URL, liên kết và kiểm tra quyền. Không thay UUID bằng mã hiển thị trong API request.
- `caseNumber` được backend tính từ năm UTC của `created_at` và `verification_case_id` đã lưu trong SQL Server. Hai trường này cố định; không sinh từ thứ tự dòng, số trang hay thời gian truy cập.
- Phần số có tối thiểu 6 chữ số; số lớn hơn 999999 không bị cắt. Số tăng theo identity toàn bảng, không đặt lại mỗi năm và có thể có khoảng trống.
- Hồ sơ cũ tự có mã dựa trên dữ liệu hiện hữu; không cần migration, backfill hoặc thay UUID. Không dùng mã này như một bí mật hay thay authorization.
- FE hiển thị mã do backend trả về; tạm tương thích response cũ chưa có trường này bằng UUID. Cần khởi động lại backend để có response mới.

## PS-93 — Staff case work context

`GET /api/v1/staff/verification-cases/{caseId}/work-context` trả dữ liệu đọc tổng hợp từ case, Vault, Trustee hiện hành, beneficiaries và dossier/phân bổ mới nhất. Endpoint dùng quyền Staff của case detail: case OPEN chưa claim được hiển thị là `UNASSIGNED_CLAIMABLE`; case đã claim chỉ hiển thị cho Staff được giao, kể cả khi case đã cancelled/closed để đọc trạng thái/lịch sử. Case của Staff khác trả 404. UUID sai định dạng trả 400, chưa xác thực 401, thiếu role 403. Đọc case đóng không cho phép mutation; từng write API vẫn áp guard riêng.

Response không bao gồm giấy tờ danh tính, số định danh hoặc nội dung tài liệu. Xác minh CCCD/hộ chiếu vẫn thực hiện trực tiếp ngoài hệ thống; account/invitation không phải xác minh. `readReferences` trỏ tới API lịch sử hiện có cho giấy khai tử, di chúc gốc và dossier. Beneficiary/item chỉ gồm metadata tối thiểu và phân bổ tại version hiện tại. Approval condition dùng `LegalApprovalGuard` để đối chiếu version/hash/scope.

Luồng mới chỉ cho `COURT`: `unmetConditions` báo thiếu căn cứ COURT, hồ sơ chưa forward, quyết định tòa chưa hợp lệ, approval stale/thiếu hoặc hold. Endpoint chỉ cung cấp context, không mở khóa hay thay đổi phân bổ. Nếu không có Trustee, trả `TRUSTEE_NOT_APPOINTED_CONTACT_FALLBACK_POLICY_UNDECIDED`. PS-44 có API ghi/xem kết quả liên hệ cho Trustee đã biết, nhưng chưa có discovery API Staff; retry/fallback threshold vẫn chưa được quyết định nên không suy ra người liên hệ thay thế.

`NOTARIAL` được trả nguyên trạng để đọc lịch sử; endpoint không đổi route, mở khóa hoặc tạo mutation. Không tìm thấy `docs/00_Main_Flow_FINAL.md` trong repository hiện tại; `workflowStep` hiện trả nguyên trạng Vault status đã xác minh trong code, không suy diễn số ST. Nhóm cần đối chiếu state-to-ST mapping chính thức với Main Flow.

Request:

```http
GET /api/v1/staff/verification-cases/b7b4b520-d2d5-4aa1-95e5-dc0fd3cc0e90/work-context HTTP/1.1
Authorization: Bearer <access-token>
Accept-Language: vi
```

Response `200`:

```json
{
  "caseId": "b7b4b520-d2d5-4aa1-95e5-dc0fd3cc0e90",
  "caseNumber": "HS-2026-000123",
  "caseStatus": "OPEN",
  "assignment": "ASSIGNED",
  "assignedStaffId": "7cd19bd4-27f5-46f0-9c54-744a35ff2011",
  "vaultId": "a93f0570-a64a-4552-aea6-6d2b68466f9e",
  "vaultStatus": "LEGAL_BASIS_VERIFICATION",
  "workflowStep": "LEGAL_BASIS_VERIFICATION",
  "legalRoute": "COURT",
  "dossierStatus": "LEGAL_BASIS_FORWARDED",
  "reviewStatus": "FRESH",
  "onHold": false,
  "trustees": [],
  "beneficiaries": [],
  "readReferences": [],
  "unmetConditions": ["TRUSTEE_NOT_APPOINTED_CONTACT_FALLBACK_POLICY_UNDECIDED"]
}
```

Response `404` (case absent, assigned to another Staff, or otherwise not visible); the message is localized using `Accept-Language`:

```json
{
  "timestamp": "2026-10-20T13:00:00Z",
  "status": 404,
  "code": "RESOURCE_NOT_FOUND",
  "messageKey": "error.resource.notFound",
  "message": "Không tìm thấy tài nguyên yêu cầu.",
  "path": "/api/v1/staff/verification-cases/b7b4b520-d2d5-4aa1-95e5-dc0fd3cc0e90/work-context",
  "traceId": "7f3c1e2a-5b4d-4c1e-9a77-0d9f2b1c3a10",
  "errors": []
}
```
