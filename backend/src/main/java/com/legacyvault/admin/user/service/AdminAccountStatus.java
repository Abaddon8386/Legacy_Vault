package com.legacyvault.admin.user.service;

import com.legacyvault.vault.entity.Vault;

import java.util.List;

/**
 * Các trạng thái Vault mà quyết định khoá tài khoản của Admin phụ thuộc vào (quy trình sau khi Owner mất và trạng thái lưu trữ).
 * Hằng số dùng chung, không khởi tạo được; {@link AdminUserManagementService} dùng để chặn khoá tài khoản đang trong quy trình thừa kế.
 */
public final class AdminAccountStatus {
    /** Mọi trạng thái Vault từ bước xác minh đầu tiên đến chính việc bàn giao (toàn bộ quy trình sau khi Owner mất). */
    public static final List<String> HANDOVER_VAULT_STATUSES = List.of(
            Vault.STATUS_AWAITING_VERIFICATION,
            Vault.STATUS_DOCUMENT_VERIFICATION,
            Vault.STATUS_WILL_VERIFICATION,
            Vault.STATUS_AWAITING_LEGAL_BASIS,
            Vault.STATUS_ON_HOLD,
            Vault.STATUS_LEGAL_BASIS_VERIFICATION,
            Vault.STATUS_UNLOCKED,
            Vault.STATUS_HANDOVER_IN_PROGRESS);

    /** Trạng thái Vault chặn Admin khoá tài khoản chủ Vault ({@code ADMIN_ACCOUNT_IN_HANDOVER}): các trạng thái bàn giao ở trên cộng {@code ARCHIVED}. */
    public static final List<String> LOCK_BLOCKING_VAULT_STATUSES;

    static {
        var blocking = new java.util.ArrayList<>(HANDOVER_VAULT_STATUSES);
        blocking.add(Vault.STATUS_ARCHIVED);
        LOCK_BLOCKING_VAULT_STATUSES = List.copyOf(blocking);
    }

    /** Ngăn khởi tạo: class chỉ chứa hằng số. */
    private AdminAccountStatus() {
    }
}
