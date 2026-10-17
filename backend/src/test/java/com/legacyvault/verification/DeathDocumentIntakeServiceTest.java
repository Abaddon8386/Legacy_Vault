package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

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
import com.legacyvault.verification.service.DeathDocumentIntakeService;

/** PS-38 (ST-11, LV-DEATH-002): chỉ Staff đã nhận ca ghi nhận được; metadata đầy đủ; audit không chứa dữ liệu giấy tờ. */
class DeathDocumentIntakeServiceTest {

    private static final Long STAFF_ID = 10L;
    private static final Long VAULT_ID = 77L;
    private static final Long CASE_DB_ID = 500L;
    private static final UUID CASE_ID = UUID.randomUUID();

    private final StaffCaseLockRepository caseRepository = mock(StaffCaseLockRepository.class);
    private final DeathDocumentRecordRepository recordRepository = mock(DeathDocumentRecordRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final AuditService auditService = mock(AuditService.class);
    private final DeathDocumentIntakeService service = new DeathDocumentIntakeService(caseRepository,
            recordRepository, userRepository, auditService);

    private final CustomUserPrincipal staff = new CustomUserPrincipal(STAFF_ID, UUID.randomUUID(), "staff@example.com");

    private static VerificationCase openCase() {
        VerificationCase verificationCase = new VerificationCase(VAULT_ID, LocalDateTime.of(2026, 10, 1, 8, 0), null);
        ReflectionTestUtils.setField(verificationCase, "verificationCaseId", CASE_DB_ID);
        ReflectionTestUtils.setField(verificationCase, "publicId", CASE_ID);
        ReflectionTestUtils.setField(verificationCase, "assignedStaffUserId", STAFF_ID);
        return verificationCase;
    }

    private static RecordDeathDocumentRequest request() {
        return new RecordDeathDocumentRequest("DEATH_CERTIFICATE", "  UBND Phường Bến Nghé  ", " 123/2026 ",
                LocalDate.of(2026, 9, 30), "   ", null);
    }

    private void saveAssignsIds() {
        when(recordRepository.saveAndFlush(any(DeathDocumentRecord.class))).thenAnswer(inv -> {
            DeathDocumentRecord record = inv.getArgument(0);
            ReflectionTestUtils.setField(record, "deathDocumentRecordId", 900L);
            ReflectionTestUtils.setField(record, "publicId", UUID.randomUUID());
            ReflectionTestUtils.setField(record, "receivedAt", LocalDateTime.of(2026, 10, 2, 9, 30));
            return record;
        });
    }

    private static ErrorCode codeOf(Throwable ex) {
        return ((BusinessException) ex).getErrorCode();
    }

    @Test
    void record_savesTrimmedMetadataWithStaffAsReceiver_andAuditsWithoutDocumentData() {
        when(caseRepository.findOwnedByStaffForUpdate(CASE_ID, STAFF_ID)).thenReturn(Optional.of(openCase()));
        saveAssignsIds();

        DeathDocumentRecordResponse response = service.record(CASE_ID, staff, request());

        ArgumentCaptor<DeathDocumentRecord> saved = ArgumentCaptor.forClass(DeathDocumentRecord.class);
        verify(recordRepository).saveAndFlush(saved.capture());
        DeathDocumentRecord record = saved.getValue();
        assertThat(record.getVerificationCaseId()).isEqualTo(CASE_DB_ID);
        assertThat(record.getReceivedByUserId()).isEqualTo(STAFF_ID);
        assertThat(record.getDocumentType()).isEqualTo("DEATH_CERTIFICATE");
        assertThat(record.getIssuingAuthority()).isEqualTo("UBND Phường Bến Nghé");
        assertThat(record.getDocumentNumber()).isEqualTo("123/2026");
        assertThat(record.getEvidenceReference()).isNull();
        assertThat(record.getNotes()).isNull();

        assertThat(response.caseId()).isEqualTo(CASE_ID);
        assertThat(response.receivedBy()).isEqualTo(staff.publicId());
        assertThat(response.issuedDate()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(response.receivedAt()).isNotNull();

        ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());
        AuditEvent event = audit.getValue();
        assertThat(event.action()).isEqualTo(AuditAction.DEATH_DOCUMENT_RECORDED);
        assertThat(event.actorType()).isEqualTo(AuditActorType.USER);
        assertThat(event.actorUserId()).isEqualTo(STAFF_ID);
        assertThat(event.vaultId()).isEqualTo(VAULT_ID);
        assertThat(event.entityId()).isEqualTo(900L);
        assertThat(event.stepId()).isEqualTo("ST-11");
        assertThat(event.ruleId()).isEqualTo("LV-DEATH-002");
        assertThat(event.context()).containsEntry("documentType", "DEATH_CERTIFICATE");
        assertThat(event.context().toString()).doesNotContain("123/2026", "Bến Nghé");
    }

    @Test
    void record_forCaseNotOwnedByStaff_isNotFound_andWritesNothing() {
        when(caseRepository.findOwnedByStaffForUpdate(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.record(CASE_ID, staff, request()))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        verify(recordRepository, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void record_forCancelledCase_isConflict_andWritesNothing() {
        VerificationCase cancelled = openCase();
        cancelled.cancel(LocalDateTime.of(2026, 10, 2, 8, 0));
        when(caseRepository.findOwnedByStaffForUpdate(CASE_ID, STAFF_ID)).thenReturn(Optional.of(cancelled));

        assertThatThrownBy(() -> service.record(CASE_ID, staff, request()))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VERIFICATION_CASE_NOT_OPEN));
        verify(recordRepository, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void record_withoutAuthenticatedPrincipal_isUnauthenticated() {
        assertThatThrownBy(() -> service.record(CASE_ID, null, request()))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.UNAUTHENTICATED));
        verifyNoInteractions(caseRepository, recordRepository, auditService);
    }

    @Test
    void list_returnsRecordsOfOwnedCase_withReceiverPublicId() {
        when(caseRepository.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.of(openCase()));
        DeathDocumentRecord record = new DeathDocumentRecord(CASE_DB_ID, "DEATH_REGISTRATION_EXTRACT", "UBND", "9",
                LocalDate.of(2026, 9, 29), STAFF_ID, "BB-01", "ghi chú");
        ReflectionTestUtils.setField(record, "publicId", UUID.randomUUID());
        ReflectionTestUtils.setField(record, "receivedAt", LocalDateTime.of(2026, 10, 2, 9, 30));
        when(recordRepository.findByVerificationCaseIdOrderByReceivedAtDescDeathDocumentRecordIdDesc(CASE_DB_ID))
                .thenReturn(List.of(record));
        User user = new User();
        ReflectionTestUtils.setField(user, "userId", STAFF_ID);
        ReflectionTestUtils.setField(user, "publicId", staff.publicId());
        when(userRepository.findAllById(List.of(STAFF_ID))).thenReturn(List.of(user));

        List<DeathDocumentRecordResponse> result = service.list(CASE_ID, staff);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).documentType()).isEqualTo("DEATH_REGISTRATION_EXTRACT");
        assertThat(result.get(0).receivedBy()).isEqualTo(staff.publicId());
        assertThat(result.get(0).evidenceReference()).isEqualTo("BB-01");
    }

    @Test
    void listAndGet_forCaseNotOwnedByStaff_areNotFound() {
        when(caseRepository.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.list(CASE_ID, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        assertThatThrownBy(() -> service.get(CASE_ID, UUID.randomUUID(), staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        verifyNoInteractions(recordRepository);
    }

    @Test
    void get_recordOfAnotherCase_isNotFound() {
        when(caseRepository.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.of(openCase()));
        UUID otherRecord = UUID.randomUUID();
        when(recordRepository.findByPublicIdAndVerificationCaseId(otherRecord, CASE_DB_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(CASE_ID, otherRecord, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }
}
