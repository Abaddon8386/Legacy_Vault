package com.legacyvault.subscription.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import com.legacyvault.subscription.service.OwnerQuotaService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;
import com.legacyvault.subscription.service.SubscriptionUpgradeService;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

@RestController
@PreAuthorize("hasRole('VAULT_OWNER')")
public class SubscriptionController {
    private final OwnerQuotaService quotas;
    private final SubscriptionUpgradeService upgrades;
    public SubscriptionController(OwnerQuotaService quotas, SubscriptionUpgradeService upgrades) {
        this.quotas = quotas; this.upgrades = upgrades;
    }
    @PostMapping("/api/v1/subscriptions/me/upgrade")
    public UpgradeResponse upgrade(@AuthenticationPrincipal CustomUserPrincipal principal,
            @Valid @RequestBody UpgradeRequest request) {
        return upgrades.upgrade(CustomUserPrincipal.requireUserId(principal), request);
    }

    @GetMapping("/api/v1/subscription-plans")
    public List<Plan> catalog() { quotas.requirePrototypeEnabled(); return quotas.catalog(); }

    @GetMapping("/api/v1/subscriptions/me")
    public Current current(@AuthenticationPrincipal CustomUserPrincipal principal) {
        quotas.requirePrototypeEnabled();
        return quotas.current(CustomUserPrincipal.requireUserId(principal));
    }
}
