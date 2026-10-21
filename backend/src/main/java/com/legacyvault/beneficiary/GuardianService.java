package com.legacyvault.beneficiary;

import java.time.*;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.legacyvault.common.api.PageEnvelope;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.vault.service.VaultService;
import jakarta.persistence.EntityManager;

@Service
public class GuardianService {
    static final ZoneId AGE_ZONE=ZoneId.of("Asia/Ho_Chi_Minh");
    private final OwnerContextService owners;
    private final VaultService vaults;
    private final BeneficiaryRepository beneficiaries;
    private final GuardianRepository guardians;
    private final AuditService audit;
    private final EntityManager entities;
    public GuardianService(OwnerContextService owners,VaultService vaults,BeneficiaryRepository beneficiaries,
            GuardianRepository guardians,AuditService audit,EntityManager entities) {
        this.owners=owners; this.vaults=vaults; this.beneficiaries=beneficiaries;
        this.guardians=guardians; this.audit=audit; this.entities=entities;
    }
    @Transactional(readOnly=true)
    public GuardianDtos.Context read(UUID vaultId,UUID beneficiaryId) {
        var owner=owners.requireOwner();
        var vault=vaults.requireOwnedVault(vaultId,owner.getUserId());
        return context(find(beneficiaryId,vault.getVaultId()));
    }
    @Transactional(readOnly=true)
    public PageEnvelope<GuardianDtos.Guardian> history(UUID vaultId,UUID beneficiaryId,int page,int size) {
        if(page<0 || size<1 || size>100) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var owner=owners.requireOwner();
        var vault=vaults.requireOwnedVault(vaultId,owner.getUserId());
        return guardians.history(find(beneficiaryId,vault.getVaultId()).getId(),page,size);
    }
    @Transactional
    public GuardianDtos.Context replace(UUID vaultId,UUID beneficiaryId,GuardianDtos.UpsertRequest request) {
        var owner=owners.requireOwner();
        var vault=vaults.requireEditableVaultForUpdate(vaultId,owner.getUserId());
        var beneficiary=find(beneficiaryId,vault.getVaultId());
        entities.refresh(beneficiary); // DOB may have changed while awaiting the shared Vault lock.
        var clean=normalize(request);
        advance(beneficiary.getId(),clean.expectedRevision());
        guardians.end(beneficiary.getId(),owner.getUserId(),"REPLACED");
        guardians.insert(beneficiary.getId(),owner.getUserId(),clean.expectedRevision()+1,clean);
        record(owner.getUserId(),vault.getVaultId(),beneficiary.getId(),"BENEFICIARY_GUARDIAN_RECORDED",clean.expectedRevision()+1);
        return context(beneficiary);
    }
    @Transactional
    public GuardianDtos.Context revoke(UUID vaultId,UUID beneficiaryId,GuardianDtos.RevokeRequest request) {
        var owner=owners.requireOwner();
        var vault=vaults.requireEditableVaultForUpdate(vaultId,owner.getUserId());
        var beneficiary=find(beneficiaryId,vault.getVaultId());
        entities.refresh(beneficiary);
        advance(beneficiary.getId(),request==null ? null : request.expectedRevision());
        guardians.end(beneficiary.getId(),owner.getUserId(),"REVOKED");
        record(owner.getUserId(),vault.getVaultId(),beneficiary.getId(),"BENEFICIARY_GUARDIAN_REVOKED",request.expectedRevision()+1);
        return context(beneficiary);
    }
    private void advance(long beneficiary,Long revision) {
        if(revision==null || revision<0 || revision==Long.MAX_VALUE) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        if(!guardians.advance(beneficiary,revision)) throw new BusinessException(ErrorCode.BENEFICIARY_GUARDIAN_STALE);
    }
    private Beneficiary find(UUID id,long vault) {
        return beneficiaries.findByPublicIdAndVault_VaultId(id,vault).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }
    private GuardianDtos.Context context(Beneficiary beneficiary) {
        var state=guardians.state(beneficiary.getId());
        LocalDate today=LocalDate.now(AGE_ZONE);
        String age=ageStatus(beneficiary.getDateOfBirth(),today);
        String warning="UNKNOWN".equals(age) ? "BENEFICIARY_DOB_REQUIRED"
                : "MINOR".equals(age) && state.guardian()==null ? "BENEFICIARY_GUARDIAN_RECOMMENDED" : null;
        return new GuardianDtos.Context(beneficiary.getPublicId(),state.revision(),today,AGE_ZONE.getId(),age,
                "MINOR".equals(age),warning,state.guardian());
    }
    static String ageStatus(LocalDate dob,LocalDate today) {
        if(dob==null || dob.isAfter(today)) return "UNKNOWN";
        return today.isBefore(dob.plusYears(18)) ? "MINOR" : "ADULT";
    }
    static GuardianDtos.UpsertRequest normalize(GuardianDtos.UpsertRequest r) {
        if(r==null) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        String name=clean(r.fullName()),relation=clean(r.relationship()),email=clean(r.email()),phone=clean(r.phone());
        if(name==null || relation==null || name.length()>150 || relation.length()>100
                || (email==null && phone==null) || (email!=null && email.length()>254) || (phone!=null && phone.length()>20)
                || hasControl(name) || hasControl(relation) || hasControl(email) || hasControl(phone))
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        return new GuardianDtos.UpsertRequest(r.expectedRevision(),name,relation,
                email==null ? null : email.toLowerCase(java.util.Locale.ROOT),phone);
    }
    private static String clean(String value) { return value==null || value.isBlank() ? null : value.trim(); }
    private static boolean hasControl(String value) { return value!=null && value.codePoints().anyMatch(Character::isISOControl); }
    private void record(long actor,long vault,long beneficiary,String action,long revision) {
        audit.record(actor,vault,action,"BENEFICIARY",beneficiary,"USER",Map.of("revision",revision));
    }
}
