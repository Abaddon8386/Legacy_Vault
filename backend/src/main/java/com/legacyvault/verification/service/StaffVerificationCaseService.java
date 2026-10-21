
package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.trustee.TrusteeRepository;
import com.legacyvault.verification.dto.StaffVerificationCaseResponse;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class StaffVerificationCaseService {
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final TrusteeRepository trusteeRepository;

    public StaffVerificationCaseService(
            VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository,
            UserRepository userRepository,
            AuditService auditService,
            TrusteeRepository trusteeRepository
    ) {
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.trusteeRepository = trusteeRepository;
    }

    private static final int MAX_SEARCH_LENGTH = 100;
    private static final java.util.regex.Pattern CASE_REFERENCE =
            java.util.regex.Pattern.compile("^HS-(\\d{4})-(\\d{1,9})$", java.util.regex.Pattern.CASE_INSENSITIVE);

    public PageResponse<StaffVerificationCaseResponse> listCases(
            CustomUserPrincipal principal,
            String status,
            int page,
            int size
    ) {
        return listCases(principal, status, null, page, size);
    }

    /** PS-88 (ST-09/ST-10): search the Staff queue by case reference, Vault/owner/Beneficiary name or public UUID. */
    @Transactional(readOnly = true)
    public PageResponse<StaffVerificationCaseResponse> listCases(
            CustomUserPrincipal principal,
            String status,
            String query,
            int page,
            int size
    ) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        if (status != null && !status.isBlank()) {
            status = status.trim().toUpperCase(Locale.ROOT);
        } else {
            status = null;
        }

        if (status != null
                && !VerificationCase.STATUS_OPEN.equals(status)
                && !VerificationCase.STATUS_CANCELLED.equals(status)
                && !VerificationCase.STATUS_CLOSED.equals(status)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "triggeredAt"));

        String term = normalizeQuery(query);
        Page<VerificationCase> cases = term == null
                ? caseRepository.findQueueByStaff(staffUserId, status, pageable)
                : search(staffUserId, status, term, pageable);

        return PageResponse.from(cases, item -> toResponse(item, false));
    }

    private Page<VerificationCase> search(Long staffUserId, String status, String term, PageRequest pageable) {
        UUID publicId = new UUID(0L, 0L);
        try {
            publicId = UUID.fromString(term);
        } catch (IllegalArgumentException ignored) {
            // not a UUID: name / case reference search only
        }
        long caseId = -1L;
        int year = -1;
        var reference = CASE_REFERENCE.matcher(term);
        if (reference.matches()) {
            year = Integer.parseInt(reference.group(1));
            caseId = Long.parseLong(reference.group(2));
        }
        String pattern = "%" + term.toLowerCase(Locale.ROOT)
                .replace("!", "!!").replace("%", "!%").replace("_", "!_").replace("[", "![") + "%";
        return caseRepository.searchQueueByStaff(staffUserId, status, pattern, publicId, caseId, year, pageable);
    }

    private static String normalizeQuery(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        String term = query.trim();
        if (term.length() > MAX_SEARCH_LENGTH || term.codePoints().anyMatch(Character::isISOControl)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        return term;
    }

    @Transactional(readOnly = true)
    public StaffVerificationCaseResponse getCase(UUID caseId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        VerificationCase verificationCase =
                caseRepository.findViewableCaseByPublicId(caseId, staffUserId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        return toResponse(verificationCase, true);
    }

    private StaffVerificationCaseResponse toResponse(
            VerificationCase verificationCase, boolean includeTrustee) {
        Vault vault = vaultRepository.findById(verificationCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        User owner = userRepository.findById(vault.getOwnerUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        var trustee = includeTrustee
                ? trusteeRepository.findFirstByVault_VaultIdAndStatus(
                        vault.getVaultId(), "APPOINTED").orElse(null)
                : null;

        return new StaffVerificationCaseResponse(
                verificationCase.getPublicId(),
                verificationCase.getCaseNumber(),
                verificationCase.getStatus(),
                verificationCase.getTriggeredAt(),
                verificationCase.getClosedAt(),
                vault.getPublicId(),
                vault.getStatus(),
                vault.getName(),
                owner.getPublicId(),
                owner.getFullName(),
                verificationCase.getAssignedStaffUserId() == null
                        ? "UNASSIGNED_CLAIMABLE" : "ASSIGNED_TO_CURRENT_STAFF",
                trustee == null ? null : new StaffVerificationCaseResponse.TrusteeSummary(
                        trustee.getPublicId(), trustee.getFullName(), trustee.getPhone(), trustee.getEmail(),
                        trustee.getRelationship())
        );
    }

    @Transactional
    public StaffVerificationCaseResponse claimCase(
            UUID caseId,
            CustomUserPrincipal principal
    ) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        int updated = caseRepository.claimUnassignedCase(caseId, staffUserId);

        if (updated != 1) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_CLAIMABLE);
        }

        VerificationCase verificationCase =
                caseRepository.findByPublicIdAndAssignedStaffUserId(caseId, staffUserId)
                        .orElseThrow(() ->
                                new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        auditService.record(new AuditEvent(
                AuditAction.VERIFICATION_CASE_CLAIMED,
                AuditActorType.USER,
                staffUserId,
                verificationCase.getVaultId(),
                "VERIFICATION_CASE",
                verificationCase.getVerificationCaseId(),
                "{\"status\":\"OPEN\",\"assignedStaffUserId\":null}",
                "{\"status\":\"OPEN\",\"assignedStaffUserId\":" + staffUserId + "}",
                null,
                Map.of("casePublicId", caseId.toString()),
                "ST-09",
                null
        ));

        return toResponse(verificationCase, true);
    }
}
