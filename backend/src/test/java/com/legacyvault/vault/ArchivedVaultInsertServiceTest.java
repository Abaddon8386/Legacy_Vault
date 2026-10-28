package com.legacyvault.vault;

import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.beneficiary.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.*;
import com.legacyvault.dms.*;
import com.legacyvault.trustee.*;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;
import com.legacyvault.will.repository.*;
import com.legacyvault.will.service.WillService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Actual VaultService guard, not a mocked "always reject" guard: refresh turns cached ACTIVE into ARCHIVED. */
class ArchivedVaultInsertServiceTest {
    private final UUID vaultId=UUID.randomUUID();
    private final Vault vault=new Vault();
    private final VaultRepository vaults=mock(VaultRepository.class);
    private final EntityManager entities=mock(EntityManager.class);
    private final User owner=mock(User.class);
    private final OwnerContextService owners=mock(OwnerContextService.class);
    private final com.legacyvault.common.audit.AuditService audit=mock(com.legacyvault.common.audit.AuditService.class);
    private final com.legacyvault.audit.AuditService contentAudit=mock(com.legacyvault.audit.AuditService.class);
    private final DmsConfigRepository configs=mock(DmsConfigRepository.class);
    private final BeneficiaryRepository beneficiaries=mock(BeneficiaryRepository.class);
    private final AssetRepository assetRepository=mock(AssetRepository.class);
    private final WillAssetRepository willAssetRepository=mock(WillAssetRepository.class);
    private final TrusteeRepository trustees=mock(TrusteeRepository.class);
    private final VaultService guard=new VaultService(vaults,contentAudit,configs,
            mock(com.legacyvault.verification.repository.VerificationCaseRepository.class),
            mock(com.legacyvault.user.repository.OwnerWriteLockRepository.class),entities);

    ArchivedVaultInsertServiceTest(){
        ReflectionTestUtils.setField(vault,"vaultId",5L);ReflectionTestUtils.setField(vault,"publicId",vaultId);
        ReflectionTestUtils.setField(vault,"ownerUserId",1L);ReflectionTestUtils.setField(vault,"status","ACTIVE");
        when(vaults.findOwnedVaultForUpdate(vaultId,1L)).thenReturn(Optional.of(vault));
        when(vaults.findByOwnerUserId(eq(1L),any())).thenReturn(new PageImpl<>(List.of(vault)));
        when(owner.getUserId()).thenReturn(1L);when(owners.requireOwner()).thenReturn(owner);
        doAnswer(i->{ReflectionTestUtils.setField(vault,"status","ARCHIVED");return null;})
                .when(entities).refresh(vault);
    }
    private void blocked(Runnable write){
        assertEquals(ErrorCode.VAULT_NOT_EDITABLE,assertThrows(BusinessException.class,write::run).getErrorCode());
        verify(vaults).findOwnedVaultForUpdate(vaultId,1L);verify(entities).refresh(vault);
        verifyNoInteractions(audit,contentAudit);
    }
    @Test void trusteeInsertRefreshesLockedVaultBeforeAnyRepositoryWrite(){
        var service=new TrusteeService(trustees,guard,owners,audit);
        blocked(()->service.create(new TrusteeDtos.CreateRequest(vaultId,"Trustee","0900000000",null,null,null)));
        verifyNoInteractions(trustees);
    }
    @Test void beneficiaryInsertRefreshesLockedVaultBeforeEncryptionOrSave(){
        var cipher=mock(IdentityNumberCipher.class);
        var service=new BeneficiaryService(beneficiaries,guard,owners,cipher,audit,
                mock(com.legacyvault.common.i18n.MessageService.class),mock(com.legacyvault.beneficiary.BeneficiaryInvitationService.class),entities);
        blocked(()->service.create(vaultId,new BeneficiaryDtos.UpsertRequest("Beneficiary",null,null,null,null,null)));
        verifyNoInteractions(beneficiaries,cipher);
    }
    @Test void assetInsertCannotUseCachedActiveVault(){
        var assets=mock(AssetRepository.class);
        var crypto=mock(com.legacyvault.common.crypto.EncryptionService.class);
        var service=new AssetService(assets,guard,crypto,contentAudit,mock(PasswordReauthService.class),
                mock(com.legacyvault.subscription.service.OwnerQuotaService.class),entities);
        blocked(()->service.createAsset(vaultId,1L,new CreateAssetRequest("Asset","TEXT",null,"fixture")));
        verifyNoInteractions(assets,crypto);
    }
    @Test void willInsertCannotUseCachedActiveVault(){
        var assets=mock(WillAssetRepository.class);var versions=mock(AssetVersionRepository.class);
        var documents=mock(LegalDocumentRepository.class);
        var service=new WillService(assets,versions,documents,guard,
                mock(com.legacyvault.common.crypto.EncryptionService.class),contentAudit,
                mock(PasswordReauthService.class),10485760,mock(com.legacyvault.subscription.service.OwnerQuotaService.class));
        var file=new MockMultipartFile("file","fixture.pdf","application/pdf","%PDF-1.4".getBytes());
        blocked(()->service.uploadWill(vaultId,1L,file,null));
        verifyNoInteractions(assets,versions,documents);
    }
    @Test void dmsConfigurationCannotInsertAfterArchive(){
        var service=new DmsService(configs,beneficiaries,assetRepository,willAssetRepository,vaults,guard,owners,new DmsPolicy(1,32767,1),audit);
        blocked(()->service.configure(new DmsDtos.ConfigureRequest(30)));
        verifyNoInteractions(configs,beneficiaries);
    }
    @Test void dmsCheckInCannotAppendAuditOrCheckLogAfterArchive(){
        var service=new DmsService(configs,beneficiaries,assetRepository,willAssetRepository,vaults,guard,owners,new DmsPolicy(1,32767,1),audit);
        blocked(service::checkIn);verifyNoInteractions(configs);
    }
}
