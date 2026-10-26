package com.legacyvault.subscription.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.subscription.service.PaymentService;
import com.legacyvault.subscription.service.PaymentReconciliationService;
import com.legacyvault.subscription.service.PaymentService.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
public class PaymentController {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(PaymentController.class);
    private final PaymentService payments;
    private final PaymentReconciliationService reconciliation;
    public PaymentController(PaymentService payments,PaymentReconciliationService reconciliation) {
        this.payments=payments; this.reconciliation=reconciliation;
    }
    @PostMapping("/api/v1/subscriptions/me/payments")
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public PaymentView create(@AuthenticationPrincipal CustomUserPrincipal user,@Valid @RequestBody CheckoutRequest request,HttpServletRequest servlet) {
        return payments.create(CustomUserPrincipal.requireUserId(user),request,servlet.getRemoteAddr());
    }
    @GetMapping("/api/v1/subscriptions/me/payments/{id}")
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public PaymentView read(@AuthenticationPrincipal CustomUserPrincipal user,@PathVariable UUID id) {
        return reconciliation.read(CustomUserPrincipal.requireUserId(user),id);
    }
    @GetMapping("/api/v1/payments/vnpay/ipn")
    public IpnResult ipn(@RequestParam MultiValueMap<String,String> query) {
        // Catch outside transactional proxy: failures have rolled back before telling VNPay to retry.
        try { return payments.ipn(query); }
        catch(RuntimeException e) {
            LOG.warn("VNPay IPN transaction failed; rolled back and awaiting retry");
            return new IpnResult("99","Retry later");
        }
    }
}
