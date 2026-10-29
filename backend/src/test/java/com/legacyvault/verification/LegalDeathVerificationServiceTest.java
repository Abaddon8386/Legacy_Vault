
package com.legacyvault.verification;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.LegalDeathDecisionRequest;
import com.legacyvault.verification.dto.LegalDeathDecisionResponse;
import com.legacyvault.verification.dto.LegalDeathDocumentDetailResponse;
import com.legacyvault.verification.entity.DeathDocumentRecord;
import com.legacyvault.verification.entity.LegalVerification;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.DeathDocumentRecordRepository;
import com.legacyvault.verification.repository.LegalVerificationRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.LegalDeathVerificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LegalDeathVerificationServiceTest {

    @Mock
    private DeathDocumentRecordRepository deathDocumentRecordRepository;

    @Mock
    private LegalVerificationRepository legalVerificationRepository;

    @Mock
    private VerificationCaseRepository verificationCaseRepository;

    @Mock
    private VaultRepository vaultRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AuditService auditService;

    private LegalDeathVerificationService service;

    private final UUID deathDocumentId = UUID.randomUUID();
    private final UUID casePublicId = UUID.randomUUID();
    private final UUID actorPublicId = UUID.randomUUID();

    private CustomUserPrincipal principal;

    private DeathDocumentRecord deathRecord;
    private VerificationCase verificationCase;
    private Vault vault;

    /*
     * Khởi tạo service và các đối tượng dùng chung cho test.
     * Package: com.legacyvault.verification
     * Class: LegalDeathVerificationServiceTest
     */
    @BeforeEach
    void setUp() {
        service = new LegalDeathVerificationService(
                deathDocumentRecordRepository,
                legalVerificationRepository,
                verificationCaseRepository,
                vaultRepository,
                auditService,
                userRepository
        , org.mockito.Mockito.mock(com.legacyvault.notification.WorkflowNotificationService.class));

        principal = new CustomUserPrincipal(
                8L,
                actorPublicId,
                "legal@example.com"
        );

        deathRecord = mock(DeathDocumentRecord.class);
        verificationCase = mock(VerificationCase.class);
        vault = mock(Vault.class);
    }

    /*
     * Thiết lập dữ liệu giả cho luồng quyết định xác minh thành công.
     * Package: com.legacyvault.verification
     * Class: LegalDeathVerificationServiceTest
     * Vị trí: trước các test nghiệp vụ.
     */
    private void stubSuccessfulDecisionFlow() {
        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));
        when(verificationCaseRepository.findById(20L))
                .thenReturn(Optional.of(verificationCase));

        when(deathRecord.getVerificationCaseId()).thenReturn(20L);
        when(deathRecord.getDeathDocumentRecordId()).thenReturn(30L);
        when(deathRecord.getPublicId()).thenReturn(deathDocumentId);

        when(verificationCase.getVerificationCaseId()).thenReturn(20L);
        when(verificationCase.getVaultId()).thenReturn(100L);
        when(verificationCase.getPublicId()).thenReturn(casePublicId);
        when(verificationCase.isOpen()).thenReturn(true);

        when(vaultRepository.findByIdForUpdate(100L))
                .thenReturn(Optional.of(vault));
        when(verificationCaseRepository.findByIdForUpdate(20L))
                .thenReturn(Optional.of(verificationCase));
        when(deathDocumentRecordRepository.findByPublicIdForUpdate(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));

        when(vault.getVaultId()).thenReturn(100L);
        when(vault.getStatus()).thenReturn(Vault.STATUS_AWAITING_VERIFICATION);

        when(legalVerificationRepository.existsByDeathDocumentRecordId(30L))
                .thenReturn(false);
        when(legalVerificationRepository.saveAndFlush(any(LegalVerification.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void decideApprove_savesDecisionAndUpdatesVault() {
        stubSuccessfulDecisionFlow();

        LegalDeathDecisionResponse response = service.decide(
                deathDocumentId,
                new LegalDeathDecisionRequest(
                        LegalDeathDecisionRequest.Decision.APPROVE,
                        "Đã kiểm tra hồ sơ chứng tử."
                ),
                principal
        );

        assertEquals(LegalVerification.RESULT_APPROVED, response.result());
        assertEquals(casePublicId, response.verificationCasePublicId());
        assertEquals("Đã kiểm tra hồ sơ chứng tử.", response.reason());
        assertNotNull(response.decidedAt());
        verify(vault).markDocumentVerification();

        ArgumentCaptor<LegalVerification> decisionCaptor =
                ArgumentCaptor.forClass(LegalVerification.class);
        verify(legalVerificationRepository).saveAndFlush(decisionCaptor.capture());

        LegalVerification savedDecision = decisionCaptor.getValue();
        assertEquals(30L, savedDecision.getDeathDocumentRecordId());
        assertEquals(8L, savedDecision.getVerifierUserId());
        assertEquals(LegalVerification.RESULT_APPROVED, savedDecision.getResult());
        assertEquals("Đã kiểm tra hồ sơ chứng tử.", savedDecision.getRemarks());
        assertNotNull(savedDecision.getDecidedAt());
        assertNotNull(savedDecision.getRequestedAt());
        assertNotNull(savedDecision.getCreatedAt());

        ArgumentCaptor<AuditEvent> captor =
                ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(captor.capture());

        AuditEvent event = captor.getValue();
        assertEquals(AuditAction.LEGAL_DEATH_DOCUMENT_DECIDED, event.action());
        assertEquals(8L, event.actorUserId());
        assertEquals(100L, event.vaultId());
        assertEquals("ST-12", event.stepId());
        assertEquals("LV-DEATH-002", event.ruleId());
        assertEquals(LegalVerification.RESULT_PENDING, event.stateBefore());
        assertEquals(LegalVerification.RESULT_APPROVED, event.stateAfter());
        assertFalse(event.context().containsKey("reason"));
        assertFalse(event.context().containsValue("Đã kiểm tra hồ sơ chứng tử."));
    }

    @Test
    void decideReject_savesRejectedDecisionWithoutChangingVault() {
        stubSuccessfulDecisionFlow();

        LegalDeathDecisionResponse response = service.decide(
                deathDocumentId,
                new LegalDeathDecisionRequest(
                        LegalDeathDecisionRequest.Decision.REJECT,
                        "Không đủ căn cứ xác nhận tính hợp lệ."
                ),
                principal
        );

        assertEquals(LegalVerification.RESULT_REJECTED, response.result());
        verify(vault, never()).markDocumentVerification();
        verify(auditService).record(any(AuditEvent.class));
    }

    @Test
    void decideRequestMore_savesNeedsCorrectionWithoutChangingVault() {
        stubSuccessfulDecisionFlow();

        LegalDeathDecisionResponse response = service.decide(
                deathDocumentId,
                new LegalDeathDecisionRequest(
                        LegalDeathDecisionRequest.Decision.REQUEST_MORE,
                        "Yêu cầu bổ sung chứng cứ."
                ),
                principal
        );

        assertEquals(
                LegalVerification.RESULT_NEEDS_CORRECTION,
                response.result()
        );
        verify(vault, never()).markDocumentVerification();
        verify(auditService).record(any(AuditEvent.class));
    }

    @Test
    void decideCaseClosed_throwsConflictAndDoesNotAudit() {
        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));
        when(deathRecord.getVerificationCaseId()).thenReturn(20L);

        when(verificationCaseRepository.findById(20L))
                .thenReturn(Optional.of(verificationCase));
        when(verificationCase.getVerificationCaseId()).thenReturn(20L);
        when(verificationCase.getVaultId()).thenReturn(100L);
        when(verificationCase.isOpen()).thenReturn(false);

        when(vaultRepository.findByIdForUpdate(100L))
                .thenReturn(Optional.of(vault));
        when(verificationCaseRepository.findByIdForUpdate(20L))
                .thenReturn(Optional.of(verificationCase));
        when(deathDocumentRecordRepository.findByPublicIdForUpdate(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));

        when(vault.getVaultId()).thenReturn(100L);

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.decide(
                        deathDocumentId,
                        new LegalDeathDecisionRequest(
                                LegalDeathDecisionRequest.Decision.APPROVE,
                                "Lý do kiểm tra"
                        ),
                        principal
                )
        );

        assertEquals(
                ErrorCode.LEGAL_VERIFICATION_INVALID_STATE,
                exception.getErrorCode()
        );

        verifyNoInteractions(auditService);
        verify(vaultRepository).findByIdForUpdate(100L);
        verify(legalVerificationRepository, never())
                .saveAndFlush(any(LegalVerification.class));
    }

    @Test
    void decideVaultInWrongState_throwsConflict() {
        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));
        when(deathRecord.getVerificationCaseId()).thenReturn(20L);

        when(verificationCaseRepository.findById(20L))
                .thenReturn(Optional.of(verificationCase));
        when(verificationCase.getVerificationCaseId()).thenReturn(20L);
        when(verificationCase.getVaultId()).thenReturn(100L);
        when(verificationCase.isOpen()).thenReturn(true);

        when(vaultRepository.findByIdForUpdate(100L))
                .thenReturn(Optional.of(vault));
        when(verificationCaseRepository.findByIdForUpdate(20L))
                .thenReturn(Optional.of(verificationCase));
        when(deathDocumentRecordRepository.findByPublicIdForUpdate(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));

        when(vault.getVaultId()).thenReturn(100L);
        when(vault.getStatus()).thenReturn(Vault.STATUS_ACTIVE);

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.decide(
                        deathDocumentId,
                        new LegalDeathDecisionRequest(
                                LegalDeathDecisionRequest.Decision.APPROVE,
                                "Lý do kiểm tra"
                        ),
                        principal
                )
        );

        assertEquals(
                ErrorCode.LEGAL_VERIFICATION_INVALID_STATE,
                exception.getErrorCode()
        );

        verify(legalVerificationRepository, never())
                .saveAndFlush(any(LegalVerification.class));
        verifyNoInteractions(auditService);
    }

    @Test
    void decideAlreadyDecided_throwsConflict() {
        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));
        when(deathRecord.getVerificationCaseId()).thenReturn(20L);
        when(deathRecord.getDeathDocumentRecordId()).thenReturn(30L);

        when(verificationCaseRepository.findById(20L))
                .thenReturn(Optional.of(verificationCase));
        when(verificationCase.getVerificationCaseId()).thenReturn(20L);
        when(verificationCase.getVaultId()).thenReturn(100L);
        when(verificationCase.isOpen()).thenReturn(true);

        when(vaultRepository.findByIdForUpdate(100L))
                .thenReturn(Optional.of(vault));
        when(verificationCaseRepository.findByIdForUpdate(20L))
                .thenReturn(Optional.of(verificationCase));
        when(deathDocumentRecordRepository.findByPublicIdForUpdate(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));

        when(vault.getVaultId()).thenReturn(100L);
        when(vault.getStatus()).thenReturn(Vault.STATUS_AWAITING_VERIFICATION);

        when(legalVerificationRepository.existsByDeathDocumentRecordId(30L))
                .thenReturn(true);

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.decide(
                        deathDocumentId,
                        new LegalDeathDecisionRequest(
                                LegalDeathDecisionRequest.Decision.APPROVE,
                                "Lý do kiểm tra"
                        ),
                        principal
                )
        );

        assertEquals(
                ErrorCode.LEGAL_VERIFICATION_ALREADY_DECIDED,
                exception.getErrorCode()
        );

        verify(legalVerificationRepository, never())
                .saveAndFlush(any(LegalVerification.class));
        verifyNoInteractions(auditService);
    }

    @Test
    void decideBlankReason_throwsValidationErrorWithoutDatabaseAccess() {
        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.decide(
                        deathDocumentId,
                        new LegalDeathDecisionRequest(
                                LegalDeathDecisionRequest.Decision.APPROVE,
                                "   "
                        ),
                        principal
                )
        );

        assertEquals(ErrorCode.VALIDATION_FAILED, exception.getErrorCode());
        verifyNoInteractions(
                deathDocumentRecordRepository,
                verificationCaseRepository,
                vaultRepository,
                legalVerificationRepository,
                userRepository,
                auditService
        );
    }

    @Test
    void decideReasonOver1000Characters_throwsValidationErrorWithoutDatabaseAccess() {
        String reason = "x".repeat(1001);

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.decide(
                        deathDocumentId,
                        new LegalDeathDecisionRequest(
                                LegalDeathDecisionRequest.Decision.REQUEST_MORE,
                                reason
                        ),
                        principal
                )
        );

        assertEquals(ErrorCode.VALIDATION_FAILED, exception.getErrorCode());
        verifyNoInteractions(
                deathDocumentRecordRepository,
                verificationCaseRepository,
                vaultRepository,
                legalVerificationRepository,
                userRepository,
                auditService
        );
    }

    @Test
    void decideMissingDocument_throwsNotFound() {
        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.empty());

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.decide(
                        deathDocumentId,
                        new LegalDeathDecisionRequest(
                                LegalDeathDecisionRequest.Decision.APPROVE,
                                "Lý do kiểm tra"
                        ),
                        principal
                )
        );

        assertEquals(
                ErrorCode.RESOURCE_NOT_FOUND,
                exception.getErrorCode()
        );

        verifyNoInteractions(auditService);
        verifyNoInteractions(verificationCaseRepository);
        verifyNoInteractions(vaultRepository);
        verifyNoInteractions(legalVerificationRepository);
        verifyNoInteractions(userRepository);
    }

    @Test
    void decide_locksVaultThenCaseThenDeathDocument() {
        stubSuccessfulDecisionFlow();

        service.decide(
                deathDocumentId,
                new LegalDeathDecisionRequest(
                        LegalDeathDecisionRequest.Decision.APPROVE,
                        "Đã kiểm tra hồ sơ chứng tử."
                ),
                principal
        );

        InOrder inOrder = inOrder(
                vaultRepository,
                verificationCaseRepository,
                deathDocumentRecordRepository
        );

        inOrder.verify(vaultRepository).findByIdForUpdate(100L);
        inOrder.verify(verificationCaseRepository).findByIdForUpdate(20L);
        inOrder.verify(deathDocumentRecordRepository)
                .findByPublicIdForUpdate(deathDocumentId);
    }

    /*
     * Kiểm tra GET chi tiết trả public UUID và timestamp UTC.
     * Package: com.legacyvault.verification
     * Class: LegalDeathVerificationServiceTest
     * Vị trí: nhóm test GET chi tiết ở cuối class.
     */
    @Test
    void getDetail_successReturnsPublicIdsAndDecisionHistory() {
        UUID receivedByPublicId = UUID.randomUUID();
        UUID verifierPublicId = UUID.randomUUID();
        LocalDateTime receivedAt = LocalDateTime.of(2026, 10, 17, 8, 30);
        LocalDateTime createdAt = LocalDateTime.of(2026, 10, 17, 8, 25);
        LocalDateTime requestedAt = LocalDateTime.of(2026, 10, 17, 8, 35);
        LocalDateTime decidedAt = LocalDateTime.of(2026, 10, 17, 8, 40);

        User receiver = mock(User.class);
        User verifier = mock(User.class);
        LegalVerification decision = mock(LegalVerification.class);

        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));
        when(deathRecord.getVerificationCaseId()).thenReturn(20L);
        when(deathRecord.getDeathDocumentRecordId()).thenReturn(30L);
        when(deathRecord.getPublicId()).thenReturn(deathDocumentId);
        when(deathRecord.getDocumentType()).thenReturn("DEATH_CERTIFICATE");
        when(deathRecord.getIssuingAuthority()).thenReturn("UBND");
        when(deathRecord.getDocumentNumber()).thenReturn("DC-2026-001");
        when(deathRecord.getIssuedDate()).thenReturn(LocalDate.of(2026, 10, 10));
        when(deathRecord.getReceivedByUserId()).thenReturn(40L);
        when(deathRecord.getReceivedAt()).thenReturn(receivedAt);
        when(deathRecord.getEvidenceReference()).thenReturn("evidence/ref/001");
        when(deathRecord.getNotes()).thenReturn("Hồ sơ hợp lệ về mặt tiếp nhận");
        when(deathRecord.getCreatedAt()).thenReturn(createdAt);

        when(verificationCaseRepository.findById(20L))
                .thenReturn(Optional.of(verificationCase));
        when(verificationCase.getVaultId()).thenReturn(100L);
        when(verificationCase.getPublicId()).thenReturn(casePublicId);
        when(verificationCase.getStatus()).thenReturn("OPEN");

        when(vaultRepository.findById(100L)).thenReturn(Optional.of(vault));
        when(vault.getStatus()).thenReturn(Vault.STATUS_AWAITING_VERIFICATION);

        when(legalVerificationRepository
                .findByDeathDocumentRecordIdOrderByRequestedAtDescVerificationIdDesc(30L))
                .thenReturn(List.of(decision));
        when(decision.getResult()).thenReturn(LegalVerification.RESULT_APPROVED);
        when(decision.getVerifierUserId()).thenReturn(8L);
        when(decision.getRequestedAt()).thenReturn(requestedAt);
        when(decision.getDecidedAt()).thenReturn(decidedAt);
        when(decision.getRemarks()).thenReturn("Đã xác minh");

        when(userRepository.findById(40L)).thenReturn(Optional.of(receiver));
        when(receiver.getPublicId()).thenReturn(receivedByPublicId);
        when(userRepository.findById(8L)).thenReturn(Optional.of(verifier));
        when(verifier.getPublicId()).thenReturn(verifierPublicId);

        LegalDeathDocumentDetailResponse response = service.getDetail(deathDocumentId);

        assertEquals(deathDocumentId, response.deathDocumentPublicId());
        assertEquals(casePublicId, response.verificationCasePublicId());
        assertEquals("OPEN", response.verificationCaseStatus());
        assertEquals(Vault.STATUS_AWAITING_VERIFICATION, response.vaultStatus());

        assertEquals("DEATH_CERTIFICATE", response.document().documentType());
        assertEquals(receivedByPublicId, response.document().receivedByPublicId());
        assertEquals(receivedAt.toInstant(ZoneOffset.UTC), response.document().receivedAt());
        assertEquals(createdAt.toInstant(ZoneOffset.UTC), response.document().createdAt());

        assertEquals(1, response.decisions().size());
        LegalDeathDocumentDetailResponse.DecisionHistory history =
                response.decisions().get(0);
        assertEquals(LegalVerification.RESULT_APPROVED, history.result());
        assertEquals(verifierPublicId, history.verifierPublicId());
        assertEquals(requestedAt.toInstant(ZoneOffset.UTC), history.requestedAt());
        assertEquals(decidedAt.toInstant(ZoneOffset.UTC), history.decidedAt());
        assertEquals("Đã xác minh", history.reason());

        verify(userRepository).findById(40L);
        verify(userRepository).findById(8L);
    }

    @Test
    void getDetail_missingDocument_throwsNotFound() {
        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.empty());

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.getDetail(deathDocumentId)
        );

        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, exception.getErrorCode());
        verifyNoInteractions(
                verificationCaseRepository,
                vaultRepository,
                legalVerificationRepository,
                userRepository,
                auditService
        );
    }

    @Test
    void getDetail_missingVerificationCase_throwsNotFound() {
        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));
        when(deathRecord.getVerificationCaseId()).thenReturn(20L);
        when(verificationCaseRepository.findById(20L))
                .thenReturn(Optional.empty());

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.getDetail(deathDocumentId)
        );

        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, exception.getErrorCode());
        verifyNoInteractions(
                vaultRepository,
                legalVerificationRepository,
                userRepository,
                auditService
        );
    }

    @Test
    void getDetail_missingVault_throwsNotFound() {
        when(deathDocumentRecordRepository.findByPublicId(deathDocumentId))
                .thenReturn(Optional.of(deathRecord));
        when(deathRecord.getVerificationCaseId()).thenReturn(20L);
        when(verificationCaseRepository.findById(20L))
                .thenReturn(Optional.of(verificationCase));
        when(verificationCase.getVaultId()).thenReturn(100L);
        when(vaultRepository.findById(100L)).thenReturn(Optional.empty());

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.getDetail(deathDocumentId)
        );

        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, exception.getErrorCode());
        verifyNoInteractions(legalVerificationRepository, userRepository, auditService);
    }
}
