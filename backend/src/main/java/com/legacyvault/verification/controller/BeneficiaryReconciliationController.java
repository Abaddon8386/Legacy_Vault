package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.service.BeneficiaryReconciliationService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class BeneficiaryReconciliationController {
    private final BeneficiaryReconciliationService service;
    public BeneficiaryReconciliationController(BeneficiaryReconciliationService service){this.service=service;}
    @GetMapping("/beneficiary-confirmations")
    public List<BeneficiaryConfirmationResponse> list(@PathVariable UUID caseId,@PathVariable UUID sessionId,
            @AuthenticationPrincipal CustomUserPrincipal actor){return service.list(caseId,sessionId,actor);}
    @PostMapping("/beneficiaries/{beneficiaryId}/confirmation")
    public BeneficiaryConfirmationResponse confirm(@PathVariable UUID caseId,@PathVariable UUID sessionId,
            @PathVariable UUID beneficiaryId,@Valid @RequestBody ConfirmBeneficiaryRequest request,
            @AuthenticationPrincipal CustomUserPrincipal actor){return service.confirm(caseId,sessionId,beneficiaryId,request,actor);}
}
