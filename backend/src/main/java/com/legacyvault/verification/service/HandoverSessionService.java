package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverSessionResponse;
import com.legacyvault.verification.dto.HandoverSessionStatusRequest;
import com.legacyvault.verification.entity.HandoverSession;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Quản lý vòng đời phiên bàn giao (handover session) của Staff: mở, liệt kê, xem chi tiết và hủy (ST-23,
 * LV-HANDOVER-001).
 *
 * <p>Được {@code HandoverSessionController} gọi, base path
 * {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions}, yêu cầu vai trò STAFF_EXECUTOR và chỉ Staff
 * được giao case mới thao tác được. Dùng bảng {@code handover_sessions}, {@code verification_cases}, {@code vaults};
 * ghi audit {@code HANDOVER_SESSION_OPENED} và {@code HANDOVER_SESSION_CANCELLED} qua {@link AuditService}; kiểm tra
 * luồng pháp lý qua {@link LegalWorkflowGuard}.
 */
@Service
public class HandoverSessionService {
    private final HandoverSessionCaseAccess access;
    private final VerificationCaseRepository cases;
    private final HandoverSessionRepository sessions;
    private final VaultRepository vaults;
    private final AuditService audit;
    private final LegalWorkflowGuard workflow;

    /**
     * @param access khóa Vault và case cho thao tác ghi
     * @param cases repository hồ sơ xác minh (đọc)
     * @param sessions repository phiên bàn giao
     * @param vaults repository Vault (đọc)
     * @param audit dịch vụ ghi nhật ký kiểm toán
     * @param workflow guard kiểm tra chuyển trạng thái được bảo vệ của quy trình pháp lý
     */
    public HandoverSessionService(HandoverSessionCaseAccess access, VerificationCaseRepository cases,
            HandoverSessionRepository sessions, VaultRepository vaults, AuditService audit,
            LegalWorkflowGuard workflow) {
        this.access = access;
        this.cases = cases;
        this.sessions = sessions;
        this.vaults = vaults;
        this.audit = audit;
        this.workflow = workflow;
    }

    /**
     * Mở một phiên bàn giao mới cho case. API: {@code POST /api/v1/staff/verification-cases/{caseId}/handover-sessions}
     * (vai trò STAFF_EXECUTOR), trả {@link HandoverSessionResponse}.
     *
     * <p>Các bước: khóa Vault rồi case của Staff; yêu cầu case đang mở và Vault ở trạng thái UNLOCKED hoặc
     * HANDOVER_IN_PROGRESS; kiểm tra {@code requireProtectedTransition(HANDOVER)}; từ chối nếu đã có phiên OPEN; lưu
     * phiên mới (ràng buộc duy nhất ở DB cũng được bắt lại thành lỗi đã mở); ghi audit {@code HANDOVER_SESSION_OPENED}.
     *
     * @param casePublicId public id của hồ sơ xác minh
     * @param principal Staff đang đăng nhập
     * @return thông tin phiên vừa mở
     * @throws BusinessException {@code HANDOVER_SESSION_INVALID_STATE} khi case đóng hoặc Vault sai trạng thái;
     *         {@code HANDOVER_SESSION_ALREADY_OPEN} khi đã có phiên OPEN; {@code RESOURCE_NOT_FOUND} khi không thuộc Staff
     */
    @Transactional
    public HandoverSessionResponse open(UUID casePublicId, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        HandoverSessionCaseAccess.LockedCase locked = access.lockByPublicCaseId(casePublicId, staffId);
        var verificationCase = locked.verificationCase();
        Vault vault = locked.vault();
        if (!verificationCase.isOpen() || !(Vault.STATUS_UNLOCKED.equals(vault.getStatus())
                || Vault.STATUS_HANDOVER_IN_PROGRESS.equals(vault.getStatus()))) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        }
        workflow.requireProtectedTransition(casePublicId, LegalWorkflowGuard.ProtectedTransition.HANDOVER);
        if (sessions.existsByVerificationCaseIdAndStatus(
                verificationCase.getVerificationCaseId(), HandoverSessionStatus.OPEN)) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_ALREADY_OPEN);
        }

        HandoverSession session = new HandoverSession(verificationCase.getVerificationCaseId(), staffId);
        try {
            session = sessions.saveAndFlush(session);
        } catch (DataIntegrityViolationException conflict) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_ALREADY_OPEN);
        }
        audit.record(new AuditEvent(AuditAction.HANDOVER_SESSION_OPENED, AuditActorType.USER, staffId,
                vault.getVaultId(), "HANDOVER_SESSION", session.getId(), null,
                HandoverSessionStatus.OPEN.name(), null,
                Map.of("sessionPublicId", session.getPublicId().toString(),
                        "casePublicId", verificationCase.getPublicId().toString()),
                "ST-23", "LV-HANDOVER-001"));
        return toResponse(session, verificationCase, vault, principal);
    }

    /**
     * Liệt kê các phiên bàn giao của Staff trên case, mới mở nhất trước, có thể lọc theo trạng thái. API:
     * {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions?status=...}. Giao dịch chỉ đọc.
     *
     * @param casePublicId public id của hồ sơ xác minh
     * @param status trạng thái cần lọc, {@code null} để lấy tất cả
     * @param principal Staff đang đăng nhập
     * @return danh sách phiên bàn giao
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu case không được giao cho Staff hoặc không có Vault
     */
    @Transactional(readOnly = true)
    public List<HandoverSessionResponse> list(UUID casePublicId, HandoverSessionStatus status,
            CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        var verificationCase = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(() -> notFound());
        Vault vault = vaults.findById(verificationCase.getVaultId()).orElseThrow(() -> notFound());
        List<HandoverSession> found = status == null
                ? sessions.findByVerificationCaseIdAndStaffUserIdOrderByOpenedAtDesc(
                        verificationCase.getVerificationCaseId(), staffId)
                : sessions.findByVerificationCaseIdAndStaffUserIdAndStatusOrderByOpenedAtDesc(
                        verificationCase.getVerificationCaseId(), staffId, status);
        return found.stream().map(session -> toResponse(session, verificationCase, vault, principal)).toList();
    }

    /**
     * Xem chi tiết một phiên bàn giao. API: {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}}.
     * Giao dịch chỉ đọc.
     *
     * @param casePublicId public id của hồ sơ xác minh
     * @param sessionPublicId public id của phiên bàn giao
     * @param principal Staff đang đăng nhập
     * @return thông tin phiên
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu case hoặc phiên không thuộc Staff
     */
    @Transactional(readOnly = true)
    public HandoverSessionResponse get(UUID casePublicId, UUID sessionPublicId,
            CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        var verificationCase = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(() -> notFound());
        HandoverSession session = sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffId)
                .orElseThrow(() -> notFound());
        Vault vault = vaults.findById(verificationCase.getVaultId()).orElseThrow(() -> notFound());
        return toResponse(session, verificationCase, vault, principal);
    }

    /**
     * Hủy một phiên bàn giao đang mở. API:
     * {@code PATCH /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/status}; body
     * {@link HandoverSessionStatusRequest}. Hiện tại thao tác luôn chuyển phiên sang CANCELLED bất kể giá trị status
     * trong body (body chỉ bắt buộc phải có status).
     *
     * <p>Các bước: kiểm tra quyền sở hữu trước khi khóa, khóa Vault và case, khóa dòng phiên (FOR UPDATE), yêu cầu phiên
     * đang OPEN, đóng phiên với thời điểm UTC hiện tại, lưu và ghi audit {@code HANDOVER_SESSION_CANCELLED}.
     *
     * @param casePublicId public id của hồ sơ xác minh
     * @param sessionPublicId public id của phiên
     * @param request body yêu cầu chứa status
     * @param principal Staff đang đăng nhập
     * @return phiên sau khi bị hủy
     * @throws BusinessException {@code VALIDATION_FAILED} khi thiếu body/status; {@code RESOURCE_NOT_FOUND};
     *         {@code HANDOVER_SESSION_INVALID_STATE} khi phiên không còn OPEN
     */
    @Transactional
    public HandoverSessionResponse updateStatus(UUID casePublicId, UUID sessionPublicId,
            HandoverSessionStatusRequest request, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        if (request == null || request.status() == null) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var caseView = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(() -> notFound());
        sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(
                        sessionPublicId, caseView.getVerificationCaseId(), staffId)
                .orElseThrow(() -> notFound());

        HandoverSessionCaseAccess.LockedCase locked = access.lock(
                caseView.getVerificationCaseId(), staffId);
        var verificationCase = locked.verificationCase();
        HandoverSession session = sessions.findByPublicIdAndCaseAndStaffForUpdate(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffId)
                .orElseThrow(() -> notFound());
        if (session.getStatus() != HandoverSessionStatus.OPEN) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        }

        HandoverSessionStatus target = HandoverSessionStatus.CANCELLED;
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        session.close(target, now);
        session = sessions.saveAndFlush(session);
        audit.record(new AuditEvent(AuditAction.HANDOVER_SESSION_CANCELLED, AuditActorType.USER, staffId, locked.vault().getVaultId(),
                "HANDOVER_SESSION", session.getId(), HandoverSessionStatus.OPEN.name(), target.name(), null,
                Map.of("sessionPublicId", session.getPublicId().toString(),
                        "casePublicId", verificationCase.getPublicId().toString()),
                "ST-23", "LV-HANDOVER-001"));
        return toResponse(session, verificationCase, locked.vault(), principal);
    }

    /**
     * Chuyển entity phiên cùng case, Vault và Staff thành {@link HandoverSessionResponse} (chỉ dùng public id).
     */
    private static HandoverSessionResponse toResponse(HandoverSession session,
            com.legacyvault.verification.entity.VerificationCase verificationCase, Vault vault,
            CustomUserPrincipal principal) {
        return new HandoverSessionResponse(session.getPublicId(), verificationCase.getPublicId(),
                vault.getPublicId(), principal.publicId(), session.getStatus(),
                session.getOpenedAt(), session.getClosedAt());
    }

    /**
     * Tạo lỗi {@code RESOURCE_NOT_FOUND} dùng chung.
     */
    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }
}
