UPDATE dbo.roles
SET role_code = SUBSTRING(role_code, 6, LEN(role_code))
WHERE role_code LIKE 'ROLE[_]%';