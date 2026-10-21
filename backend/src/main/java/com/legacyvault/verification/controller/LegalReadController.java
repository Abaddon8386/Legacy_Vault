package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.verification.dto.LegalReadDtos.*;
import com.legacyvault.verification.service.LegalReadService;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalReadController {
    private final LegalReadService reads;
    public LegalReadController(LegalReadService reads) { this.reads=reads; }
    @GetMapping
    public ResponseEntity<PageResponse<QueueItem>> queue(@AuthenticationPrincipal CustomUserPrincipal principal,
        @RequestParam(required=false) String status,@RequestParam(required=false) String route,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reads.queue(principal,status,route,page,size));
    }
    @GetMapping("/{caseId}/context")
    public ResponseEntity<Context> context(@AuthenticationPrincipal CustomUserPrincipal principal,@PathVariable UUID caseId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(reads.context(principal,caseId));
    }
}
