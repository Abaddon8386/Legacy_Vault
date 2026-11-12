
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

/**
 * Hàng đợi và hồ sơ xác minh phía Staff: liệt kê/tìm kiếm, xem chi tiết và nhận hồ sơ (ST-09, ST-10).
 *
 * <p>Được {@code StaffVerificationCaseController} gọi, base path {@code /api/v1/staff/verification-cases} (vai trò
 * STAFF_EXECUTOR): {@code GET} (danh sách), {@code GET /{caseId}} (chi tiết), {@code POST /{caseId}/claim} (nhận hồ sơ).
 * Trả {@link StaffVerificationCaseResponse}. Bảng: {@code verification_cases}, {@code vaults}, {@code users} (chủ
 * Vault), {@code trustees} (người được ủy thác đang APPOINTED). Ghi audit {@code VERIFICATION_CASE_CLAIMED}.
 */
@Service
public class StaffVerificationCaseService {
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final TrusteeRepository trusteeRepository;

    /**
     * @param caseRepository repository hồ sơ xác minh
     * @param vaultRepository repository Vault
     * @param userRepository repository người dùng (chủ Vault)
     * @param auditService dịch vụ ghi nhật ký kiểm toán
     * @param trusteeRepository repository người được ủy thác
     */
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

    /**
     * Độ dài tối đa của từ khóa tìm kiếm hàng đợi.
     */
    private static final int MAX_SEARCH_LENGTH = 100;
    /**
     * Mẫu mã hồ sơ dạng {@code HS-<năm>-<số>}, không phân biệt hoa thường; nhóm 1 là năm, nhóm 2 là id hồ sơ.
     */
    private static final java.util.regex.Pattern CASE_REFERENCE =
            java.util.regex.Pattern.compile("^HS-(\\d{4})-(\\d{1,9})$", java.util.regex.Pattern.CASE_INSENSITIVE);

    /**
     * Liệt kê hồ sơ không có từ khóa tìm kiếm; ủy quyền cho bản overload có {@code query}.
     *
     * @param principal Staff đang đăng nhập
     * @param status lọc trạng thái hoặc {@code null}
     * @param page số trang từ 0
     * @param size kích thước trang
     * @return trang hồ sơ
     */
    public PageResponse<StaffVerificationCaseResponse> listCases(
            CustomUserPrincipal principal,
            String status,
            int page,
            int size
    ) {
        return listCases(principal, status, null, page, size);
    }

    /**
     * PS-88 (ST-09/ST-10): liệt kê và tìm kiếm hàng đợi hồ sơ của Staff theo mã hồ sơ, tên Vault/chủ Vault/Beneficiary
     * hoặc public UUID.
     * API: {@code GET /api/v1/staff/verification-cases?status=&query=&page=&size=}. Giao dịch chỉ đọc.
     *
     * <p>Chuẩn hóa trạng thái (OPEN, CANCELLED, CLOSED), sắp xếp theo {@code triggeredAt} giảm dần; không có từ khóa thì dùng
     * {@code findQueueByStaff}, có từ khóa thì dùng {@link #search}.
     *
     * @param principal Staff đang đăng nhập
     * @param status lọc trạng thái hoặc {@code null}
     * @param query từ khóa tìm kiếm hoặc {@code null}
     * @param page số trang từ 0
     * @param size kích thước trang
     * @return trang {@link StaffVerificationCaseResponse}
     * @throws BusinessException {@code VALIDATION_FAILED} khi trạng thái hoặc từ khóa không hợp lệ
     */
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

    /**
     * Tìm kiếm hàng đợi theo từ khóa: thử đọc từ khóa là UUID, thử khớp mẫu mã hồ sơ {@code HS-năm-số}, và dựng mẫu LIKE
     * đã escape ({@code !}, {@code %}, {@code _}, {@code [}) để tìm theo tên không phân biệt hoa thường.
     */
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

    /**
     * Chuẩn hóa từ khóa tìm kiếm: null hoặc rỗng thành {@code null}; trim.
     *
     * @throws BusinessException {@code VALIDATION_FAILED} khi dài quá 100 ký tự hoặc chứa ký tự điều khiển
     */
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

    /**
     * Xem chi tiết một hồ sơ (kèm người được ủy thác đang APPOINTED).
     * API: {@code GET /api/v1/staff/verification-cases/{caseId}}. Giao dịch chỉ đọc.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param principal Staff đang đăng nhập
     * @return chi tiết hồ sơ
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu hồ sơ không xem được với Staff này
     */
    @Transactional(readOnly = true)
    public StaffVerificationCaseResponse getCase(UUID caseId, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        VerificationCase verificationCase =
                caseRepository.findViewableCaseByPublicId(caseId, staffUserId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        return toResponse(verificationCase, true);
    }

    /**
     * Dựng response từ hồ sơ, Vault và chủ Vault; chỉ khi {@code includeTrustee} mới kèm thông tin người được ủy thác.
     * Trường {@code assignment} là UNASSIGNED_CLAIMABLE khi chưa có Staff, ngược lại ASSIGNED_TO_CURRENT_STAFF.
     *
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu thiếu Vault hoặc chủ Vault
     */
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

    /**
     * Staff nhận một hồ sơ chưa ai phụ trách.
     * API: {@code POST /api/v1/staff/verification-cases/{caseId}/claim}.
     *
     * <p>Cập nhật nguyên tử {@code claimUnassignedCase}; nếu không đúng 1 dòng bị ảnh hưởng thì từ chối. Sau đó đọc lại hồ sơ
     * và ghi audit {@code VERIFICATION_CASE_CLAIMED} (bước ST-09).
     *
     * @param caseId public id của hồ sơ xác minh
     * @param principal Staff đang đăng nhập
     * @return hồ sơ sau khi nhận
     * @throws BusinessException {@code VERIFICATION_CASE_NOT_CLAIMABLE} khi hồ sơ đã có người nhận hoặc không mở;
     *         {@code RESOURCE_NOT_FOUND}
     */
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
