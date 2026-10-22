package com.legacyvault.beneficiary;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InvitationMailStatusService {
    private final StaffContextService staff;
    private final VerificationCaseRepository cases;
    private final StaffVaultCaseGuard guard;
    private final JdbcTemplate jdbc;
    private final InvitationMailConfiguration config;
    public InvitationMailStatusService(StaffContextService staff,VerificationCaseRepository cases,StaffVaultCaseGuard guard,JdbcTemplate jdbc,InvitationMailConfiguration config) {
        this.staff=staff;this.cases=cases;this.guard=guard;this.jdbc=jdbc;this.config=config;
    }
    @Transactional(readOnly=true)
    public InvitationEmailDtos.Queued get(UUID caseId,UUID beneficiaryId,UUID outboxId) {
        var actor=staff.requireStaff();
        var selected=cases.findByPublicIdAndAssignedStaffUserId(caseId,actor.getUserId()).orElseThrow(InvitationMailStatusService::missing);
        guard.requireOpenForRead(selected.getVaultId(),actor.getUserId());
        var rows=jdbc.query("""
                SELECT o.public_id,o.invitation_public_id,o.invitation_generation,o.transport_status
                FROM dbo.beneficiary_invitation_mail_outbox o JOIN dbo.beneficiaries b ON b.beneficiary_id=o.beneficiary_id
                JOIN dbo.beneficiary_invitations i ON i.invitation_id=o.invitation_id
                WHERE (CAST(? AS uniqueidentifier) IS NULL OR o.public_id=CAST(? AS uniqueidentifier)) AND b.public_id=? AND b.vault_id=? AND o.verification_case_id=? AND i.is_current=1
                """,(rs,n)->new InvitationEmailDtos.Queued(UUID.fromString(rs.getString(1)),UUID.fromString(rs.getString(2)),
                        rs.getInt(3),rs.getString(4),config.transportStatus()),outboxId==null?null:outboxId.toString(),outboxId==null?null:outboxId.toString(),beneficiaryId.toString(),selected.getVaultId(),selected.getVerificationCaseId());
        return rows.stream().findFirst().orElseThrow(InvitationMailStatusService::missing);
    }
    private static BusinessException missing(){return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);}
}
