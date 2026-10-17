package com.legacyvault.beneficiary;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class IdentityVerificationAuthorizationTest {
    final UUID id = UUID.randomUUID();
    final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
    final IdentityVerificationRepository records = mock(IdentityVerificationRepository.class);
    final StaffContextService staff = mock(StaffContextService.class);
    final UserRepository users = mock(UserRepository.class);
    final AuditService audit = mock(AuditService.class);
    final StaffCaseLockRepository cases = mock(StaffCaseLockRepository.class);
    final VaultRepository vaults = mock(VaultRepository.class);
    final EntityManager entities = mock(EntityManager.class);
    final Vault vault = mock(Vault.class);
    Beneficiary beneficiary;
    final IdentityVerificationService service = new IdentityVerificationService(beneficiaries, records, staff,
            users, audit, new StaffVaultCaseGuard(vaults, cases), entities);

    @BeforeEach void setup() {
        User actor = mock(User.class);
        when(actor.getUserId()).thenReturn(17L);
        when(staff.requireStaff()).thenReturn(actor);
        when(vault.getVaultId()).thenReturn(23L);
        when(vaults.findByIdForUpdate(23L)).thenReturn(Optional.of(vault));
        beneficiary = new Beneficiary(id, vault, "Beneficiary", null, null, null, null, null);
        when(beneficiaries.findByPublicId(id)).thenReturn(Optional.of(beneficiary));
        when(records.saveAndFlush(any())).thenAnswer(i -> i.getArgument(0));
    }
    IdentityVerificationDtos.Request request(IdentityVerificationDtos.Result result) {
        return new IdentityVerificationDtos.Request(IdentityVerificationDtos.DocumentType.CCCD, "private issuer", "1234", result);
    }
    void allowWrite() { when(cases.findOpenOwnedByStaffForVaultForUpdate(23L,17L)).thenReturn(Optional.of(mock(VerificationCase.class))); }
    void notFound(Runnable call) { assertEquals(ErrorCode.RESOURCE_NOT_FOUND, assertThrows(BusinessException.class, call::run).getErrorCode()); }

    @Test void rejectedCaseDoesNotWriteOrReadHistory() {
        for (var result : IdentityVerificationDtos.Result.values()) notFound(() -> service.verify(id, request(result)));
        notFound(() -> service.history(id));
        verifyNoInteractions(records, audit, entities, users);
    }
    @Test void missingTargetDoesNotQueryCase() {
        when(beneficiaries.findByPublicId(id)).thenReturn(Optional.empty());
        notFound(() -> service.verify(id, request(IdentityVerificationDtos.Result.MATCH)));
        notFound(() -> service.history(id));
        verifyNoInteractions(cases, vaults, records, audit, entities);
    }
    @Test void matchUsesCanonicalStateAndWhitelistedAudit() {
        allowWrite();
        var response = service.verify(id, request(IdentityVerificationDtos.Result.MATCH));
        assertEquals(Beneficiary.VERIFIED_AT_COUNTER, beneficiary.getIdentityVerificationStatus());
        assertEquals(IdentityVerificationDtos.Result.MATCH, response.result());
        var order = inOrder(cases, entities, records, beneficiaries, audit);
        order.verify(cases).findOpenOwnedByStaffForVaultForUpdate(23L,17L);
        order.verify(entities).refresh(beneficiary);
        order.verify(records).saveAndFlush(any());
        order.verify(beneficiaries).save(beneficiary);
        var details = org.mockito.ArgumentCaptor.forClass(Map.class);
        order.verify(audit).record(eq(17L),eq(23L),eq("BENEFICIARY_IDENTITY_VERIFIED"),eq("BENEFICIARY"),any(),eq("USER"),details.capture());
        assertEquals(Set.of("result","documentType","stepId","ruleId"), details.getValue().keySet());
    }
    @Test void notMatchResetsBothPriorStatesAndAppendsUnchangedResult() {
        allowWrite();
        for (boolean verified : List.of(false,true)) {
            if (verified) beneficiary.verifyAtCounter();
            var response = service.verify(id, request(IdentityVerificationDtos.Result.NOT_MATCH));
            assertEquals(IdentityVerificationDtos.Result.NOT_MATCH, response.result());
            assertEquals(Beneficiary.NOT_VERIFIED, beneficiary.getIdentityVerificationStatus());
        }
        var captured = org.mockito.ArgumentCaptor.forClass(IdentityVerificationRecord.class);
        verify(records, times(2)).saveAndFlush(captured.capture());
        assertNotSame(captured.getAllValues().get(0), captured.getAllValues().get(1));
        assertTrue(captured.getAllValues().stream().allMatch(r -> "NOT_MATCH".equals(r.getResult())));
        verify(beneficiaries, times(2)).save(beneficiary);
        verify(audit, times(2)).record(eq(17L), eq(23L), eq("BENEFICIARY_IDENTITY_VERIFIED"),
                eq("BENEFICIARY"), any(), eq("USER"), any());
    }
    @Test void emptyHistoryIsAuthorizedWithoutWriteLocks() {
        when(cases.findOpenOwnedByStaffForVault(23L,17L)).thenReturn(Optional.of(mock(VerificationCase.class)));
        when(records.findAllByBeneficiary_PublicIdOrderByVerifiedAtDesc(id)).thenReturn(List.of());
        when(users.findAllById(List.of())).thenReturn(List.of());
        assertTrue(service.history(id).isEmpty());
        verifyNoInteractions(vaults,audit,entities);
    }
}
