package com.legacyvault.admin.user.service;

import com.legacyvault.vault.entity.Vault;

import java.util.List;

/** Vault statuses an Admin lock decision depends on (the post-death workflow and the archive). */
public final class AdminAccountStatus {
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
}
