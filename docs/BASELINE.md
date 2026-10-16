# Đối chiếu bản nền — 12/10/2026

## Nguồn đã xác minh

- Repo đích: `https://github.com/Abaddon8386/Legacy_Vault.git`, checkout `C:\Users\hai\Downloads\FALL26\SWP\Legacy_Vault`.
- Trước thay đổi: develop tại `e202e92` (Initial commit), working tree sạch, chỉ có README.md.
- Repo nguồn chỉ đọc: `https://github.com/Abaddon8386/LegacyVault.git`, Git object tại `C:\Users\hai\Downloads\FALL26\SWP\LegacyVault\LegacyVault`.
- [Commit nền 8b0f6fb2bcdeffff730474e1876f7bf7164634a3](https://github.com/Abaddon8386/LegacyVault/commit/8b0f6fb2bcdeffff730474e1876f7bf7164634a3), xác minh bằng connector GitHub và Git objects local.
- First-parent của merge PS-1 `deee9ae` là đúng commit nền này. Không lấy code từ HEAD/develop cuối.

## Phần đưa lại

29 file từ commit nền: toàn bộ frontend/, backend/, .gitignore và .gitkeep của database/, docs/, scripts/. Giữ nguyên Maven Wrapper, dependency, lockfile, React starter, package Java và context test.

Không đưa .git, .vscode, ContextDiagram.drawio.png, TEST.txt hay lịch sử thử nghiệm cũ vào repo mới. README mới viết riêng; không đưa README PS-75 vào commit bộ khung.

Khác biệt chủ động so với nền:

- application.yaml dùng `${SPRING_DATASOURCE_URL}` thay URL ABADDON cố định; tắt show-sql để tránh mặc định log SQL. Giữ JPA ddl-auto none và Spring Security.
- .gitignore bổ sung application-local.*, DLL native và cache npm local.
- Bổ sung README hướng dẫn chạy, tài liệu đối chiếu và kiểm chứng.
- Database vẫn trống như nền; chưa đưa schema/migration/seed PS-73 hoặc backend foundation PS-74.

## Thứ tự tích hợp FE quan sát từ origin/develop cũ

| Thứ tự | Ticket | PR cũ | Merge cũ |
| --- | --- | --- | --- |
| 1 | PS-1 | #3 | deee9ae |
| 2 | PS-2 | #6 | 32d553f |
| 3 | PS-3 | #7 | 445e449 |
| 4 | PS-4 | #11 | 847e76f |
| 5 | PS-5 | #2 | 2517b7e |
| 6 | PS-6 | #8 | e25788c |
| 7 | PS-7 | #9 | 4b1c600 |
| 8 | PS-8 | #10 | f7c0147 |

Đây là thứ tự merge FE, không phải thứ tự toàn backlog. PS-73, PS-74, PS-75 tồn tại trên các nhánh khác; cần đọc Jira và kiểm tra phụ thuộc/version riêng trước khi đưa lại. Mỗi ticket cần lấy diff trước/sau merge, bao gồm xóa file và giải quyết conflict, không lấy nguyên file ở HEAD cuối. Chưa áp dụng ticket nào trong lần khởi tạo này.

## Truy vết repo mới

Nhánh chuẩn bị: `codex/initialize-scaffold`, tách từ develop e202e92. Commit bộ khung mới có thông điệp `chore: rebuild initial scaffold from verified legacy baseline`; SHA và PR được Git/GitHub ghi nhận khi xuất bản nhánh. Không sao chép tác giả, ngày commit hoặc lịch sử repo cũ. Các ticket chưa được đưa lại và chưa có đối chiếu commit mới.
