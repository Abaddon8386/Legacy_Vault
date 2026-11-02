# Kết quả Staff theo bản giấy và phiên bản căn cứ — bổ sung 02/11/2026

Người dùng đã chốt mở rộng BE/FE: `comparison` trên từng bản di chúc giấy và `legalHistory` trên từng phiên bản căn cứ. Không thêm quyền Legal cho Staff, không đổi policy khi bản di chúc số thay đổi.

## Di chúc giấy
GET danh sách/chi tiết `/api/v1/staff/verification-cases/{caseId}/original-will-intakes[/{recordId}]` thêm:

```json
{"comparison":{"result":"MISMATCH","reason":"Bản giấy thiếu trang","comparedAt":"2026-11-02T03:22:00Z","digitalVersion":2}}
```

- Kết quả MATCH, MISMATCH, INCONCLUSIVE; reason có thể null khi MATCH. `comparison:null` nghĩa bản giấy này chưa có kết luận.
- Tra WillComparisonRow theo case đã kiểm assignment rồi map đúng originalWillIntakeId. Không gán kết quả mới nhất của toàn ca cho tất cả bản giấy. Phiên bản số đã đối chiếu được ghi rõ; không tự kế thừa sang bản số mới.
- POST tiếp nhận mới giữ metadata/receipt cũ và comparison=null. Client cũ bỏ qua field bổ sung.

## Căn cứ pháp lý
GET `/api/v1/staff/verification-cases/{caseId}/basis-dossier` giữ currentDecision hiện có và thêm `versions[].legalHistory`:

```json
{"version":1,"legalHistory":[{"id":"11111111-1111-4111-8111-111111111111","result":"LEGAL_REJECTED","reason":"Cần sửa phân bổ","decidedAt":"2026-11-02T03:22:00Z","currentScope":false}]}
```

- Nguồn: legal_basis_review_history, distribution_workflow_events, court_decisions. Chỉ đọc các kết quả của Legal; không lấy submission của Staff làm quyết định.
- Mỗi sự kiện phải khớp cả số phiên bản và SHA-256 của văn bản. Lịch sử của phiên bản 1 không xuất hiện trên phiên bản 2, kể cả dùng cùng file.
- Kết quả: LEGAL_APPROVED, LEGAL_REJECTED, FRESH, REVIEW_REQUIRED; APPROVE_DOCUMENTS, REQUEST_DOCUMENT_SUPPLEMENTATION, APPROVE_ALLOCATIONS, REQUEST_ALLOCATION_CHANGES; COURT_VALID, COURT_INVALID, COURT_INCONCLUSIVE.
- `currentScope` chỉ cho biết snapshot vẫn khớp: phiên bản hiện hành, requiredVersion/ON_HOLD và allocation hash/dispute tương ứng. Đây KHÔNG phải cờ quyết định đang hiệu lực hoặc cấp quyền thao tác. Một lịch sử cùng snapshot vẫn có thể đã bị kết quả sau thay thế. Workflow/capability/currentDecision vẫn là nguồn cho thao tác hiện hành.
- Khi currentScope=false: Staff thấy nhãn lịch sử vì bản giấy cũ hoặc phân bổ/tình trạng đã thay đổi. Không hiển thị raw ID/hash.
- History rỗng là chưa có kết quả gắn với phiên bản đó; phiên bản chưa chuyển hiển thị Chưa chuyển Legal. Field vắng/sai schema là dữ liệu chưa khả dụng, không suy thành đang chờ hoặc đã duyệt.
- Lý do phân loại routeReason vẫn bị ẩn với Staff như contract cũ. Chỉ cung cấp lý do xử lý các văn bản trong đúng scope.
- Yêu cầu bổ sung mới qua API review lưu thêm version/hash/allocation snapshot đang xét, trước khi chuyển dossier về PROVIDED. Bản ghi lịch sử cũ thiếu version/hash được giữ nguyên và không đoán gán phiên bản theo timestamp. Workflow events đã có snapshot tiếp tục được hiển thị đúng.

Không có migration. GET không ghi dữ liệu, không thay workflow hay assignment. Sai role 403, ngoài assignment 404. FE dùng no-store, refresh khi trở lại và guard thao tác ghi/nháp.
