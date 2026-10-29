package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.dto.DeathDocumentRecordResponse;
import com.legacyvault.verification.dto.RecordDeathDocumentRequest;
import com.legacyvault.verification.entity.DeathDocumentRecord;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.DeathDocumentRecordRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * PS-38 (ST-11, LV-DEATH-002): Staff ghi nhận metadata giấy tờ khai tử vật lý đã nhận cho một ca xác minh.
 *
 * <p>Chỉ là ghi nhận việc tiếp nhận: không duyệt giấy tờ (ST-12 thuộc Legal), không đổi trạng thái Vault, không
 * đóng ca. Người ghi nhận phải là Staff đã nhận ca; ca chưa nhận hoặc của Staff khác là 404 (không lộ sự tồn tại).
 *
 * <p>TODO(open-question): tiến độ hồ sơ {@code DEATH_DOCS_COLLECTED} chưa có cột chứa (verification_cases.status chỉ
 * có OPEN/CANCELLED), nên service này chưa ghi tiến độ. Chờ nhóm chốt cột/bảng giữ trạng thái hồ sơ.
 */
@Service
public class DeathDocumentIntakeService {

    static final String ENTITY_TYPE = "DEATH_DOCUMENT_RECORD";
    static final String STEP_ID = "ST-11";
    static final String RULE_ID = "LV-DEATH-002";

    private final StaffCaseLockRepository caseRepository;
    private final DeathDocumentRecordRepository recordRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final LegalBasisLockedState state;
    private final com.legacyvault.notification.WorkflowNotificationService notifications;

    public DeathDocumentIntakeService(
            StaffCaseLockRepository caseRepository,
            DeathDocumentRecordRepository recordRepository,
            UserRepository userRepository,
            AuditService auditService,
            LegalBasisLockedState state, com.legacyvault.notification.WorkflowNotificationService notifications) {
        this.caseRepository = caseRepository;
        this.recordRepository = recordRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.state = state; this.notifications = notifications;
    }

    @Transactional
    public DeathDocumentRecordResponse record(
            UUID caseId,
            CustomUserPrincipal principal,
            RecordDeathDocumentRequest request
    ) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        VerificationCase verificationCase = caseRepository.findOwnedByStaffForUpdate(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        state.refresh(verificationCase);
        if (!verificationCase.isOpen()) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
        }

        DeathDocumentRecord saved = recordRepository.saveAndFlush(new DeathDocumentRecord(
                verificationCase.getVerificationCaseId(),
                request.documentType(),
                request.issuingAuthority().trim(),
                request.documentNumber().trim(),
                request.issuedDate(),
                staffUserId,
                normalize(request.evidenceReference()),
                normalize(request.notes())
        ));

        // Audit không ghi số giấy tờ, cơ quan cấp hay ghi chú: chỉ loại giấy tờ và các ID công khai.
        auditService.record(new AuditEvent(
                AuditAction.DEATH_DOCUMENT_RECORDED,
                AuditActorType.USER,
                staffUserId,
                verificationCase.getVaultId(),
                ENTITY_TYPE,
                saved.getDeathDocumentRecordId(),
                null,
                null,
                null,
                Map.of(
                        "documentType", saved.getDocumentType(),
                        "verificationCaseId", verificationCase.getPublicId().toString(),
                        "recordId", saved.getPublicId().toString()
                ),
                STEP_ID,
                RULE_ID
        ));

        notifications.record(verificationCase, com.legacyvault.notification.WorkflowNotificationService.Workspace.LEGAL, "DEATH_DOCUMENT_RECORDED", "DEATH_DOCUMENT_RECORDED:" + saved.getPublicId(), null);
        return DeathDocumentRecordResponse.from(saved, verificationCase.getPublicId(), principal.publicId());
    }

    @Transactional(readOnly = true)
    public List<DeathDocumentRecordResponse> list(UUID caseId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);
        VerificationCase verificationCase = requireOwnedCase(caseId, staffUserId);

        List<DeathDocumentRecord> records = recordRepository
                .findByVerificationCaseIdOrderByReceivedAtDescDeathDocumentRecordIdDesc(
                        verificationCase.getVerificationCaseId());
        Map<Long, UUID> receivers = publicIdsOf(records);

        return records.stream()
                .map(record -> DeathDocumentRecordResponse.from(
                        record, verificationCase.getPublicId(), receivers.get(record.getReceivedByUserId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public DeathDocumentRecordResponse get(UUID caseId, UUID recordId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);
        VerificationCase verificationCase = requireOwnedCase(caseId, staffUserId);

        DeathDocumentRecord record = recordRepository
                .findByPublicIdAndVerificationCaseId(recordId, verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        return DeathDocumentRecordResponse.from(
                record, verificationCase.getPublicId(), publicIdsOf(List.of(record)).get(record.getReceivedByUserId()));
    }

    private VerificationCase requireOwnedCase(UUID caseId, Long staffUserId) {
        return caseRepository.findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    private Map<Long, UUID> publicIdsOf(List<DeathDocumentRecord> records) {
        List<Long> userIds = records.stream().map(DeathDocumentRecord::getReceivedByUserId).distinct().toList();
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getUserId, User::getPublicId, (a, b) -> a));
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
