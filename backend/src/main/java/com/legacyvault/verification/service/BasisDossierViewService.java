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
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.BasisVersionRow;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
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

    public BasisDossierViewService(LegalCaseLookupRepository caseLookup, StaffCaseLockRepository staffCases,
            LegalBasisDossierRepository dossiers, LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations, UserRepository users, ObjectMapper objectMapper) {
        this.caseLookup = caseLookup;
        this.staffCases = staffCases;
        this.dossiers = dossiers;
        this.versions = versions;
        this.allocations = allocations;
        this.users = users;
        this.objectMapper = objectMapper;
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
        Map<Long, UUID> publicIds = users.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getUserId, User::getPublicId, (a, b) -> a));

        // rows đã sắp mới nhất trước: phần tử đầu là phiên bản hiện hành, các bản còn lại là bản cũ (vẫn giữ làm chứng cứ).
        int currentVersion = rows.isEmpty() ? 0 : rows.get(0).versionNo();
        Map<Integer, List<AllocationResponse>> scopeByVersion = allocations
                .findRowsByDossier(dossier.getLegalBasisDossierId()).stream()
                .collect(Collectors.groupingBy(AllocationRow::versionNo, Collectors.mapping(
                        a -> new AllocationResponse(a.assetId(), a.beneficiaryId(), a.description()),
                        Collectors.toList())));

        List<BasisVersionResponse> items = rows.stream()
                .map(r -> BasisVersionResponse.from(r, publicIds.get(r.createdByUserId()),
                        evidenceReferenceOf(r.evidenceMetadata()), r.versionNo() == currentVersion,
                        scopeByVersion.getOrDefault(r.versionNo(), List.of())))
                .toList();
        return new BasisDossierResponse(dossier.getPublicId(), verificationCase.getPublicId(), dossier.getRoute(),
                dossier.getStatus(), dossier.getDisputeStatus(), includeReason ? dossier.getRouteReason() : null,
                publicIds.get(dossier.getClassifiedByUserId()),
                dossier.getCreatedAt().toInstant(ZoneOffset.UTC), dossier.getUpdatedAt().toInstant(ZoneOffset.UTC),
                items);
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
