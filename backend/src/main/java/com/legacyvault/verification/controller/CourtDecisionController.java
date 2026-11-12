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

/**
 * Ghi nhận và xem lịch sử quyết định của tòa án (court decision) gắn với hồ sơ căn cứ pháp lý.
 * Phạm vi: {@code /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/court-decisions}.
 * Quyền: {@code ROLE_LEGAL_VERIFIER}. Ủy quyền cho {@link CourtDecisionService}.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/court-decisions")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class CourtDecisionController {
    private final CourtDecisionService service;
    public CourtDecisionController(CourtDecisionService service) { this.service = service; }

    /**
     * {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/court-decisions}
     * Ghi nhận một quyết định tòa án mới. Body: {@link CourtDecisionRequest}. Trả 201 Created kèm
     * {@link CourtDecisionResponse}.
     *
     * @param caseId    mã công khai của ca xác minh
     * @param request   nội dung quyết định (đã validate)
     * @param principal Legal đang đăng nhập
     * @return 201 và bản ghi quyết định vừa tạo
     */
    @PostMapping
    public ResponseEntity<CourtDecisionResponse> record(@PathVariable UUID caseId,
            @Valid @RequestBody CourtDecisionRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
        var response = service.record(caseId, principal, request);
        return ResponseEntity.created(URI.create("/api/v1/legal-verifications/verification-cases/" + caseId
                + "/basis-dossier/court-decisions")).body(response);
    }

    /**
     * {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/court-decisions}
     * Lịch sử các quyết định tòa án của ca, trả về danh sách {@link CourtDecisionResponse}.
     */
    @GetMapping
    public List<CourtDecisionResponse> history(@PathVariable UUID caseId) { return service.history(caseId); }
}
