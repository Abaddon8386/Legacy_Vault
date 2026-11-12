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

/**
 * Dịch vụ người giám hộ cho người thụ hưởng chưa đủ 18 tuổi, gọi từ {@code GuardianController}. Quyền: Owner sở hữu Vault.
 * Ghi dùng khóa Vault và khóa lạc quan theo {@code guardian_revision}. Audit {@code BENEFICIARY_GUARDIAN_RECORDED}, {@code BENEFICIARY_GUARDIAN_REVOKED}.
 */
@Service
public class GuardianService {
    /**
     * Múi giờ dùng để tính tuổi (cũng dùng bởi {@code BeneficiaryBirthDate}).
     */
    static final ZoneId AGE_ZONE=ZoneId.of("Asia/Ho_Chi_Minh");
    private final OwnerContextService owners;
    private final VaultService vaults;
    private final BeneficiaryRepository beneficiaries;
    private final GuardianRepository guardians;
    private final AuditService audit;
    private final EntityManager entities;
    /**
     * Hàm khởi tạo, Spring tiêm các phụ thuộc.
     */
    public GuardianService(OwnerContextService owners,VaultService vaults,BeneficiaryRepository beneficiaries,
            GuardianRepository guardians,AuditService audit,EntityManager entities) {
        this.owners=owners; this.vaults=vaults; this.beneficiaries=beneficiaries;
        this.guardians=guardians; this.audit=audit; this.entities=entities;
    }
    /**
     * Xem ngữ cảnh người giám hộ. Endpoint: {@code GET .../guardian}.
     * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND}
     */
    @Transactional(readOnly=true)
    public GuardianDtos.Context read(UUID vaultId,UUID beneficiaryId) {
        var owner=owners.requireOwner();
        var vault=vaults.requireOwnedVault(vaultId,owner.getUserId());
        return context(find(beneficiaryId,vault.getVaultId()));
    }
    /**
     * Lịch sử người giám hộ. Endpoint: {@code GET .../guardian/history}.
     * @throws com.legacyvault.common.error.BusinessException {@code VALIDATION_FAILED} nếu page/size ngoài phạm vi
     */
    @Transactional(readOnly=true)
    public PageEnvelope<GuardianDtos.Guardian> history(UUID vaultId,UUID beneficiaryId,int page,int size) {
        if(page<0 || size<1 || size>100) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var owner=owners.requireOwner();
        var vault=vaults.requireOwnedVault(vaultId,owner.getUserId());
        return guardians.history(find(beneficiaryId,vault.getVaultId()).getId(),page,size);
    }
    /**
     * Lưu/thay thế người giám hộ. Các bước: khóa Vault, refresh người thụ hưởng, chuẩn hóa dữ liệu, tăng phiên bản (khóa lạc quan),
     * kết thúc người cũ với lý do REPLACED, thêm người mới, audit. Endpoint: {@code PUT .../guardian}.
     * @throws com.legacyvault.common.error.BusinessException {@code BENEFICIARY_GUARDIAN_STALE} nếu phiên bản lệch, {@code VALIDATION_FAILED} nếu dữ liệu sai
     */
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
    /**
     * Thu hồi người giám hộ: tăng phiên bản, kết thúc bản ghi với lý do REVOKED, audit. Endpoint: {@code POST .../guardian/revoke}.
     * @throws com.legacyvault.common.error.BusinessException {@code BENEFICIARY_GUARDIAN_STALE}, {@code VALIDATION_FAILED}
     */
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
    /**
     * Tăng phiên bản; {@code VALIDATION_FAILED} nếu phiên bản không hợp lệ, {@code BENEFICIARY_GUARDIAN_STALE} nếu đã lệch.
     */
    private void advance(long beneficiary,Long revision) {
        if(revision==null || revision<0 || revision==Long.MAX_VALUE) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        if(!guardians.advance(beneficiary,revision)) throw new BusinessException(ErrorCode.BENEFICIARY_GUARDIAN_STALE);
    }
    /**
     * Tìm người thụ hưởng trong Vault, nếu không có thì {@code RESOURCE_NOT_FOUND}.
     */
    private Beneficiary find(UUID id,long vault) {
        return beneficiaries.findByPublicIdAndVault_VaultId(id,vault).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }
    /**
     * Dựng ngữ cảnh: đọc trạng thái, tính tuổi và cảnh báo (thiếu ngày sinh hoặc đề xuất người giám hộ cho người chưa thành niên).
     */
    private GuardianDtos.Context context(Beneficiary beneficiary) {
        var state=guardians.state(beneficiary.getId());
        LocalDate today=LocalDate.now(AGE_ZONE);
        String age=ageStatus(beneficiary.getDateOfBirth(),today);
        String warning="UNKNOWN".equals(age) ? "BENEFICIARY_DOB_REQUIRED"
                : "MINOR".equals(age) && state.guardian()==null ? "BENEFICIARY_GUARDIAN_RECOMMENDED" : null;
        return new GuardianDtos.Context(beneficiary.getPublicId(),state.revision(),today,AGE_ZONE.getId(),age,
                "MINOR".equals(age),warning,state.guardian());
    }
    /**
     * @return {@code UNKNOWN} nếu thiếu hoặc ngày sinh ở tương lai, {@code MINOR} nếu dưới 18 tuổi, ngược lại {@code ADULT}.
     */
    static String ageStatus(LocalDate dob,LocalDate today) {
        if(dob==null || dob.isAfter(today)) return "UNKNOWN";
        return today.isBefore(dob.plusYears(18)) ? "MINOR" : "ADULT";
    }
    /**
     * Làm sạch và kiểm tra: cắt khoảng trắng, độ dài tối đa, cần ít nhất email hoặc phone, không chứa ký tự điều khiển; email về chữ thường.
     * @throws com.legacyvault.common.error.BusinessException {@code VALIDATION_FAILED}
     */
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
    /**
     * Cắt khoảng trắng; chuỗi trống thành null.
     */
    private static String clean(String value) { return value==null || value.isBlank() ? null : value.trim(); }
    /**
     * Kiểm tra chuỗi có ký tự điều khiển ISO hay không.
     */
    private static boolean hasControl(String value) { return value!=null && value.codePoints().anyMatch(Character::isISOControl); }
    /**
     * Ghi audit đối tượng {@code BENEFICIARY} với chi tiết phiên bản.
     */
    private void record(long actor,long vault,long beneficiary,String action,long revision) {
        audit.record(actor,vault,action,"BENEFICIARY",beneficiary,"USER",Map.of("revision",revision));
    }
}
