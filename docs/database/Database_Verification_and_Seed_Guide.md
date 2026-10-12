# LegacyVault — SQL Server Database Verification & Seed Guide

Tài liệu này dùng để kiểm tra các bảng/entity trong database `LegacyVault` sau khi chạy migration bằng Flyway và hướng dẫn cách nạp seed data.

> **Lưu ý thuật ngữ:** Entity là lớp Java/JPA; table là bảng trong SQL Server. Các câu lệnh SQL dưới đây kiểm tra bảng, cột, khóa, index, trigger và dữ liệu trong database. Chúng không tự xác nhận rằng các lớp Java Entity đã được ánh xạ đúng; việc đó cần kiểm tra source code và chạy test.

## 1. Chọn database

Chạy trong SSMS → **New Query**:

```sql
USE LegacyVault;
GO
SELECT DB_NAME() AS current_database;
```

Kết quả mong đợi: `LegacyVault`.

## 2. Liệt kê tất cả bảng nghiệp vụ

Theo migration V1 hiện tại, danh sách bảng nghiệp vụ dự kiến gồm 14 bảng:

- `users`
- `roles`
- `user_roles`
- `vaults`
- `assets`
- `asset_versions`
- `trustees`
- `beneficiaries`
- `asset_allocations`
- `dms_configs`
- `vitality_check_logs`
- `audit_logs`
- `legal_documents`
- `legal_verifications`

Flyway còn có thể tạo bảng hệ thống lịch sử migration `flyway_schema_history`.

```sql
USE LegacyVault;
GO
SELECT s.name AS schema_name, t.name AS table_name
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE s.name = 'dbo'
ORDER BY t.name;
```

## 3. Kiểm tra đủ 14 bảng nghiệp vụ

```sql
USE LegacyVault;
GO
WITH expected(table_name) AS (
    SELECT name
    FROM (VALUES
        ('users'), ('roles'), ('user_roles'), ('vaults'),
        ('assets'), ('asset_versions'), ('trustees'), ('beneficiaries'),
        ('asset_allocations'), ('dms_configs'), ('vitality_check_logs'),
        ('audit_logs'), ('legal_documents'), ('legal_verifications')
    ) AS v(name)
)
SELECT e.table_name,
       CASE WHEN t.object_id IS NULL THEN 'MISSING' ELSE 'EXISTS' END AS table_status
FROM expected AS e
LEFT JOIN sys.tables AS t
    ON t.name = e.table_name
   AND t.schema_id = SCHEMA_ID('dbo')
ORDER BY e.table_name;
```

Mong đợi: tất cả 14 dòng có `EXISTS`.

## 4. Kiểm tra cột của từng bảng

Liệt kê toàn bộ cột, kiểu dữ liệu, cho phép NULL hay không, và giá trị mặc định:

```sql
USE LegacyVault;
GO
SELECT TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME,
       DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION,
       NUMERIC_SCALE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

Để xem cột của một bảng cụ thể, thay `users` bằng tên bảng cần kiểm tra:

```sql
EXEC sys.sp_help 'dbo.users';
```

Ví dụ có thể kiểm tra `dbo.assets`, `dbo.asset_versions`, `dbo.legal_documents` hoặc `dbo.legal_verifications`.

## 5. Kiểm tra khóa chính, khóa ngoại và unique constraints

### Khóa chính

```sql
USE LegacyVault;
GO
SELECT t.name AS table_name, c.name AS primary_key_column,
       kc.name AS primary_key_name
FROM sys.key_constraints AS kc
JOIN sys.tables AS t ON t.object_id = kc.parent_object_id
JOIN sys.index_columns AS ic
  ON ic.object_id = t.object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns AS c
  ON c.object_id = t.object_id AND c.column_id = ic.column_id
WHERE kc.type = 'PK' AND SCHEMA_NAME(t.schema_id) = 'dbo'
ORDER BY t.name, ic.key_ordinal;
```

### Khóa ngoại

```sql
USE LegacyVault;
GO
SELECT fk.name AS foreign_key_name,
       OBJECT_SCHEMA_NAME(fk.parent_object_id) AS source_schema,
       OBJECT_NAME(fk.parent_object_id) AS source_table,
       pc.name AS source_column,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS target_schema,
       OBJECT_NAME(fk.referenced_object_id) AS target_table,
       rc.name AS target_column
FROM sys.foreign_keys AS fk
JOIN sys.foreign_key_columns AS fkc
  ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns AS pc
  ON pc.object_id = fkc.parent_object_id
 AND pc.column_id = fkc.parent_column_id
JOIN sys.columns AS rc
  ON rc.object_id = fkc.referenced_object_id
 AND rc.column_id = fkc.referenced_column_id
WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = 'dbo'
ORDER BY source_table, fk.name;
```

### Unique constraints

```sql
USE LegacyVault;
GO
SELECT t.name AS table_name, kc.name AS unique_constraint_name
FROM sys.key_constraints AS kc
JOIN sys.tables AS t ON t.object_id = kc.parent_object_id
WHERE kc.type = 'UQ' AND SCHEMA_NAME(t.schema_id) = 'dbo'
ORDER BY t.name, kc.name;
```

### Kiểm tra các quy tắc đã được duyệt

```sql
USE LegacyVault;
GO

-- Mỗi Owner chỉ có một Vault.
SELECT name, is_unique
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.vaults')
  AND is_unique = 1;

-- Chỉ một Trustee đang APPOINTED cho mỗi Vault; lịch sử đã thu hồi vẫn được giữ.
SELECT name, is_unique, filter_definition
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.trustees')
  AND name = 'UX_trustees_vault_active';

-- Trustee phải có ít nhất phone hoặc email.
SELECT name, definition
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('dbo.trustees')
  AND name = 'CK_trustees_phone_or_email';

-- Grace period có DEFAULT 1.
SELECT c.name AS column_name, dc.name AS default_constraint,
       dc.definition AS default_value
FROM sys.default_constraints dc
JOIN sys.columns c
  ON c.object_id = dc.parent_object_id
 AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.dms_configs')
  AND c.name = 'grace_period_days';

-- Các public_id đều có DEFAULT NEWID().
SELECT t.name AS table_name, c.name AS column_name, dc.definition AS default_value
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'public_id'
LEFT JOIN sys.default_constraints dc
  ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE SCHEMA_NAME(t.schema_id) = 'dbo'
ORDER BY t.name;
```

Kết quả cần xác nhận:
- `vaults.owner_user_id` có unique constraint/index.
- `UX_trustees_vault_active` lọc `status = 'APPOINTED'`.
- `CK_trustees_phone_or_email` tồn tại.
- `dms_configs.grace_period_days` có default `(1)`.
- 10 bảng có `public_id` đều hiển thị default `newid()`.

## 6. Kiểm tra index và trigger

### Index

```sql
USE LegacyVault;
GO
SELECT t.name AS table_name, i.name AS index_name, i.type_desc,
       i.is_primary_key, i.is_unique
FROM sys.indexes AS i
JOIN sys.tables AS t ON t.object_id = i.object_id
WHERE SCHEMA_NAME(t.schema_id) = 'dbo'
  AND i.name IS NOT NULL
ORDER BY t.name, i.name;
```

### Trigger trên audit_logs

```sql
USE LegacyVault;
GO
SELECT name AS trigger_name, is_disabled
FROM sys.triggers
WHERE parent_id = OBJECT_ID('dbo.audit_logs');
```

Theo V1 hiện tại, dự kiến có:
- `TR_audit_logs_no_update`
- `TR_audit_logs_no_delete`

Mong đợi `is_disabled = 0`. Nếu không có trigger, kiểm tra migration đã chạy thành công và nội dung V1 đang được dùng.

## 7. Kiểm tra trạng thái Flyway

```sql
USE LegacyVault;
GO
IF OBJECT_ID('dbo.flyway_schema_history', 'U') IS NOT NULL
BEGIN
    SELECT installed_rank, version, description, type, script, success, installed_on
    FROM dbo.flyway_schema_history
    ORDER BY installed_rank;
END
ELSE
BEGIN
    SELECT 'flyway_schema_history not found: Flyway may not have created it or it may be in another schema.' AS message;
END;
```

Mong đợi: mọi migration áp dụng (bao gồm V1 và V2 nếu V2 đã được thêm vào branch) có `success = 1`. Nếu migration thất bại/rollback, không xem database là đã setup xong.

## 8. Kiểm tra dữ liệu seed

### Đếm số dòng từng bảng

```sql
USE LegacyVault;
GO
SELECT 'users' AS table_name, COUNT_BIG(*) AS row_count FROM dbo.users
UNION ALL SELECT 'roles', COUNT_BIG(*) FROM dbo.roles
UNION ALL SELECT 'user_roles', COUNT_BIG(*) FROM dbo.user_roles
UNION ALL SELECT 'vaults', COUNT_BIG(*) FROM dbo.vaults
UNION ALL SELECT 'assets', COUNT_BIG(*) FROM dbo.assets
UNION ALL SELECT 'asset_versions', COUNT_BIG(*) FROM dbo.asset_versions
UNION ALL SELECT 'trustees', COUNT_BIG(*) FROM dbo.trustees
UNION ALL SELECT 'beneficiaries', COUNT_BIG(*) FROM dbo.beneficiaries
UNION ALL SELECT 'asset_allocations', COUNT_BIG(*) FROM dbo.asset_allocations
UNION ALL SELECT 'dms_configs', COUNT_BIG(*) FROM dbo.dms_configs
UNION ALL SELECT 'vitality_check_logs', COUNT_BIG(*) FROM dbo.vitality_check_logs
UNION ALL SELECT 'audit_logs', COUNT_BIG(*) FROM dbo.audit_logs
UNION ALL SELECT 'legal_documents', COUNT_BIG(*) FROM dbo.legal_documents
UNION ALL SELECT 'legal_verifications', COUNT_BIG(*) FROM dbo.legal_verifications
ORDER BY table_name;
```

### Kiểm tra 5 vai trò

```sql
SELECT role_code, role_name
FROM dbo.roles
WHERE role_code IN (
    'ROLE_VAULT_OWNER', 'ROLE_STAFF_EXECUTOR',
    'ROLE_LEGAL_VERIFIER', 'ROLE_ADMIN', 'ROLE_BENEFICIARY'
)
ORDER BY role_code;
```

### Kiểm tra các tài khoản demo RBAC (nếu đã chạy seed RBAC)

```sql
SELECT user_id, email, status
FROM dbo.users
WHERE email IN (
    'seed.owner@legacyvault.local',
    'seed.admin@legacyvault.local',
    'seed.verifier@legacyvault.local',
    'seed.executor@legacyvault.local',
    'seed.beneficiary1@legacyvault.local',
    'seed.beneficiary2@legacyvault.local'
)
ORDER BY email;
```

Kiểm tra role gán cho các tài khoản demo:

```sql
SELECT u.email, r.role_code
FROM dbo.users AS u
JOIN dbo.user_roles AS ur ON ur.user_id = u.user_id
JOIN dbo.roles AS r ON r.role_id = ur.role_id
WHERE u.email LIKE 'seed.%@legacyvault.local'
ORDER BY u.email, r.role_code;
```

Tài khoản demo chỉ xuất hiện nếu seed tương ứng đã được chạy thành công. Nếu seed file dùng placeholder như `@DemoBcryptHash`, cần thay bằng BCrypt hash hợp lệ trước khi chạy.


## 10. Quy trình đề xuất cho LegacyVault

1. Khởi động ứng dụng Spring Boot để Flyway chạy migration.
2. Xác nhận V1 trong `flyway_schema_history` có `success = 1`.
3. Chạy các câu lệnh ở mục 3, 5, 6 để xác nhận bảng và constraints.
4. Chạy file seed demo riêng trong SSMS, sau khi thay placeholder BCrypt hash nếu có. Seed bỏ qua `public_id` để database sinh UUID bằng `DEFAULT NEWID()`; dữ liệu DMS demo dùng grace period 1 ngày.
5. Chạy mục 8 để xác nhận dữ liệu.
6. Chỉ sau đó mới kiểm tra luồng API bằng Postman hoặc test tự động.

> **Phân biệt quan trọng:** Flyway tự động tạo schema khi được cấu hình và ứng dụng khởi động; file seed riêng không tự chạy chỉ vì nó nằm trong repository. Các câu SQL ở tài liệu này chỉ đọc metadata/dữ liệu, ngoại trừ lệnh `USE` chỉ chuyển database cho phiên truy vấn.
