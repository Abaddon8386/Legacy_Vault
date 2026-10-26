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
    private final com.legacyvault.verification.service.SignedReceiptService receipts;
    public BeneficiaryReconciliationController(BeneficiaryReconciliationService service,com.legacyvault.verification.service.SignedReceiptService receipts){this.service=service;this.receipts=receipts;}
    @GetMapping("/beneficiary-confirmations")
    public List<BeneficiaryConfirmationResponse> list(@PathVariable UUID caseId,@PathVariable UUID sessionId,
            @AuthenticationPrincipal CustomUserPrincipal actor){return service.list(caseId,sessionId,actor);}
    @PostMapping(value="/beneficiaries/{beneficiaryId}/confirmation",consumes="multipart/form-data")
    public BeneficiaryConfirmationResponse confirm(@PathVariable UUID caseId,@PathVariable UUID sessionId,
            @PathVariable UUID beneficiaryId,@RequestPart("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam boolean attested,@RequestParam(required=false) String paperReference,
            @AuthenticationPrincipal CustomUserPrincipal actor){return receipts.confirm(caseId,sessionId,beneficiaryId,file,attested,paperReference,actor);}
    @GetMapping("/beneficiary-confirmations/{confirmationId}/file")
    public org.springframework.http.ResponseEntity<byte[]> file(@PathVariable UUID caseId,@PathVariable UUID sessionId,
      @PathVariable UUID confirmationId,@AuthenticationPrincipal CustomUserPrincipal actor){return IntakeFileResponses.of(receipts.read(caseId,sessionId,confirmationId,actor));}
}
