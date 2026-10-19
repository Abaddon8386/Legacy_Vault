package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.audit.AuditAction;
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
import com.legacyvault.verification.service.OriginalWillIntakeService;

/** PS-39 (ST-13, LV-WILL-001): chỉ Staff đã nhận ca ghi nhận được; không xác nhận hợp lệ; audit không chứa dữ liệu cá nhân. */
class OriginalWillIntakeServiceTest {

    private static final Long STAFF_ID = 10L;
    private static final Long VAULT_ID = 77L;
    private static final Long CASE_DB_ID = 500L;
    private static final UUID CASE_ID = UUID.randomUUID();

    private final StaffCaseLockRepository caseRepository = mock(StaffCaseLockRepository.class);
    private final OriginalWillIntakeRepository intakeRepository = mock(OriginalWillIntakeRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final AuditService auditService = mock(AuditService.class);
    private final OriginalWillIntakeService service = new OriginalWillIntakeService(caseRepository, intakeRepository,
            userRepository, auditService,
            mock(com.legacyvault.verification.service.LegalBasisLockedState.class));

    private final CustomUserPrincipal staff = new CustomUserPrincipal(STAFF_ID, UUID.randomUUID(), "staff@example.com");

    private static VerificationCase openCase() {
        VerificationCase verificationCase = new VerificationCase(VAULT_ID, LocalDateTime.of(2026, 10, 1, 8, 0), null);
        ReflectionTestUtils.setField(verificationCase, "verificationCaseId", CASE_DB_ID);
        ReflectionTestUtils.setField(verificationCase, "publicId", CASE_ID);
        ReflectionTestUtils.setField(verificationCase, "assignedStaffUserId", STAFF_ID);
        return verificationCase;
    }

    private static RecordOriginalWillRequest request() {
        return new RecordOriginalWillRequest("  Nguyễn Văn A  ", "  ", " BB-07 ", "Có dấu mộc đỏ, rách góc");
    }

    private static ErrorCode codeOf(Throwable ex) {
        return ((BusinessException) ex).getErrorCode();
    }

    private void saveAssignsIds() {
        when(intakeRepository.saveAndFlush(any(OriginalWillIntake.class))).thenAnswer(inv -> {
            OriginalWillIntake intake = inv.getArgument(0);
            ReflectionTestUtils.setField(intake, "originalWillIntakeId", 901L);
            ReflectionTestUtils.setField(intake, "publicId", UUID.randomUUID());
            ReflectionTestUtils.setField(intake, "receivedAt", LocalDateTime.of(2026, 10, 2, 9, 30));
            return intake;
        });
    }

    @Test
    void record_savesTrimmedMetadataWithStaffAsReceiver_andAuditsWithoutPersonalData() {
        when(caseRepository.findOwnedByStaffForUpdate(CASE_ID, STAFF_ID)).thenReturn(Optional.of(openCase()));
        saveAssignsIds();

        OriginalWillIntakeResponse response = service.record(CASE_ID, staff, request());

        ArgumentCaptor<OriginalWillIntake> saved = ArgumentCaptor.forClass(OriginalWillIntake.class);
        verify(intakeRepository).saveAndFlush(saved.capture());
        OriginalWillIntake intake = saved.getValue();
        assertThat(intake.getVerificationCaseId()).isEqualTo(CASE_DB_ID);
        assertThat(intake.getReceivedByUserId()).isEqualTo(STAFF_ID);
        assertThat(intake.getDeliveredByName()).isEqualTo("Nguyễn Văn A");
        assertThat(intake.getDeliveredByRelationship()).isNull();
        assertThat(intake.getEvidenceReference()).isEqualTo("BB-07");
        assertThat(intake.getConditionNotes()).isEqualTo("Có dấu mộc đỏ, rách góc");

        assertThat(response.caseId()).isEqualTo(CASE_ID);
        assertThat(response.receivedBy()).isEqualTo(staff.publicId());
        assertThat(response.receivedAt()).isNotNull();

        ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());
        AuditEvent event = audit.getValue();
        assertThat(event.action()).isEqualTo(AuditAction.ORIGINAL_WILL_RECEIVED);
        assertThat(event.actorUserId()).isEqualTo(STAFF_ID);
        assertThat(event.vaultId()).isEqualTo(VAULT_ID);
        assertThat(event.entityId()).isEqualTo(901L);
        assertThat(event.stepId()).isEqualTo("ST-13");
        assertThat(event.ruleId()).isEqualTo("LV-WILL-001");
        assertThat(event.context().toString()).doesNotContain("Nguyễn", "rách góc", "BB-07");
    }

    @Test
    void record_forCaseNotOwnedByStaff_isNotFound_andWritesNothing() {
        when(caseRepository.findOwnedByStaffForUpdate(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.record(CASE_ID, staff, request()))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        verify(intakeRepository, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void record_forCancelledCase_isConflict_andWritesNothing() {
        VerificationCase cancelled = openCase();
        cancelled.cancel(LocalDateTime.of(2026, 10, 2, 8, 0));
        when(caseRepository.findOwnedByStaffForUpdate(CASE_ID, STAFF_ID)).thenReturn(Optional.of(cancelled));

        assertThatThrownBy(() -> service.record(CASE_ID, staff, request()))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VERIFICATION_CASE_NOT_OPEN));
        verify(intakeRepository, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void record_doesNotChangeCaseState_orClaimToConfirmValidity() {
        VerificationCase verificationCase = openCase();
        when(caseRepository.findOwnedByStaffForUpdate(CASE_ID, STAFF_ID)).thenReturn(Optional.of(verificationCase));
        saveAssignsIds();

        service.record(CASE_ID, staff, request());

        assertThat(verificationCase.getStatus()).isEqualTo(VerificationCase.STATUS_OPEN);
        assertThat(verificationCase.getClosedAt()).isNull();
    }

    @Test
    void list_returnsIntakesOfOwnedCase_withReceiverPublicId() {
        when(caseRepository.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.of(openCase()));
        OriginalWillIntake intake = new OriginalWillIntake(CASE_DB_ID, "Trần Thị B", "Con gái", STAFF_ID, "BB-08", null);
        ReflectionTestUtils.setField(intake, "publicId", UUID.randomUUID());
        ReflectionTestUtils.setField(intake, "receivedAt", LocalDateTime.of(2026, 10, 2, 9, 30));
        when(intakeRepository.findByVerificationCaseIdOrderByReceivedAtDescOriginalWillIntakeIdDesc(CASE_DB_ID))
                .thenReturn(List.of(intake));
        User user = new User();
        ReflectionTestUtils.setField(user, "userId", STAFF_ID);
        ReflectionTestUtils.setField(user, "publicId", staff.publicId());
        when(userRepository.findAllById(List.of(STAFF_ID))).thenReturn(List.of(user));

        List<OriginalWillIntakeResponse> result = service.list(CASE_ID, staff);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).deliveredByName()).isEqualTo("Trần Thị B");
        assertThat(result.get(0).receivedBy()).isEqualTo(staff.publicId());
    }

    @Test
    void listAndGet_forCaseNotOwnedByStaff_areNotFound() {
        when(caseRepository.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.list(CASE_ID, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        assertThatThrownBy(() -> service.get(CASE_ID, UUID.randomUUID(), staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        verifyNoInteractions(intakeRepository);
    }

    @Test
    void get_intakeOfAnotherCase_isNotFound() {
        when(caseRepository.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.of(openCase()));
        UUID other = UUID.randomUUID();
        when(intakeRepository.findByPublicIdAndVerificationCaseId(other, CASE_DB_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(CASE_ID, other, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }
}
