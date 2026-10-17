package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.BasisVersionRow;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.service.BasisDossierViewService;

/** Đọc hồ sơ căn cứ: Legal thấy lý do phân loại, Staff không; Staff chỉ xem ca của mình; không lộ ID nội bộ. */
class BasisDossierViewServiceTest {

    private static final Long STAFF_ID = 10L;
    private static final Long LEGAL_ID = 20L;
    private static final Long CASE_DB_ID = 500L;
    private static final UUID CASE_ID = UUID.randomUUID();

    private final LegalCaseLookupRepository caseLookup = mock(LegalCaseLookupRepository.class);
    private final StaffCaseLockRepository staffCases = mock(StaffCaseLockRepository.class);
    private final LegalBasisDossierRepository dossiers = mock(LegalBasisDossierRepository.class);
    private final LegalBasisDossierVersionRepository versions = mock(LegalBasisDossierVersionRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final BasisDossierViewService service = new BasisDossierViewService(caseLookup, staffCases, dossiers,
            versions, users, new ObjectMapper());

    private final UUID legalPublicId = UUID.randomUUID();
    private final UUID staffPublicId = UUID.randomUUID();
    private final CustomUserPrincipal staff = new CustomUserPrincipal(STAFF_ID, staffPublicId, "staff@example.com");

    private static VerificationCase theCase() {
        VerificationCase c = new VerificationCase(77L, LocalDateTime.of(2026, 10, 1, 8, 0), null);
        ReflectionTestUtils.setField(c, "verificationCaseId", CASE_DB_ID);
        ReflectionTestUtils.setField(c, "publicId", CASE_ID);
        return c;
    }

    private static User user(Long id, UUID publicId) {
        User u = new User();
        ReflectionTestUtils.setField(u, "userId", id);
        ReflectionTestUtils.setField(u, "publicId", publicId);
        return u;
    }

    private void data() {
        LegalBasisDossier d = new LegalBasisDossier(CASE_DB_ID, "NOTARIAL", "Không tranh chấp", "NONE", LEGAL_ID);
        ReflectionTestUtils.setField(d, "legalBasisDossierId", 900L);
        ReflectionTestUtils.setField(d, "publicId", UUID.randomUUID());
        ReflectionTestUtils.setField(d, "createdAt", LocalDateTime.of(2026, 10, 3, 9, 0));
        ReflectionTestUtils.setField(d, "updatedAt", LocalDateTime.of(2026, 10, 3, 9, 0));
        when(dossiers.findByVerificationCaseId(CASE_DB_ID)).thenReturn(Optional.of(d));
        when(versions.findRows(900L)).thenReturn(List.of(new BasisVersionRow(1, "NOTARIAL_PARTITION", "Phòng CC 1",
                "045/2026", LocalDate.of(2026, 9, 20), null, null, null, "{\"evidenceReference\":\"BB-12\"}", "ghi chú",
                "application/pdf", 1234L, "a".repeat(64), "NOT_FORWARDED", STAFF_ID,
                LocalDateTime.of(2026, 10, 4, 10, 0), null)));
        when(users.findAllById(org.mockito.ArgumentMatchers.anyIterable()))
                .thenReturn(List.of(user(LEGAL_ID, legalPublicId), user(STAFF_ID, staffPublicId)));
    }

    @Test
    void legalSeesRouteReason_staffDoesNot_andIdsArePublic() {
        data();
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.of(theCase()));
        when(staffCases.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.of(theCase()));

        BasisDossierResponse legal = service.forLegal(CASE_ID);
        BasisDossierResponse viewedByStaff = service.forStaff(CASE_ID, staff);

        assertThat(legal.routeReason()).isEqualTo("Không tranh chấp");
        assertThat(viewedByStaff.routeReason()).isNull();
        assertThat(legal.route()).isEqualTo("NOTARIAL");
        assertThat(legal.classifiedBy()).isEqualTo(legalPublicId);
        assertThat(legal.versions()).hasSize(1);
        assertThat(legal.versions().get(0).createdBy()).isEqualTo(staffPublicId);
        assertThat(legal.versions().get(0).evidenceReference()).isEqualTo("BB-12");
        assertThat(legal.versions().get(0).sha256()).hasSize(64);
        assertThat(legal.createdAt().toString()).endsWith("Z");
    }

    @Test
    void unknownCase_staffNotOwner_orNoDossier_areNotFound() {
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.forLegal(CASE_ID))
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));

        when(staffCases.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.forStaff(CASE_ID, staff))
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        verifyNoInteractions(dossiers);

        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.of(theCase()));
        when(dossiers.findByVerificationCaseId(CASE_DB_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.forLegal(CASE_ID))
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }
}
