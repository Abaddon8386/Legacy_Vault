
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

    public StaffVerificationCaseService(
            VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository,
            UserRepository userRepository,
            AuditService auditService
    ) {
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public PageResponse<StaffVerificationCaseResponse> listCases(
            CustomUserPrincipal principal,
            String status,
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
                && !VerificationCase.STATUS_CANCELLED.equals(status)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "triggeredAt"));

        Page<VerificationCase> cases = caseRepository.findQueueByStaff(staffUserId, status, pageable);

        return PageResponse.from(cases, this::toResponse);
    }

    @Transactional(readOnly = true)
    public StaffVerificationCaseResponse getCase(UUID caseId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        VerificationCase verificationCase =
                caseRepository.findViewableCaseByPublicId(caseId, staffUserId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        return toResponse(verificationCase);
    }

    private StaffVerificationCaseResponse toResponse(VerificationCase verificationCase) {
        Vault vault = vaultRepository.findById(verificationCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        User owner = userRepository.findById(vault.getOwnerUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        return new StaffVerificationCaseResponse(
                verificationCase.getPublicId(),
                verificationCase.getStatus(),
                verificationCase.getTriggeredAt(),
                verificationCase.getClosedAt(),
                vault.getPublicId(),
                vault.getName(),
                owner.getPublicId(),
                owner.getFullName()
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

        return toResponse(verificationCase);
    }
}
