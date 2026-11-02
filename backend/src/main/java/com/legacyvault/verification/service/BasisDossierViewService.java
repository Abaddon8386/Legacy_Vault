package com.legacyvault.verification.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.dto.AllocationResponse;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.BasisVersionResponse;
import com.legacyvault.verification.dto.CurrentBasisDecision;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.BasisVersionRow;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Đọc hồ sơ căn cứ của một ca. Legal xem được mọi ca; Staff chỉ xem ca mình đã nhận (ca khác là 404). Không có nội dung file.
 */
@Service
public class BasisDossierViewService {

    private final LegalCaseLookupRepository caseLookup;
    private final StaffCaseLockRepository staffCases;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final UserRepository users;
    private final ObjectMapper objectMapper;
    private final LegalBasisReviewHistoryRepository history;
    private final com.legacyvault.verification.repository.DistributionWorkflowEventRepository workflowEvents;
    private final com.legacyvault.verification.repository.CourtDecisionRepository courtDecisions;

    public BasisDossierViewService(LegalCaseLookupRepository caseLookup, StaffCaseLockRepository staffCases,
            LegalBasisDossierRepository dossiers, LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations, UserRepository users, ObjectMapper objectMapper,
            LegalBasisReviewHistoryRepository history,
            com.legacyvault.verification.repository.DistributionWorkflowEventRepository workflowEvents,
            com.legacyvault.verification.repository.CourtDecisionRepository courtDecisions) {
        this.caseLookup = caseLookup;
        this.staffCases = staffCases;
        this.dossiers = dossiers;
        this.versions = versions;
        this.allocations = allocations;
        this.users = users;
        this.objectMapper = objectMapper;
        this.history = history;
        this.workflowEvents = workflowEvents;
        this.courtDecisions = courtDecisions;
    }

    @Transactional(readOnly = true)
    public BasisDossierResponse forLegal(UUID caseId) {
        VerificationCase verificationCase = caseLookup.findByPublicId(caseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return view(verificationCase, true);
    }

    @Transactional(readOnly = true)
    public BasisDossierResponse forStaff(UUID caseId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);
        VerificationCase verificationCase = staffCases.findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return view(verificationCase, false);
    }

    /** Dựng response từ hồ sơ và danh sách phiên bản đã có (dùng sau khi ghi để trả trạng thái mới). */
    @Transactional(readOnly = true)
    public BasisDossierResponse view(VerificationCase verificationCase, boolean includeReason) {
        LegalBasisDossier dossier = dossiers.findByVerificationCaseId(verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        List<BasisVersionRow> rows = versions.findRows(dossier.getLegalBasisDossierId());

        Set<Long> userIds = new HashSet<>();
        userIds.add(dossier.getClassifiedByUserId());
        rows.forEach(r -> userIds.add(r.createdByUserId()));
        userIds.remove(null); // Historical dossiers may not have a classified-by reference.
        Map<Long, UUID> publicIds = users.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getUserId, User::getPublicId, (a, b) -> a));

        // rows đã sắp mới nhất trước: phần tử đầu là phiên bản hiện hành, các bản còn lại là bản cũ (vẫn giữ làm chứng cứ).
        int currentVersion = rows.isEmpty() ? 0 : rows.get(0).versionNo();
        var allocationRows = allocations.findRowsByDossier(dossier.getLegalBasisDossierId());
        Map<Integer, List<AllocationResponse>> scopeByVersion = allocationRows.stream()
                .collect(Collectors.groupingBy(AllocationRow::versionNo, Collectors.mapping(
                        a -> new AllocationResponse(a.assetId(), a.beneficiaryId(), a.description(), a.assetName(),
                                a.assetType() == null ? null : a.assetType().name(), a.recipientName(),
                                a.recipientRelationship(), a.recipientSource(), a.sourceVersionNo(),
                                a.accountLinked()),
                        Collectors.toList())));

        var legalEvents = history.findByDossierIdOrderByReviewedAtDesc(dossier.getLegalBasisDossierId());
        var distributionEvents = workflowEvents.findByVerificationCaseIdOrderByEventNoAsc(verificationCase.getVerificationCaseId());
        var courtEvents = courtDecisions.findRows(verificationCase.getVerificationCaseId());
        List<BasisVersionResponse> items = rows.stream()
                .map(r -> BasisVersionResponse.from(r, publicIds.get(r.createdByUserId()),
                        evidenceReferenceOf(r.evidenceMetadata()), r.versionNo() == currentVersion,
                        scopeByVersion.getOrDefault(r.versionNo(), List.of()))
                        .withLegalHistory(legalHistory(r, currentVersion, dossier, allocationRows, legalEvents, distributionEvents, courtEvents)))
                .toList();
        CurrentBasisDecision decision = currentDecision(dossier, rows);
        return new BasisDossierResponse(dossier.getPublicId(), verificationCase.getPublicId(), dossier.getRoute(),
                dossier.getStatus(), dossier.getDisputeStatus(), includeReason ? dossier.getRouteReason() : null,
                publicIds.get(dossier.getClassifiedByUserId()),
                dossier.getCreatedAt().toInstant(ZoneOffset.UTC), dossier.getUpdatedAt().toInstant(ZoneOffset.UTC),
                items, dossier.getRequiredVersionNo(), null, decision);
    }

    private List<BasisVersionResponse.LegalHistory> legalHistory(BasisVersionRow version, int currentVersion,
            LegalBasisDossier dossier, List<AllocationRow> allocationRows,
            List<com.legacyvault.verification.entity.LegalBasisReviewHistory> reviews,
            List<com.legacyvault.verification.entity.DistributionWorkflowEvent> events,
            List<com.legacyvault.verification.repository.CourtDecisionRow> court) {
        var result = new java.util.ArrayList<BasisVersionResponse.LegalHistory>();
        String allocationHash = AllocationScopeHash.hashApprovalRows(allocationRows.stream().filter(r -> r.versionNo() == version.versionNo()).toList());
        boolean currentDocument = version.versionNo() == currentVersion && version.versionNo() >= dossier.getRequiredVersionNo()
                && !LegalBasisDossier.ROUTE_ON_HOLD.equals(dossier.getRoute());
        for (var review : reviews) {
            // Automatic stale markers are system prerequisites, not decisions made by Legal.
            if (review.getReviewedByUserId() == null) continue;
            if (!java.util.Objects.equals(review.getVersionNo(), version.versionNo()) || !sameHash(review.getSha256Hash(), version.sha256Hash())) continue;
            if (!Set.of("LEGAL_APPROVED", "LEGAL_REJECTED", "FRESH", "REVIEW_REQUIRED").contains(review.getReviewStatus())) continue;
            result.add(new BasisVersionResponse.LegalHistory(review.getPublicId(), review.getReviewStatus(), review.getReason(),
                    review.getReviewedAt().toInstant(ZoneOffset.UTC), currentDocument && sameHash(review.getAllocationHash(), allocationHash)
                    && java.util.Objects.equals(review.getDisputeStatus(), dossier.getDisputeStatus())));
        }
        for (var event : events) {
            if (!java.util.Objects.equals(event.getDocumentVersion(), version.versionNo()) || !sameHash(event.getDocumentSha256(), version.sha256Hash())) continue;
            if (!Set.of("APPROVE_DOCUMENTS", "REQUEST_DOCUMENT_SUPPLEMENTATION", "APPROVE_ALLOCATIONS", "REQUEST_ALLOCATION_CHANGES").contains(event.getAction())) continue;
            result.add(new BasisVersionResponse.LegalHistory(event.getPublicId(), event.getAction(), event.getReason(),
                    event.getCreatedAt().toInstant(ZoneOffset.UTC), currentDocument && (event.getAllocationSha256() == null || sameHash(event.getAllocationSha256(), allocationHash))));
        }
        for (var entry : court) {
            if (entry.version() != version.versionNo() || !sameHash(entry.sha256(), version.sha256Hash())) continue;
            result.add(new BasisVersionResponse.LegalHistory(entry.id(), "COURT_" + entry.result(), entry.reason(),
                    entry.reviewedAt().toInstant(ZoneOffset.UTC), currentDocument));
        }
        result.sort(java.util.Comparator.comparing(BasisVersionResponse.LegalHistory::decidedAt).reversed()
                .thenComparing(entry -> entry.id().toString()));
        return List.copyOf(result);
    }

    private static boolean sameHash(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
    }

    private CurrentBasisDecision currentDecision(LegalBasisDossier dossier, List<BasisVersionRow> rows) {
        if (rows.isEmpty() || !LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())) return null;
        BasisVersionRow latest = rows.get(0);
        if (!"FORWARDED".equals(latest.forwardStatus()) || latest.versionNo() < dossier.getRequiredVersionNo()) return null;
        var decision = history.findFirstByDossierIdAndReviewStatusInOrderByIdDesc(
                dossier.getLegalBasisDossierId(), List.of("LEGAL_APPROVED", "LEGAL_REJECTED")).orElse(null);
        if (decision == null || !java.util.Objects.equals(decision.getVersionNo(), latest.versionNo())
                || !latest.sha256Hash().equalsIgnoreCase(decision.getSha256Hash())
                || !java.util.Objects.equals(decision.getDisputeStatus(), dossier.getDisputeStatus())) return null;
        String allocationHash = AllocationScopeHash.hashApprovalRows(allocations.findRowsByDossier(dossier.getLegalBasisDossierId())
                .stream().filter(row -> row.versionNo() == latest.versionNo()).toList());
        if (!allocationHash.equalsIgnoreCase(decision.getAllocationHash())) return null;
        return new CurrentBasisDecision(decision.getPublicId(), decision.getReviewStatus(), decision.getReason(),
                latest.versionNo(), latest.sha256Hash(), allocationHash);
    }

    private String evidenceReferenceOf(String evidenceMetadata) {
        if (evidenceMetadata == null) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(evidenceMetadata);
            JsonNode value = node == null ? null : node.get("evidenceReference");
            return value == null || value.isNull() ? null : value.asText();
        } catch (JsonProcessingException ex) {
            return null;
        }
    }
}
