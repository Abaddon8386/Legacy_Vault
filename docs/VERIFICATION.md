# Kiểm chứng bộ khung — 12/10/2026

Checkout: `C:\Users\hai\Downloads\FALL26\SWP\Legacy_Vault`, remote `https://github.com/Abaddon8386/Legacy_Vault.git`, nhánh `codex/initialize-scaffold` từ develop `e202e92`.

## Kết quả thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| Commit nền repo cũ qua GitHub connector | Xác minh 8b0f6fb2bcdeffff730474e1876f7bf7164634a3 |
| First-parent trước merge PS-1 | deee9ae^1 = 8b0f6fb |
| So sánh nội dung 29 file nguồn/đích | 27 file giống từng byte; khác .gitignore và application.yaml như BASELINE.md |
| npm.cmd ci --cache .npm-cache --fetch-retries=0 --fetch-timeout=20000 | PASS, 143 packages; audit báo 0 vulnerabilities tại thời điểm chạy |
| npm.cmd run lint | PASS, exit 0 |
| npm.cmd run build | PASS, Vite 8.3.3 theo lockfile, 20 modules |
| mvn.cmd -DskipTests package | BUILD SUCCESS, compile main/test với release 25, executable jar tạo thành công |
| .\mvnw.cmd -version | PASS, Maven 3.9.16, Java 25.0.4.1 |
| git diff --check | PASS cho tracked diff; cảnh báo LF/CRLF theo cấu hình Git máy |

Node 24.18.0, npm 11.16.0, JDK 25.0.4.1 trên Windows. Maven cài sẵn dùng khi kiểm tra đóng gói là 3.10.0. Lombok phát cảnh báo deprecated Unsafe, không làm build thất bại.

Lần chạy npm ban đầu trong sandbox không hoàn tất tải dependency; đã dừng và chạy lại thành công với quyền tải dependency. Maven ban đầu không ghi được lock trong cache .m2; chạy lại với quyền ghi cache thành công. Cache npm tạm đã xóa sau kiểm tra; node_modules, dist, target được ignore.

## Chưa xác minh

- Chưa chạy contextLoads hoặc mvnw verify: chưa có URL và kết nối SQL Server của repo mới được xác minh. `-DskipTests package` không phải test pass.
- Chưa chạy backend server, kiểm tra API hoặc FE → BE → SQL Server. Nền chưa có API, proxy/CORS và schema nghiệp vụ.
- Chưa kiểm tra UI trong trình duyệt hoặc clone mới trên máy thành viên khác. Build/lint chỉ kiểm chứng starter ở phạm vi tương ứng.
- Chưa merge vào develop; không đổi trạng thái Jira, không sửa repo cũ hay backup.

## Bàn giao commit/PR

Người dùng đã cho phép Codex commit, push nhánh và tạo PR vào develop ngày 12/10/2026. Danh tính Git có hiệu lực đã kiểm tra: `thaithai9785-stack <bevatysun12@gmail.com>`. Commit dùng thời gian hiện tại và mô tả việc dựng lại bộ khung. PR cần review trước khi merge. Sau khi merge mới bắt đầu từng nhánh ticket từ develop cập nhật; ghi SHA/PR mới vào đối chiếu.
