# BÁO CÁO BÀN GIAO TOÀN DIỆN: CÁC LỖI GIAO DIỆN PHÂN CÔNG CHO THÁI & CƠ CHẾ BẢO VỆ PREVIEW

- **Ngày bàn giao:** 2026-10-19
- **Người thực hiện:** Thái (Frontend Engineer)
- **Worktree thực hiện:** `C:\Users\hai\Downloads\FALL26\SWP\LV-thai-feedback` (cách ly hoàn toàn, không can thiệp vào `Legacy_Vault` chính)
- **Nhánh Git:** `codex/fix-thai-feedback-ui`
- **Repo:** `https://github.com/Abaddon8386/Legacy_Vault`
- **Trạng thái:** Sẵn sàng cho Codex review. Chưa commit, push, tạo PR, merge hay cập nhật Jira/Sheet.

---

## 1. TỔNG HỢP CÁC HẠNG MỤC ĐÃ HOÀN TẤT & ĐẠT CHUẨN

| Hạng mục | Vấn đề ban đầu | Giải pháp kỹ thuật đã triển khai | Trạng thái xác minh |
| :--- | :--- | :--- | :---: |
| **Bug 1 & 16** | **Tên & Thuật ngữ Người thi hành bên ngoài (Trustee)** | Đồng bộ thuật ngữ Trustee thành "Người thi hành bên ngoài" (VI) / "External Executor" (EN); loại bỏ hoàn toàn các từ "giám hộ" / "guardianship". | **ĐẠT** |
| **Bug 2** | **Validation chu kỳ DMS thiếu thông báo** | Khai báo key `intervalMax` ở từ điển VI & EN; chặn submit khi > 180 ngày; hiển thị thông báo lỗi rõ ràng. | **ĐẠT** |
| **Bug 2 (StrictMode)** | **DMS bị kẹt input 30 khi tải đầu trong React StrictMode** | Thiết kế lại cơ chế đồng bộ DMS theo mô hình **Sync Demand Resiliency** (dùng `syncedContextRef`, `syncedRefreshTriggerRef`, `syncedRefreshKeyRef`), unmount cleanup an toàn. | **ĐẠT (10/10 test)** |
| **Bug 3** | **Thứ tự hiển thị Người thụ hưởng & Người thi hành** | Đưa phần Người thụ hưởng lên Tab 1 (`1. Người thụ hưởng`), Người thi hành xuống Tab 2 (`2. Người thi hành bên ngoài`). | **ĐẠT** |
| **Bug 8** | **Nút xác nhận hoạt động DMS** | Tăng kích thước nút (`min-height: 52px`), gradient thương hiệu đậm nét, đổ bóng rõ ràng, hover nâng nhẹ. | **ĐẠT** |
| **Bug 9** | **Tên trang tài sản** | Thống nhất menu, breadcrumb và tiêu đề: "Danh mục tài sản" (VI) / "Heritage Assets" (EN). | **ĐẠT** |
| **Bug 12** | **Bỏ dropdown số dòng mỗi trang tài sản** | Loại bỏ dropdown `pageSize`, cố định `pageSize = 10` theo mặc định. | **ĐẠT** |
| **Bug 17** | **Tách danh sách và form thêm người** | Tách riêng hai Tab với roving tabindex; form thêm đặt trong `<dialog>` riêng biệt căn giữa viewport; không lặp lại danh sách trong form. | **ĐẠT** |
| **Yêu cầu mới (Nhãn Minh họa)** | **Hiển thị nhãn dữ liệu minh họa rõ ràng VI/EN** | Thêm banner trên trang và notice bên trong cả 2 dialog thêm người khi chế độ xem thử (preview) hoạt động; hỗ trợ đầy đủ VI/EN; phân biệt bằng icon 🧪, badge và mô tả. | **ĐẠT** |
| **Yêu cầu mới (Preview Guard)** | **Chặn preview khi đã đăng nhập hoặc chạy production** | Gating nghiêm ngặt: DEV unauthenticated cho phép preview; DEV authenticated TUYỆT ĐỐI dùng API thật, bỏ qua preview; Production compile vô hiệu hóa preview vô điều kiện. | **ĐẠT (6/6 test)** |

---

## 2. CHI TIẾT TRIỂN KHAI PHẦN PREVIEW & NHÃN MINH HỌA

### 2.1. Nhãn dữ liệu minh họa VI/EN (Sample Data Labels)
Tại màn hình Người thụ hưởng & Người thi hành bên ngoài (`TrusteeBeneficiaryPage.jsx`):
1. **Banner trên trang chính:**
   - **Vị trí:** Nằm ngay dưới khối tiêu đề (Hero Title block), phía trên hệ thống Tabs.
   - **Nội dung Tiếng Việt (VI):**
     - Nhãn: `Dữ liệu minh họa` (kèm icon 🧪).
     - Giải thích: `Các thay đổi trong chế độ này chỉ dùng để xem thử, không được lưu vào hệ thống.`
   - **Nội dung Tiếng Anh (EN):**
     - Nhãn: `Sample data` (kèm icon 🧪).
     - Giải thích: `Changes in this preview are for demonstration only and are not saved to the system.`
   - **Trợ năng & Nhận diện:** Không chỉ phân biệt bằng màu sắc; sử dụng icon 🧪, badge viền amber đậm nét (`border: 1px solid #d97706`), nền gradient nhạt (`#fffbeb`), và thuộc tính `role="status" aria-live="polite"`.
2. **Thông báo bên trong Dialog thêm người:**
   - Cả hai hộp thoại: **Modal Thêm người thụ hưởng** và **Modal Thêm người thi hành bên ngoài** đều có khung thông báo `.lv-tb-dialog-preview-notice` (`role="note"`).
   - Cảnh báo rõ ràng thao tác thêm chỉ cập nhật danh sách mô phỏng tạm thời trên bộ nhớ, giúp người dùng không hiểu nhầm là thao tác lưu vào cơ sở dữ liệu thật.
3. **Đổi ngôn ngữ tức thì:**
   - Khi chuyển đổi qua lại giữa VI và EN, toàn bộ nhãn, huy hiệu và văn bản giải thích cập nhật ngay lập tức.
4. **Không hiển thị khi dùng API thật:**
   - Khi người dùng đã đăng nhập hoặc khi preview không được bật, banner và notice trong dialog hoàn toàn bị ẩn (`isDevPreviewActive === false`).

### 2.2. Cơ chế Bảo vệ Chặn Preview (Preview Guard & Transitions)
Được triển khai theo đường đi thực tế qua `App.jsx` → `TrusteeBeneficiaryRoute.jsx` → `TrusteeBeneficiaryPage.jsx`:
1. **Điều kiện kích hoạt Preview duy nhất (`isDevPreviewActive`):**
   ```javascript
   const isAuthenticated = Boolean(accessToken && typeof accessToken === 'string' && accessToken.trim().length > 0);
   const isDevPreviewActive = Boolean(import.meta.env?.DEV && !isAuthenticated && (isDevPreview || hasPreview));
   ```
2. **Kịch bản DEV, chưa đăng nhập, preview=true:**
   - Hiển thị nhãn và giải thích chuẩn xác theo ngôn ngữ (VI/EN).
   - Nạp dữ liệu mô phỏng (`fixtures`) hoặc kịch bản trống (`scenario=empty`).
   - Thao tác thêm người chỉ cập nhật local state mô phỏng, tuyệt đối **không gửi request ghi dữ liệu thật qua network**.
3. **Kịch bản DEV, đã đăng nhập (Authenticated):**
   - Bất kể URL có chứa tham số `preview=true`, `fixture=true`, `scenario=*` hay component nhận prop `isDevPreview=true`:
     + **Tuyệt đối không dùng fixture.**
     + **Không hiển thị nhãn dữ liệu minh họa.**
     + **Gọi API thật** với token Bearer. Nếu API gặp sự cố (ví dụ lỗi 500 hoặc 404), hiển thị `ErrorState` thật, **tuyệt đối không âm thầm fallback về dữ liệu giả**.
   - **Chuyển đổi phiên (Preview → Authenticated):**
     + Khi component chuyển từ trạng thái chưa đăng nhập (preview) sang đã đăng nhập, logic `isTransitionToAuth` lập tức:
       * Tự động đóng tất cả dialog đang mở (`trusteeDialog.current?.close()`, `beneficiaryDialog.current?.close()`).
       * Reset sạch sẽ các form nháp và thông báo lỗi (`setTrusteeForm(emptyTrustee)`, `setBeneficiaryForm(emptyBeneficiary)`, `setTrusteeErrors({})`, v.v.).
       * Xóa sạch dữ liệu và readiness mô phỏng trước khi bắt đầu tải dữ liệu thật.
     + Nhận diện theo dõi `fetchRequestId` và `AbortController` đảm bảo các response hoặc tác vụ cũ của preview bị loại bỏ, không bao giờ ghi đè lên dữ liệu của phiên đăng nhập thật.
4. **Kịch bản Production:**
   - Giao thức compile/build thực tế với `import.meta.env.PROD = true` (qua Vite define):
     + Thuộc tính `import.meta.env.DEV` biên dịch thành hằng số `false`, khiến `isDevPreviewActive` bị dead-code eliminated hoặc luôn luôn là `false`.
     + Preview bị vô hiệu hóa vô điều kiện dù URL hay caller cố ý truyền tham số.
     + Không bao giờ sinh dữ liệu giả hay readiness giả.
     + Người dùng chưa đăng nhập giữ nguyên guard xác thực hiện có; người dùng đã đăng nhập luôn gọi API thật.

---

## 3. BẢNG KIỂM THỬ PREVIEW GUARD (`trusteeBeneficiaryPreviewGuard.test.mjs`)

Được kiểm tra qua compile bundle Vite thực tế:

| STT | Tên bài test | Nội dung xác minh | Kết quả |
| :---: | :--- | :--- | :---: |
| 1 | **DEV unauthenticated VI preview** | URL `preview=true`: Hiển thị nhãn "Dữ liệu minh họa" trên trang và trong modal; nạp fixture mẫu; thêm người chỉ cập nhật dữ liệu giả, không gửi POST thật. | **PASS** |
| 2 | **DEV unauthenticated EN preview** | URL `preview=true&lang=en`: Hiển thị nhãn "Sample data" trên trang và trong modal; nạp fixture tiếng Anh; notice hiển thị đúng bản dịch. | **PASS** |
| 3 | **DEV authenticated ignores preview** | URL `preview=true` nhưng có `accessToken`: Nhãn minh họa KHÔNG hiển thị; không dùng fixture; gọi GET API thật với token Bearer. | **PASS** |
| 4 | **DEV authenticated API error handling** | Có `accessToken`, API GET trả lỗi 500: Hiển thị giao diện báo lỗi thật, không fallback về fixture mẫu, không hiện nhãn minh họa. | **PASS** |
| 5 | **Transition Preview -> Authenticated** | Ban đầu mở preview và mở modal nhập dở; khi session chuyển sang authenticated có token: Modal tự đóng, form reset, dữ liệu giả bị xóa sạch, nạp dữ liệu thật. | **PASS** |
| 6 | **Production Build Rejection** | Build bundle thực tế với `PROD=true`: Bất kể URL `preview=true` hay prop `isDevPreview=true`, preview bị vô hiệu hóa hoàn toàn, gọi API thật. | **PASS** |

---

## 4. KẾT QUẢ KIỂM THỬ THỰC TẾ (LƯỢT CHẠY CUỐI CÙNG)

### 4.1. Lệnh kiểm thử Scoped (Phạm vi công việc của Thái)
```powershell
node --test src/utils/dmsService.test.mjs src/utils/assetService.test.mjs src/utils/ownerPeopleUi.test.mjs src/utils/dmsComponentValidation.test.mjs src/utils/trusteeBeneficiaryPreviewGuard.test.mjs
```
- **Exit code:** `0`
- **Kết quả:** **85/85 tests PASS, 8 suites, 0 fail, 0 skipped** (Thời gian: ~2.1s).
  + `dmsService.test.mjs`: 29/29 tests PASS.
  + `assetService.test.mjs`: 34/34 tests PASS.
  + `ownerPeopleUi.test.mjs`: 6/6 tests PASS.
  + `dmsComponentValidation.test.mjs`: 10/10 tests PASS (React StrictMode).
  + `trusteeBeneficiaryPreviewGuard.test.mjs`: 6/6 tests PASS (Preview Guard & Production gating).

### 4.2. Lệnh kiểm thử Toàn diện Frontend (Full FE Regression Suite)
```powershell
npm test
```
- **Lệnh thực thi:** `node --max-old-space-size=512 --test --test-concurrency=1 "src/utils/*.test.mjs"`
- **Exit code:** `0`
- **Kết quả:** **688/688 tests PASS, 33 suites, 0 fail, 0 skipped** (Thời gian: 47.7s).
- **Đánh giá:** Không có bất kỳ lỗi hồi quy (regression) nào trên toàn bộ codebase FE.

### 4.3. Kiểm tra ESLint
```powershell
npm run lint
```
- **Lệnh thực thi:** `eslint .`
- **Exit code:** `0`
- **Kết quả:** **0 error, 0 warning**. Sạch sẽ toàn diện.

### 4.4. Kiểm tra Production Build
```powershell
npm run build
```
- **Lệnh thực thi:** `vite build`
- **Exit code:** `0`
- **Kết quả:** `✓ built in 675ms`.
- **Ghi chú cảnh báo bundle:** Xuất hiện cảnh báo mặc định của Vite: `(!) Some chunks are larger than 500 kB after minification (index-3JIUWrjU.js 1,009.63 kB)`. Cảnh báo này tồn tại từ cấu trúc chung của repo, không ảnh hưởng đến tính toàn vẹn và độ tin cậy của mã nguồn.

### 4.5. Kiểm tra Git Diff
```powershell
git diff --check
```
- **Exit code:** `0`.
- **Kết quả:** Hoàn toàn sạch sẽ, không có trailing whitespace, không có xung đột, không có tệp rác.

---

## 5. BẰNG CHỨNG HÌNH ẢNH TRÊN TRÌNH DUYỆT THẬT (REAL BROWSER VERIFICATION)

Đã chạy Vite dev server trên cổng riêng **5192** (cách ly, không chiếm cổng 5173 và không xung đột). Kiểm tra và chụp ảnh trực tiếp qua subagent browser:

### 5.1. Bằng chứng Nhãn Dữ liệu Minh họa (Sample Data Labels)
1. **Banner xem thử Tiếng Việt trên Trang chính:**
   - **Ảnh chụp:** [preview_banner_vi.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/preview_banner_vi_1792422559106.png)
   - **Ghi nhận:** Banner màu amber dịu mắt, icon 🧪, nhãn `DỮ LIỆU MINH HỌA`, thông điệp giải thích: *"Các thay đổi trong chế độ này chỉ dùng để xem thử, không được lưu vào hệ thống."*.
2. **Thông báo xem thử Tiếng Việt trong Dialog Thêm người:**
   - **Ảnh chụp:** [preview_modal_vi.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/preview_modal_vi_1792422568167.png)
   - **Ghi nhận:** Bên trong dialog hiển thị notice `DỮ LIỆU MINH HỌA` ngay dưới tiêu đề modal, làm rõ thao tác không lưu vào database thật.
3. **Banner xem thử Tiếng Anh trên Trang chính:**
   - **Ảnh chụp:** [preview_banner_en.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/preview_banner_en_1792422592748.png)
   - **Ghi nhận:** Chuyển đổi ngôn ngữ sang EN cập nhật ngay lập tức: nhãn `SAMPLE DATA`, thông điệp giải thích: *"Changes in this preview are for demonstration only and are not saved to the system."*.
4. **Thông báo xem thử Tiếng Anh trong Dialog Thêm người:**
   - **Ảnh chụp:** [preview_modal_en.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/preview_modal_en_1792422603217.png)
   - **Ghi nhận:** Inside dialog notice hiển thị `SAMPLE DATA` chuẩn xác.
5. **Video ghi hình phiên test Browser Preview Labels:**
   - **Tệp WebP:** [preview_labels_1792422547174.webp](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/preview_labels_1792422547174.webp)

### 5.2. Bằng chứng Giao diện Tabs & Accessibility đã thực hiện trước đó
1. **Tabs Người thụ hưởng Desktop:** [people_desktop_tabs_beneficiary.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/people_desktop_tabs_beneficiary_png_1792419469523.png)
2. **Tabs Người thi hành Desktop (Roving tabindex):** [people_desktop_tabs_trustee.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/people_desktop_tabs_trustee_png_1792419486607.png)
3. **Dialog Thêm Người thụ hưởng:** [people_desktop_dialog_beneficiary.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/people_desktop_dialog_beneficiary_png_1792419499228.png)
4. **Dialog Thêm Người thi hành (Kịch bản Empty):** [people_desktop_dialog_trustee.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/people_desktop_dialog_trustee_png_1792419534472.png)
5. **Tabs Mobile Responsiveness:** [people_mobile_tabs.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/people_mobile_tabs_png_1792419552259.png)
6. **Dialog Mobile Responsiveness & Scrolling:** [people_mobile_dialog.png](file:///C:/Users/hai/.gemini/antigravity-ide/brain/f5b3cdb5-35c8-4f47-9a0c-21da33c8a922/people_mobile_dialog_png_1792419570842.png)

*(Tiến trình server cổng 5192 đã được dừng sạch sẽ sau khi hoàn tất kiểm tra).*

---

## 6. DANH SÁCH FILE THAY ĐỔI TRONG WORKTREE

| Loại | Đường dẫn tệp | Mô tả tóm tắt nội dung thay đổi |
| :---: | :--- | :--- |
| **M** | `frontend/src/pages/trusteeBeneficiary/TrusteeBeneficiaryPage.jsx` | Thêm banner nhãn dữ liệu minh họa VI/EN; notice trong 2 dialog; logic `isDevPreviewActive` chặn khi có token; cơ chế dọn dẹp state khi chuyển sang authenticated; Tabs roving tabindex & native dialog. |
| **M** | `frontend/src/pages/trusteeBeneficiary/TrusteeBeneficiaryPage.css` | CSS cho banner preview `.lv-tb-preview-banner`, badge `.lv-tb-preview-badge`, dialog notice `.lv-tb-dialog-preview-notice`, responsive `< 640px`. |
| **M** | `frontend/src/pages/trusteeBeneficiary/TrusteeBeneficiaryRoute.jsx` | Gating chặt chẽ `effectiveDevPreview = Boolean(import.meta.env?.DEV && !isAuthenticated && isDevPreview)`. |
| **M** | `frontend/src/App.jsx` | Route `/beneficiaries?preview=true` mở cho `TrusteeBeneficiaryRoute`. |
| **M** | `frontend/src/pages/dms/DMSOverviewPage.jsx` | Thiết kế lại cơ chế đồng bộ DMS an toàn với React StrictMode (`syncedContextRef`, `syncedRefreshTriggerRef`, `syncedRefreshKeyRef`), derived state error theo ngôn ngữ. |
| **M** | `frontend/src/pages/dms/DMSOverviewPage.css` | Selector hover riêng biệt không `!important`, focus-visible, prefers-reduced-motion. |
| **M** | `frontend/src/components/layout/AppShell.jsx` | Thống nhất menu "Danh mục tài sản" (VI) / "Heritage Assets" (EN). |
| **M** | `frontend/src/pages/assets/assetI18n.js` | Đồng nhất nhãn từ điển Heritage Assets. |
| **M** | `frontend/src/components/assets/AssetListTable.jsx` | Cố định phân trang `pageSize = 10`, loại bỏ dropdown page size. |
| **M** | `frontend/src/utils/dmsService.js` | Bổ sung thông báo `intervalMax` vào từ điển VI & EN. |
| **M** | `frontend/src/utils/dmsService.test.mjs` | Test cho `intervalMax` và biên giới hạn 1–180. |
| **M** | `frontend/src/utils/assetService.test.mjs` | Test phân trang cố định và i18n tài sản. |
| **M** | `frontend/src/utils/ownerPeopleUi.test.mjs` | Test tabs accessibility, fixtures thực tế và giới hạn 1 Trustee. |
| **??** | `frontend/src/utils/trusteeBeneficiaryPreviewGuard.test.mjs` | **Tệp mới:** 6 bài test toàn diện kiểm tra Preview Guard (DEV unauth VI/EN, DEV auth rejection, transition cleanup, Production build rejection). |
| **??** | `frontend/src/utils/dmsComponentValidation.test.mjs` | **Tệp mới:** 10 bài test regression DMS trong React StrictMode thực tế. |
| **??** | `docs/reviews/2026-10-19-thai-feedback-ui-handover.md` | **Tệp mới:** Tài liệu báo cáo bàn giao chi tiết cho Codex review. |

---

## 7. GIỚI HẠN & PHỤ THUỘC BACKEND CÒN LẠI

1. **Demo DMS Giờ/Phút:**
   - Contract Backend hiện tại (`GET/PUT /api/v1/dms`) chỉ hỗ trợ duy nhất tham số `checkIntervalDays` (kiểu số nguyên ngày, giá trị từ 1 đến 180).
   - Nếu muốn có giao diện demo đếm giờ hoặc phút phục vụ bài thuyết trình, Backend bắt buộc phải mở rộng contract (ví dụ thêm `checkIntervalUnit: 'DAYS' | 'HOURS' | 'MINUTES'`). Phía Frontend không tự ý sửa hợp đồng API.
2. **Tích hợp Backend Thật cho Người liên quan:**
   - Endpoint `/api/v1/trustees` và `/api/v1/vaults/{id}/beneficiaries` yêu cầu JWT authentication hợp lệ của tài khoản `VAULT_OWNER`. Khi có JWT, hệ thống luôn gọi API thật với Bearer token và hiển thị đúng dữ liệu thật từ Backend.
3. **Phạm vi của Huy (Được bảo toàn nguyên vẹn):**
   - Các tính năng Google Login, Password Reset, Edit Beneficiary/Trustee, Child Guardian thuộc phân công của Huy và được giữ nguyên vẹn, không bị can thiệp.
