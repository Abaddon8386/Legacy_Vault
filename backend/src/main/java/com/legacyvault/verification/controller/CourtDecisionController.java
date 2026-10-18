package com.legacyvault.verification.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.service.CourtDecisionService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/court-decisions")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class CourtDecisionController {
    private final CourtDecisionService service;
    public CourtDecisionController(CourtDecisionService service) { this.service = service; }

    @PostMapping
    public ResponseEntity<CourtDecisionResponse> record(@PathVariable UUID caseId,
            @Valid @RequestBody CourtDecisionRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
        var response = service.record(caseId, principal, request);
        return ResponseEntity.created(URI.create("/api/v1/legal-verifications/verification-cases/" + caseId
                + "/basis-dossier/court-decisions")).body(response);
    }

    @GetMapping
    public List<CourtDecisionResponse> history(@PathVariable UUID caseId) { return service.history(caseId); }
}
