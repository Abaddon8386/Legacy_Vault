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
 * <p>Được {@code StaffOriginalWillController} gọi, base path
 * {@code /api/v1/staff/verification-cases/{caseId}/original-will-intakes} (vai trò STAFF_EXECUTOR):
 * {@code POST} (ghi nhận, body {@link RecordOriginalWillRequest}), {@code GET} (danh sách) và {@code GET /{intakeId}}
 * (chi tiết), trả {@link OriginalWillIntakeResponse}. Bảng: {@code original_will_intakes}, {@code verification_cases},
 * {@code users}; kết quả đối chiếu lấy từ {@code will_comparisons}. Ghi audit {@code ORIGINAL_WILL_RECEIVED} và gửi
 * thông báo cho Legal.
 *
 * <p>TODO(open-question): (1) tiến độ hồ sơ {@code WILL_AND_IDS_SUBMITTED} chưa có cột chứa; (2) chưa chặn ghi nhận
 * trước khi Legal duyệt giấy tờ khai tử (ST-12), vì tài liệu chưa nói rõ ST-13 có phải đợi ST-12 hay không.
 */
@Service
public class OriginalWillIntakeService {

    /**
     * Loại thực thể ghi trong audit.
     */
    static final String ENTITY_TYPE = "ORIGINAL_WILL_INTAKE";
    /**
     * Mã bước quy trình ghi vào audit.
     */
    static final String STEP_ID = "ST-13";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
    static final String RULE_ID = "LV-WILL-001";

    private final StaffCaseLockRepository caseRepository;
    private final OriginalWillIntakeRepository intakeRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final LegalBasisLockedState state;
    private final com.legacyvault.notification.WorkflowNotificationService notifications;
    private final com.legacyvault.verification.repository.WillComparisonRepository comparisons;

    /**
     * @param caseRepository truy vấn case theo Staff được giao (có khóa ghi)
     * @param intakeRepository repository bản ghi nhận di chúc gốc
     * @param userRepository repository người dùng (đổi id nội bộ sang public id)
     * @param auditService dịch vụ ghi nhật ký kiểm toán
     * @param state tiện ích refresh entity sau khi khóa
     * @param notifications dịch vụ thông báo workflow
     * @param comparisons repository kết quả đối chiếu di chúc
     */
    public OriginalWillIntakeService(
            StaffCaseLockRepository caseRepository,
            OriginalWillIntakeRepository intakeRepository,
            UserRepository userRepository,
            AuditService auditService,
            LegalBasisLockedState state, com.legacyvault.notification.WorkflowNotificationService notifications,
            com.legacyvault.verification.repository.WillComparisonRepository comparisons) {
        this.caseRepository = caseRepository;
        this.intakeRepository = intakeRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.state = state; this.notifications = notifications;
        this.comparisons = comparisons;
    }

    /**
     * Ghi nhận Staff đã nhận bản di chúc giấy gốc.
     * API: {@code POST /api/v1/staff/verification-cases/{caseId}/original-will-intakes}.
     *
     * <p>Khóa case của Staff (FOR UPDATE), refresh trạng thái, yêu cầu case còn mở, lưu bản ghi (tên người giao được trim,
     * các trường tùy chọn rỗng thành null), ghi audit {@code ORIGINAL_WILL_RECEIVED} (chỉ chứa id công khai, không có tên
     * người giao hay ghi chú tình trạng) và gửi thông báo cho Legal.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param principal Staff đang đăng nhập
     * @param request thông tin người giao, quan hệ, tham chiếu bằng chứng, ghi chú tình trạng
     * @return bản ghi nhận vừa lưu kèm thông báo
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu case chưa nhận hoặc của Staff khác;
     *         {@code VERIFICATION_CASE_NOT_OPEN} nếu case đã đóng
     */
    @Transactional
    public OriginalWillIntakeResponse record(
            UUID caseId,
            CustomUserPrincipal principal,
            RecordOriginalWillRequest request
    ) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        VerificationCase verificationCase = caseRepository.findOwnedByStaffForUpdate(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        state.refresh(verificationCase);
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

        var notification = notifications.record(verificationCase, com.legacyvault.notification.WorkflowNotificationService.Workspace.LEGAL, "ORIGINAL_WILL_RECEIVED", "ORIGINAL_WILL_RECEIVED:" + saved.getPublicId(), null);
        return OriginalWillIntakeResponse.from(saved, verificationCase.getPublicId(), principal.publicId()).withNotification(notification);
    }

    /**
     * Liệt kê các lần nhận di chúc gốc của ca (mới nhất trước), kèm kết quả đối chiếu của Legal nếu có.
     * API: {@code GET /api/v1/staff/verification-cases/{caseId}/original-will-intakes}. Chỉ đọc.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param principal Staff đang đăng nhập
     * @return danh sách bản ghi nhận
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}
     */
    @Transactional(readOnly = true)
    public List<OriginalWillIntakeResponse> list(UUID caseId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);
        VerificationCase verificationCase = requireOwnedCase(caseId, staffUserId);

        List<OriginalWillIntake> intakes = intakeRepository
                .findByVerificationCaseIdOrderByReceivedAtDescOriginalWillIntakeIdDesc(
                        verificationCase.getVerificationCaseId());
        Map<Long, UUID> receivers = publicIdsOf(intakes);
        var outcomes = comparisonsOf(verificationCase);

        return intakes.stream()
                .map(intake -> OriginalWillIntakeResponse.from(
                        intake, verificationCase.getPublicId(), receivers.get(intake.getReceivedByUserId()))
                        .withComparison(outcomes.get(intake.getPublicId())))
                .toList();
    }

    /**
     * Xem một lần nhận di chúc gốc kèm kết quả đối chiếu.
     * API: {@code GET /api/v1/staff/verification-cases/{caseId}/original-will-intakes/{intakeId}}. Chỉ đọc.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param intakeId public id của bản ghi nhận
     * @param principal Staff đang đăng nhập
     * @return bản ghi nhận
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}
     */
    @Transactional(readOnly = true)
    public OriginalWillIntakeResponse get(UUID caseId, UUID intakeId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);
        VerificationCase verificationCase = requireOwnedCase(caseId, staffUserId);

        OriginalWillIntake intake = intakeRepository
                .findByPublicIdAndVerificationCaseId(intakeId, verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        return OriginalWillIntakeResponse.from(
                intake, verificationCase.getPublicId(), publicIdsOf(List.of(intake)).get(intake.getReceivedByUserId()))
                .withComparison(comparisonsOf(verificationCase).get(intake.getPublicId()));
    }

    /**
     * Lấy kết luận đối chiếu của ca, gom theo public id bản ghi nhận. Mỗi bản giấy giữ một kết luận (dòng đầu tiên gặp).
     */
    private Map<UUID, OriginalWillIntakeResponse.Comparison> comparisonsOf(VerificationCase verificationCase) {
        var result = new java.util.HashMap<UUID, OriginalWillIntakeResponse.Comparison>();
        for (var row : comparisons.findRowsByCase(verificationCase.getVerificationCaseId())) {
            result.putIfAbsent(row.originalWillIntakeId(), new OriginalWillIntakeResponse.Comparison(
                    row.result(), row.reason(), row.comparedAt().toInstant(java.time.ZoneOffset.UTC), row.version()));
        }
        return result;
    }

    /**
     * Lấy case do Staff phụ trách (không khóa).
     *
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}
     */
    private VerificationCase requireOwnedCase(UUID caseId, Long staffUserId) {
        return caseRepository.findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    /**
     * Tra public id của những người nhận hồ sơ trong một lần truy vấn; trả map rỗng nếu không có bản ghi.
     */
    private Map<Long, UUID> publicIdsOf(List<OriginalWillIntake> intakes) {
        List<Long> userIds = intakes.stream().map(OriginalWillIntake::getReceivedByUserId).distinct().toList();
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getUserId, User::getPublicId, (a, b) -> a));
    }

    /**
     * Trim chuỗi; trả {@code null} nếu null hoặc rỗng.
     */
    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
