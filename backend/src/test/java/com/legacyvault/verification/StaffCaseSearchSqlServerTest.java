package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.StaffVerificationCaseResponse;
import com.legacyvault.verification.service.StaffVerificationCaseService;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** PS-88: Staff queue search on real SQL Server; scope (assigned / OPEN unassigned) must never widen. */
class StaffCaseSearchSqlServerTest extends LegalBasisSqlServerSupport {

    private record Row(long caseId, UUID casePublic, UUID vaultPublic) { }

    private static long user(String name) {
        UUID id = UUID.randomUUID();
        return jdbc.queryForObject("INSERT dbo.users (public_id, full_name, email, password_hash, status) OUTPUT inserted.user_id VALUES (?, ?, ?, 'unused', 'ACTIVE')",
                Long.class, id.toString(), name, id + "@example.test");
    }

    private static Row vaultCase(String owner, String vaultName, Long staff, String caseStatus) {
        long ownerId = user(owner);
        UUID vaultPublic = UUID.randomUUID();
        long vaultId = jdbc.queryForObject("INSERT dbo.vaults (public_id, owner_user_id, vault_name, status) OUTPUT inserted.vault_id VALUES (?, ?, ?, 'AWAITING_VERIFICATION')",
                Long.class, vaultPublic.toString(), ownerId, vaultName);
        UUID casePublic = UUID.randomUUID();
        long caseId = jdbc.queryForObject("INSERT dbo.verification_cases (public_id, vault_id, status, triggered_at, assigned_staff_user_id) OUTPUT inserted.verification_case_id VALUES (?, ?, ?, SYSUTCDATETIME(), ?)",
                Long.class, casePublic.toString(), vaultId, caseStatus, staff);
        return new Row(caseId, casePublic, vaultPublic);
    }

    private static Set<UUID> ids(StaffVerificationCaseService service, CustomUserPrincipal staff, String status, String q) {
        return service.listCases(staff, status, q, 0, 100).content().stream()
                .map(StaffVerificationCaseResponse::caseId).collect(Collectors.toSet());
    }

    @Test
    void searchNarrowsTheQueueByNamesReferenceAndUuidsWithoutLeavingStaffScope() {
        var service = context.getBean(StaffVerificationCaseService.class);
        UUID staffPublic = UUID.randomUUID();
        long staffId = jdbc.queryForObject("INSERT dbo.users (public_id, full_name, email, password_hash, status) OUTPUT inserted.user_id VALUES (?, 'Search staff', ?, 'unused', 'ACTIVE')",
                Long.class, staffPublic.toString(), staffPublic + "@example.test");
        long otherStaff = user("Other staff");
        var staff = new CustomUserPrincipal(staffId, staffPublic, staffPublic + "@example.test");

        String tag = UUID.randomUUID().toString().substring(0, 8);
        Row mine = vaultCase("Trần Thị Bình " + tag, "Di sản Nguyễn Văn An " + tag, staffId, "OPEN");
        Row claimable = vaultCase("Phạm Gia Huy " + tag, "Kho Lê " + tag, null, "OPEN");
        Row hidden = vaultCase("Hoàng X " + tag, "Di sản Nguyễn Khác " + tag, otherStaff, "OPEN");
        Row special = vaultCase("Owner Special " + tag, "Quỹ 100%_A[1] " + tag, staffId, "OPEN");
        Row closedMine = vaultCase("Closed Owner " + tag, "Closed vault " + tag, staffId, "CLOSED");

        // Beneficiary name: a recipient can be found through the case of the Vault that lists them.
        jdbc.update("INSERT dbo.beneficiaries(public_id,vault_id,full_name) SELECT NEWID(),vault_id,? FROM dbo.vaults WHERE public_id=?",
                "Lê Văn Cháu " + tag, mine.vaultPublic().toString());
        jdbc.update("INSERT dbo.beneficiaries(public_id,vault_id,full_name) SELECT NEWID(),vault_id,? FROM dbo.vaults WHERE public_id=?",
                "Cháu Hidden " + tag, hidden.vaultPublic().toString());
        assertEquals(Set.of(mine.casePublic()), ids(service, staff, null, "VĂN CHÁU " + tag));
        assertTrue(ids(service, staff, null, "Cháu Hidden " + tag).isEmpty(), "Beneficiary of another Staff's case must not leak it");

        // Vault name and owner name, accent-insensitive casing, never the other Staff's case.
        assertEquals(Set.of(mine.casePublic()), ids(service, staff, null, "nguyễn văn an " + tag));
        assertEquals(Set.of(mine.casePublic()), ids(service, staff, null, "TRẦN THỊ BÌNH " + tag));
        assertEquals(Set.of(claimable.casePublic()), ids(service, staff, null, "phạm gia huy " + tag));
        assertTrue(ids(service, staff, null, "Nguyễn Khác " + tag).isEmpty(), "case assigned to another Staff must stay hidden");
        assertTrue(ids(service, staff, null, "Hoàng X " + tag).isEmpty());

        // Public UUIDs: own case, claimable case, vault; another Staff's case/vault stays hidden.
        assertEquals(Set.of(mine.casePublic()), ids(service, staff, null, mine.casePublic().toString()));
        assertEquals(Set.of(mine.casePublic()), ids(service, staff, null, mine.vaultPublic().toString().toUpperCase()));
        assertEquals(Set.of(claimable.casePublic()), ids(service, staff, null, claimable.casePublic().toString()));
        assertTrue(ids(service, staff, null, hidden.casePublic().toString()).isEmpty());
        assertTrue(ids(service, staff, null, hidden.vaultPublic().toString()).isEmpty());

        // Case reference HS-YYYY-NNNNNN matches only the right year and id.
        var detail = service.listCases(staff, null, mine.casePublic().toString(), 0, 10).content().get(0);
        assertEquals(Set.of(mine.casePublic()), ids(service, staff, null, detail.caseNumber()));
        assertEquals(Set.of(mine.casePublic()), ids(service, staff, null, detail.caseNumber().toLowerCase()));
        String wrongYear = detail.caseNumber().replaceFirst("HS-\\d{4}", "HS-1999");
        assertTrue(ids(service, staff, null, wrongYear).isEmpty());
        assertTrue(ids(service, staff, null, String.format("HS-%04d-%06d", java.time.LocalDate.now().getYear(), hidden.caseId())).isEmpty());

        // LIKE metacharacters are literal.
        assertEquals(Set.of(special.casePublic()), ids(service, staff, null, "100%_A[1] " + tag));
        assertTrue(ids(service, staff, null, "%" + tag).isEmpty(), "% must not be a wildcard");
        assertTrue(ids(service, staff, null, "_i sản Nguyễn Văn An " + tag).isEmpty(), "_ must not be a wildcard");
        assertTrue(ids(service, staff, null, "[a-z]" + tag).isEmpty(), "[ ] must not be a character class");

        // Status filter combines with the search; blank q equals no search.
        assertEquals(Set.of(closedMine.casePublic()), ids(service, staff, "closed", "Closed vault " + tag));
        assertTrue(ids(service, staff, "OPEN", "Closed vault " + tag).isEmpty());
        List<UUID> all = service.listCases(staff, null, "   ", 0, 100).content().stream().map(StaffVerificationCaseResponse::caseId).toList();
        assertTrue(all.containsAll(List.of(mine.casePublic(), claimable.casePublic(), special.casePublic(), closedMine.casePublic())));
        assertTrue(!all.contains(hidden.casePublic()));

        // Pagination keeps the same scope and total.
        var page = service.listCases(staff, null, tag, 0, 2);
        assertEquals(4, page.totalElements());
        assertEquals(2, page.content().size());
    }

    @Test
    void invalidSearchTermIsRejected() {
        var service = context.getBean(StaffVerificationCaseService.class);
        UUID staffPublic = UUID.randomUUID();
        long staffId = user("Validation staff");
        var staff = new CustomUserPrincipal(staffId, staffPublic, staffPublic + "@example.test");
        var tooLong = assertThrows(BusinessException.class, () -> service.listCases(staff, null, "a".repeat(101), 0, 10));
        assertEquals(ErrorCode.VALIDATION_FAILED, tooLong.getErrorCode());
        var control = assertThrows(BusinessException.class, () -> service.listCases(staff, null, "ab\u0007c", 0, 10));
        assertEquals(ErrorCode.VALIDATION_FAILED, control.getErrorCode());
    }
}
