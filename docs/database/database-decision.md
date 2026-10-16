# Database Decision

| Thuộc tính | Giá trị |
|---|---|
| Database | `LegacyVault` |
| Database engine | Microsoft SQL Server |
| Connection | Local TCP, port `1433` (cấu hình theo môi trường) |
| Authentication | Windows Integrated Authentication (cấu hình theo môi trường) |
| Schema management | Flyway |
| Hibernate DDL | `ddl-auto: none` |
| Migration history | `flyway_schema_history` |

**Notes**
- Connection URL và thông tin xác thực được cấu hình theo môi trường của từng thành viên.
- Flyway quản lý các thay đổi schema thông qua migration scripts.
- Hibernate không tự động tạo hoặc cập nhật schema.