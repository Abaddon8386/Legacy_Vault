package com.legacyvault.trustee;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TrusteeContactAuthorizationTest {
    final UUID id = UUID.randomUUID();
    final TrusteeRepository trustees = mock(TrusteeRepository.class);
    final TrusteeContactRecordRepository records = mock(TrusteeContactRecordRepository.class);
    final StaffContextService staff = mock(StaffContextService.class);
    final AuditService audit = mock(AuditService.class);
    final StaffCaseLockRepository cases = mock(StaffCaseLockRepository.class);
    final VaultRepository vaults = mock(VaultRepository.class);
    final TrusteeContactService service = new TrusteeContactService(trustees, records, staff, audit,
            new StaffVaultCaseGuard(vaults, cases));
    final TrusteeContactDtos.RecordRequest request = new TrusteeContactDtos.RecordRequest(
            TrusteeContactDtos.Channel.PHONE, TrusteeContactDtos.Outcome.CONTACTED,
            TrusteeContactDtos.FallbackStatus.NOT_REQUIRED, "private note");

    @BeforeEach void setup() {
        User actor = mock(User.class);
        when(actor.getUserId()).thenReturn(17L);
        when(staff.requireStaff()).thenReturn(actor);
        Vault vault = mock(Vault.class);
        when(vault.getVaultId()).thenReturn(23L);
        when(vaults.findByIdForUpdate(23L)).thenReturn(Optional.of(vault));
        Trustee trustee = mock(Trustee.class);
        when(trustee.getVault()).thenReturn(vault);
        when(trustees.findByPublicId(id)).thenReturn(Optional.of(trustee));
    }

    // Repository predicates select only the exact OPEN, assigned, matching-Vault case.
    // SQL Server integration tests exercise each rejected row shape against those predicates.
    @Test void rejectedCaseDoesNotWriteOrRevealEmptyHistory() {
        assertNotFound(() -> service.record(id, request));
        assertNotFound(() -> service.history(id));
        verifyNoInteractions(records, audit);
        verify(cases).findOpenOwnedByStaffForVaultForUpdate(23L, 17L);
        verify(cases).findOpenOwnedByStaffForVault(23L, 17L);
    }

    @Test void missingTargetDoesNotQueryCaseOrWrite() {
        when(trustees.findByPublicId(id)).thenReturn(Optional.empty());
        assertNotFound(() -> service.record(id, request));
        assertNotFound(() -> service.history(id));
        verifyNoInteractions(cases, records, audit, vaults);
    }

    @Test void repeatedContactsAppendAfterVaultThenCaseLocks() {
        when(cases.findOpenOwnedByStaffForVaultForUpdate(23L, 17L))
                .thenReturn(Optional.of(mock(VerificationCase.class)));
        when(records.saveAndFlush(any())).thenAnswer(i -> i.getArgument(0));
        service.record(id, request);
        service.record(id, request);
        var captured = org.mockito.ArgumentCaptor.forClass(TrusteeContactRecord.class);
        verify(records, times(2)).saveAndFlush(captured.capture());
        assertNotSame(captured.getAllValues().get(0), captured.getAllValues().get(1));
        var order = inOrder(vaults, cases, records, audit);
        order.verify(vaults).findByIdForUpdate(23L);
        order.verify(cases).findOpenOwnedByStaffForVaultForUpdate(23L, 17L);
        order.verify(records).saveAndFlush(any());
        order.verify(audit).record(eq(17L), eq(23L), any(), any(), any(), eq("USER"), any());
    }

    @Test void emptyHistoryStillRequiresOwnedOpenCaseWithoutWriteLocks() {
        when(cases.findOpenOwnedByStaffForVault(23L, 17L)).thenReturn(Optional.of(mock(VerificationCase.class)));
        when(records.findAllByTrustee_PublicIdOrderByOccurredAtDesc(id)).thenReturn(List.of());
        assertTrue(service.history(id).isEmpty());
        verifyNoInteractions(vaults, audit);
        verify(cases, never()).findOpenOwnedByStaffForVaultForUpdate(any(), any());
    }

    static void assertNotFound(Runnable call) {
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, assertThrows(BusinessException.class, call::run).getErrorCode());
    }
}
