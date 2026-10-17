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
import com.legacyvault.verification.dto.OriginalWillIntakeResponse;
import com.legacyvault.verification.dto.RecordOriginalWillRequest;
import com.legacyvault.verification.entity.OriginalWillIntake;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.OriginalWillIntakeRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * PS-39 (ST-13, LV-WILL-001): Staff ghi nhận đã nhận bản di chúc giấy gốc cho một ca xác minh.
 *
 * <p>Chỉ là ghi nhận việc nộp: không xác nhận di chúc hợp lệ, không so với bản scan (đối chiếu là việc của Legal),
 * không đổi trạng thái Vault hay ca. Người ghi nhận phải là Staff đã nhận ca; ca chưa nhận hoặc của Staff khác là 404.
 *
 * <p>TODO(open-question): (1) tiến độ hồ sơ {@code WILL_AND_IDS_SUBMITTED} chưa có cột chứa; (2) chưa chặn ghi nhận
 * trước khi Legal duyệt giấy tờ khai tử (ST-12), vì tài liệu chưa nói rõ ST-13 có phải đợi ST-12 hay không.
 */
@Service
public class OriginalWillIntakeService {

    static final String ENTITY_TYPE = "ORIGINAL_WILL_INTAKE";
    static final String STEP_ID = "ST-13";
    static final String RULE_ID = "LV-WILL-001";

    private final StaffCaseLockRepository caseRepository;
    private final OriginalWillIntakeRepository intakeRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    public OriginalWillIntakeService(
            StaffCaseLockRepository caseRepository,
            OriginalWillIntakeRepository intakeRepository,
            UserRepository userRepository,
            AuditService auditService
    ) {
        this.caseRepository = caseRepository;
        this.intakeRepository = intakeRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
    }

    @Transactional
    public OriginalWillIntakeResponse record(
            UUID caseId,
            CustomUserPrincipal principal,
            RecordOriginalWillRequest request
    ) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        VerificationCase verificationCase = caseRepository.findOwnedByStaffForUpdate(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!verificationCase.isOpen()) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
        }

        OriginalWillIntake saved = intakeRepository.saveAndFlush(new OriginalWillIntake(
                verificationCase.getVerificationCaseId(),
                request.deliveredByName().trim(),
                normalize(request.deliveredByRelationship()),
                staffUserId,
                normalize(request.evidenceReference()),
                normalize(request.conditionNotes())
        ));

        // Audit không ghi tên người giao hay ghi chú tình trạng: chỉ các ID công khai.
        auditService.record(new AuditEvent(
                AuditAction.ORIGINAL_WILL_RECEIVED,
                AuditActorType.USER,
                staffUserId,
                verificationCase.getVaultId(),
                ENTITY_TYPE,
                saved.getOriginalWillIntakeId(),
                null,
                null,
                null,
                Map.of(
                        "verificationCaseId", verificationCase.getPublicId().toString(),
                        "intakeId", saved.getPublicId().toString()
                ),
                STEP_ID,
                RULE_ID
        ));

        return OriginalWillIntakeResponse.from(saved, verificationCase.getPublicId(), principal.publicId());
    }

    @Transactional(readOnly = true)
    public List<OriginalWillIntakeResponse> list(UUID caseId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);
        VerificationCase verificationCase = requireOwnedCase(caseId, staffUserId);

        List<OriginalWillIntake> intakes = intakeRepository
                .findByVerificationCaseIdOrderByReceivedAtDescOriginalWillIntakeIdDesc(
                        verificationCase.getVerificationCaseId());
        Map<Long, UUID> receivers = publicIdsOf(intakes);

        return intakes.stream()
                .map(intake -> OriginalWillIntakeResponse.from(
                        intake, verificationCase.getPublicId(), receivers.get(intake.getReceivedByUserId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public OriginalWillIntakeResponse get(UUID caseId, UUID intakeId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);
        VerificationCase verificationCase = requireOwnedCase(caseId, staffUserId);

        OriginalWillIntake intake = intakeRepository
                .findByPublicIdAndVerificationCaseId(intakeId, verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        return OriginalWillIntakeResponse.from(
                intake, verificationCase.getPublicId(), publicIdsOf(List.of(intake)).get(intake.getReceivedByUserId()));
    }

    private VerificationCase requireOwnedCase(UUID caseId, Long staffUserId) {
        return caseRepository.findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    private Map<Long, UUID> publicIdsOf(List<OriginalWillIntake> intakes) {
        List<Long> userIds = intakes.stream().map(OriginalWillIntake::getReceivedByUserId).distinct().toList();
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
