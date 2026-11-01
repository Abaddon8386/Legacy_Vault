package com.legacyvault.verification;

import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.service.*;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ArchivedCaseIntakeServiceTest {
    private final UUID caseId=UUID.randomUUID();
    private final CustomUserPrincipal staff=new CustomUserPrincipal(1L,UUID.randomUUID(),"staff@example.test");
    private final StaffCaseLockRepository cases=mock(StaffCaseLockRepository.class);
    private final UserRepository users=mock(UserRepository.class);
    private final AuditService audit=mock(AuditService.class);
    private final LegalBasisLockedState state=mock(LegalBasisLockedState.class);
    private final VerificationCase cached=new VerificationCase(5L,LocalDateTime.now(),1L);
    ArchivedCaseIntakeServiceTest(){
        when(cases.findOwnedByStaffForUpdate(caseId,1L)).thenReturn(Optional.of(cached));
        // Archive committed before this writer acquired its case lock; the persistence context still has OPEN.
        doAnswer(i->{cached.complete(LocalDateTime.now(),7L);return null;}).when(state).refresh(cached);
    }
    @Test void deathDocumentInsertRechecksClosedCaseAfterLock(){
        var records=mock(DeathDocumentRecordRepository.class);
        var service=new DeathDocumentIntakeService(cases,records,users,audit,state,mock(com.legacyvault.notification.WorkflowNotificationService.class));
        assertEquals(ErrorCode.VERIFICATION_CASE_NOT_OPEN,assertThrows(BusinessException.class,
                ()->service.record(caseId,staff,null)).getErrorCode());
        verify(state).refresh(cached);verifyNoInteractions(records,users,audit);
    }
    @Test void originalWillIntakeInsertRechecksClosedCaseAfterLock(){
        var records=mock(OriginalWillIntakeRepository.class);
        var service=new OriginalWillIntakeService(cases,records,users,audit,state,mock(com.legacyvault.notification.WorkflowNotificationService.class));
        assertEquals(ErrorCode.VERIFICATION_CASE_NOT_OPEN,assertThrows(BusinessException.class,
                ()->service.record(caseId,staff,null)).getErrorCode());
        verify(state).refresh(cached);verifyNoInteractions(records,users,audit);
    }
}
