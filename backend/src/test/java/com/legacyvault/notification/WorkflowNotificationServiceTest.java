package com.legacyvault.notification;

import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.common.error.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class WorkflowNotificationServiceTest {
    private final JdbcTemplate jdbc=mock(JdbcTemplate.class);
    private final VerificationCaseRepository cases=mock(VerificationCaseRepository.class);
    private final WorkflowNotificationService service=new WorkflowNotificationService(jdbc,cases);
    private VerificationCase ownedCase() {
        var c=mock(VerificationCase.class);
        when(c.getVerificationCaseId()).thenReturn(1L);
        when(c.getAssignedStaffUserId()).thenReturn(2L);
        when(cases.findByIdForUpdate(1L)).thenReturn(Optional.of(c));
        return c;
    }
    @Test void retryReturnsPersistedIdWithoutInsertingAgain() {
        var c=ownedCase(); var id=UUID.randomUUID();
        when(jdbc.queryForList(anyString(),eq(String.class),eq(1L),eq("event:1")))
            .thenReturn(List.of(id.toString()));
        var receipt=service.record(c,WorkflowNotificationService.Workspace.LEGAL,"DEATH_DOCUMENT_RECORDED","event:1",null);
        assertThat(receipt.id()).isEqualTo(id);
        assertThat(receipt.status()).isEqualTo("RECORDED");
        verify(jdbc,never()).update(anyString(),any(Object[].class));
    }
    @Test void persistenceFailureIsPropagatedToRollbackBusinessTransaction() {
        var c=ownedCase();
        when(jdbc.update(anyString(),any(Object[].class))).thenThrow(new IllegalStateException("storage failure"));
        assertThatThrownBy(()->service.record(c,WorkflowNotificationService.Workspace.LEGAL,"DEATH_DOCUMENT_RECORDED","event:1",null))
            .isInstanceOf(IllegalStateException.class);
    }
    @Test void unassignedCaseDoesNotClaimStaffNotificationRecorded() {
        var c=ownedCase(); when(c.getAssignedStaffUserId()).thenReturn(null);
        assertThat(service.record(c,WorkflowNotificationService.Workspace.STAFF,"LEGAL_VAULT_UNLOCKED","unlock:1",null)).isNull();
        verifyNoInteractions(jdbc);
    }
    @Test void invisibleNotificationCannotBeMarkedRead() {
        assertThatThrownBy(()->service.markRead(2L,WorkflowNotificationService.Workspace.STAFF,UUID.randomUUID()))
            .isInstanceOf(BusinessException.class);
        verify(jdbc,never()).update(anyString(),any(Object[].class));
    }
    @Test void rejectsOversizedReasonBeforeDatabaseAccess() {
        assertThatThrownBy(()->service.record(mock(VerificationCase.class),WorkflowNotificationService.Workspace.LEGAL,
            "DEATH_DOCUMENT_RECORDED","event:1","x".repeat(1001))).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(jdbc,cases);
    }
}
