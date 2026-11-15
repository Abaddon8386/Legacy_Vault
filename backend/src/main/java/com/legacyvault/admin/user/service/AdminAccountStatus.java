package com.legacyvault.admin.user.service;

import com.legacyvault.vault.entity.Vault;

import java.util.List;

/** Các trạng thái Vault mà quyết định khóa tài khoản của Admin phụ thuộc vào (quy trình hậu sự và lưu trữ). */
public final class AdminAccountStatus {
    /** Mọi trạng thái Vault từ bước xác minh đầu tiên đến bàn giao (toàn bộ quy trình hậu sự). */
    public static final List<String> HANDOVER_VAULT_STATUSES = List.of(
            Vault.STATUS_AWAITING_VERIFICATION,
            Vault.STATUS_DOCUMENT_VERIFICATION,
            Vault.STATUS_WILL_VERIFICATION,
            Vault.STATUS_AWAITING_LEGAL_BASIS,
            Vault.STATUS_ON_HOLD,
            Vault.STATUS_LEGAL_BASIS_VERIFICATION,
            Vault.STATUS_UNLOCKED,
            Vault.STATUS_HANDOVER_IN_PROGRESS);

    /** Các trạng thái Vault khiến Admin không được khóa tài khoản. */
    public static final List<String> LOCK_BLOCKING_VAULT_STATUSES;

    static {
        var blocking = new java.util.ArrayList<>(HANDOVER_VAULT_STATUSES);
        blocking.add(Vault.STATUS_ARCHIVED);
        LOCK_BLOCKING_VAULT_STATUSES = List.copyOf(blocking);
    }

    private AdminAccountStatus() {
    }
}
