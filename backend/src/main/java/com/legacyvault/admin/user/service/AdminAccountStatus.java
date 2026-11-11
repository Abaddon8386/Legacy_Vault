package com.legacyvault.admin.user.service;

import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;

import java.util.List;

/**
 * The account status an Admin sees. Only ACTIVE, LOCKED, PENDING and DELETED are stored on the account; ARCHIVED and
 * HANDOVER_IN_PROGRESS are derived on every read from the owner's vault, so they can never drift from the database.
 * Priority: DELETED, then ARCHIVED, then HANDOVER_IN_PROGRESS, then the stored status (LOCKED, PENDING, ACTIVE).
 */
public final class AdminAccountStatus {
    public static final String DELETED = "DELETED";
    public static final String ARCHIVED = "ARCHIVED";
    public static final String HANDOVER_IN_PROGRESS = "HANDOVER_IN_PROGRESS";

    /** Every vault status from the first verification step up to the handover itself (the whole post-death workflow). */
    public static final List<String> HANDOVER_VAULT_STATUSES = List.of(
            Vault.STATUS_AWAITING_VERIFICATION,
            Vault.STATUS_DOCUMENT_VERIFICATION,
            Vault.STATUS_WILL_VERIFICATION,
            Vault.STATUS_AWAITING_LEGAL_BASIS,
            Vault.STATUS_ON_HOLD,
            Vault.STATUS_LEGAL_BASIS_VERIFICATION,
            Vault.STATUS_UNLOCKED,
            Vault.STATUS_HANDOVER_IN_PROGRESS);

    /** Vault statuses that stop an Admin from locking the account. */
    public static final List<String> LOCK_BLOCKING_VAULT_STATUSES;

    static {
        var blocking = new java.util.ArrayList<>(HANDOVER_VAULT_STATUSES);
        blocking.add(Vault.STATUS_ARCHIVED);
        LOCK_BLOCKING_VAULT_STATUSES = List.copyOf(blocking);
    }

    private AdminAccountStatus() {
    }

    /** @param vaultStatus status of the account's vault, or null when it has none */
    public static String effective(User user, String vaultStatus) {
        if (user.getDeletedAt() != null) {
            return DELETED;
        }
        if (Vault.STATUS_ARCHIVED.equals(vaultStatus)) {
            return ARCHIVED;
        }
        if (vaultStatus != null && HANDOVER_VAULT_STATUSES.contains(vaultStatus)) {
            return HANDOVER_IN_PROGRESS;
        }
        return user.getStatus();
    }
}
