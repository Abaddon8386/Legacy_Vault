package com.legacyvault.subscription;

import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.service.AssetImageService;
import com.legacyvault.common.error.*;
import com.legacyvault.subscription.service.AdminSubscriptionService;
import com.legacyvault.subscription.dto.AdminSubscriptionDtos.*;
import com.legacyvault.subscription.service.SubscriptionUpgradeService;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import com.legacyvault.vault.dto.CreateVaultRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Uses the existing guarded, disposable SQL Server harness. Run only lifetime* methods. */
@EnabledIfEnvironmentVariable(named = "PS77_SQLSERVER_TEST_DATABASE", matches = "LegacyVault_PS77_[A-Za-z0-9_]+")
class LifetimeImagesSqlServerTest extends SubscriptionSqlServerTest {
    private MockMultipartFile photo() throws Exception {
        var bytes=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB),"png",bytes);
        return new MockMultipartFile("images","photo.png","image/png",bytes.toByteArray());
    }
    private org.springframework.test.web.servlet.request.RequestPostProcessor actor(String role) {
        return authentication(new UsernamePasswordAuthenticationToken(owner.principal(),null,List.of(new SimpleGrantedAuthority("ROLE_"+role))));
    }
    @Test void lifetimePhotosRoundTripQuotaEncryptionAndOwnership() throws Exception {
        var vault=vaults.createVault(new CreateVaultRequest("Photos",null),owner.principal());
        var file=photo();
        var metadata=new MockMultipartFile("asset","","application/json","{\"name\":\"Photo asset\",\"assetType\":\"TEXT\",\"payload\":\"value\"}".getBytes());
        var result=mvc.perform(multipart("/api/v1/vaults/"+vault.id()+"/assets/with-images").file(metadata).file(file).with(actor("VAULT_OWNER")))
            .andExpect(status().isCreated()).andReturn();
        var data=new com.fasterxml.jackson.databind.ObjectMapper().readTree(result.getResponse().getContentAsString());
        UUID asset=UUID.fromString(data.get("id").asText());
        var service=context.getBean(AssetImageService.class);
        var image=service.list(vault.id(),asset,owner.id()).get(0);
        assertEquals(file.getSize()+5,quotas.current(owner.id()).usage().storageBytes());
        byte[] ciphertext=jdbc.queryForObject("SELECT encrypted_content FROM dbo.asset_images WHERE public_id=?",byte[].class,image.id().toString());
        assertFalse(Arrays.equals(file.getBytes(),ciphertext));
        jdbc.update("UPDATE dbo.users SET password_hash=? WHERE user_id=?",new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("12345678"),owner.id());
        mvc.perform(post("/api/v1/vaults/"+vault.id()+"/assets/"+asset+"/images/"+image.id()+"/download")
            .with(actor("VAULT_OWNER")).contentType("application/json").content("{\"password\":\"12345678\"}"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(content().bytes(file.getBytes()));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND,assertThrows(BusinessException.class,()->service.list(vault.id(),asset,owner.id()+100000)).getErrorCode());
        mvc.perform(get("/api/v1/vaults/"+vault.id()+"/assets/"+asset+"/images").with(actor("STAFF_EXECUTOR"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/vaults/"+vault.id()+"/assets/"+asset+"/images")).andExpect(status().isUnauthorized());
        service.delete(vault.id(),asset,image.id(),owner.id());
        assertEquals(5,quotas.current(owner.id()).usage().storageBytes());
        assertEquals(0,service.list(vault.id(),asset,owner.id()).size());
    }
    @Test void lifetimeAtomicCreationAndConcurrentFivePhotoLimit() throws Exception {
        var vault=vaults.createVault(new CreateVaultRequest("Atomic photos",null),owner.principal());
        var service=context.getBean(AssetImageService.class);
        var request=new CreateAssetRequest("Test","TEXT",null,"value");
        assertThrows(BusinessException.class,()->service.create(vault.id(),owner.id(),request,
            List.of(new MockMultipartFile("images","bad.png","image/png","fake".getBytes()))));
        assertEquals(0,quotas.current(owner.id()).usage().assetCount());
        var asset=service.create(vault.id(),owner.id(),request,List.of(photo()));
        var file=photo();var start=new CountDownLatch(1);
        Callable<String> upload=()->{ start.await(); try {service.add(vault.id(),asset.id(),owner.id(),List.of(file,file,file));return "ok";}
            catch(BusinessException e){return e.getErrorCode().name();} };
        var a=workers.submit(upload);var b=workers.submit(upload);start.countDown();
        var results=List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));
        assertTrue(results.contains("ok"));assertTrue(results.contains("ASSET_IMAGE_LIMIT_EXCEEDED"));
        assertEquals(4,service.list(vault.id(),asset.id(),owner.id()).size());
    }
    @Test void lifetimeAdminPublishRetireHistoryAndStaleUpdate() {
        var service=context.getBean(AdminSubscriptionService.class);
        var detail=service.getPlanDetail("STANDARD");
        assertTrue(detail.versions().stream().anyMatch(v->"MONTHLY".equals(v.billingModel()) && Long.valueOf(29000).equals(v.legacyMonthlyPriceVnd())));
        var source=detail.versions().stream().filter(v->"PUBLISHED".equals(v.status())).findFirst().orElseThrow();
        assertEquals(499000,source.purchasePriceVnd());
        var draft=service.createDraftVersion("STANDARD",new CreateDraftRequest(source.id(),"integration review"),owner.id(),"127.0.0.1");
        var edit=new UpdatePlanVersionRequest("Tiêu chuẩn","Standard","mô tả","description",499000L,"LIFETIME",50L,1073741824L,10485760L,draft.concurrencyToken(),"edit");
        var saved=service.updateDraftVersion("STANDARD",draft.version(),edit,owner.id(),"127.0.0.1");
        assertTrue(saved.concurrencyToken()>draft.concurrencyToken());
        assertEquals(ErrorCode.PLAN_VERSION_CONFLICT,assertThrows(BusinessException.class,()->service.updateDraftVersion("STANDARD",draft.version(),edit,owner.id(),"127.0.0.1")).getErrorCode());
        service.publishVersion("STANDARD",draft.version(),owner.id(),"127.0.0.1");
        assertEquals(499000,jdbc.queryForObject("SELECT purchase_price_vnd FROM dbo.subscription_plans WHERE plan_code='STANDARD'",Long.class));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.subscription_plan_versions WHERE plan_code='STANDARD' AND status='PUBLISHED'",Integer.class));
        service.deprecateVersion("STANDARD",draft.version(),owner.id(),"127.0.0.1");
        assertTrue(quotas.catalog().stream().noneMatch(p->p.code().equals("STANDARD")));
        assertEquals(source.purchasePriceVnd(),service.getPlanVersion("STANDARD",source.version()).purchasePriceVnd());
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='SUBSCRIPTION_PLAN_DRAFT_UPDATED' AND state_before LIKE '%purchasePriceVnd%'",Integer.class)>0);
        // Restore availability for other tests by publishing a fresh version, preserving retired history.
        var restore=service.createDraftVersion("STANDARD",new CreateDraftRequest(saved.id(),"restore"),owner.id(),"127.0.0.1");
        service.publishVersion("STANDARD",restore.version(),owner.id(),"127.0.0.1");
    }
    @Test void lifetimeFullPriceQuoteNeverGrantsPaidAccess() {
        var target=quotas.catalog().stream().filter(p->p.code().equals("EXTENDED")).findFirst().orElseThrow();
        assertTrue(target.version()>2, "New pricing must invalidate the previous version-2 catalog quotes");
        assertEquals(ErrorCode.SUBSCRIPTION_CATALOG_STALE,assertThrows(BusinessException.class,()->context.getBean(SubscriptionUpgradeService.class)
            .quote(owner.id(),new UpgradeRequest(PlanCode.EXTENDED,2))).getErrorCode());
        var quote=context.getBean(SubscriptionUpgradeService.class).quote(owner.id(),new UpgradeRequest(PlanCode.EXTENDED,target.version()));
        assertEquals(999000,quote.amountVnd());assertEquals(0,quote.previousPurchaseCreditVnd());
        assertFalse(quote.paymentAvailable());assertEquals("BASIC",quotas.current(owner.id()).effectivePlan().code());
    }
    @Test void lifetimeConcurrentAdminDraftsHaveOneWinner() throws Exception {
        var service=context.getBean(AdminSubscriptionService.class);
        var source=service.getPlanDetail("EXTENDED").versions().stream().filter(v->"PUBLISHED".equals(v.status())).findFirst().orElseThrow();
        var start=new CountDownLatch(1);
        Callable<String> create=()->{start.await();try{service.createDraftVersion("EXTENDED",new CreateDraftRequest(source.id(),"parallel"),owner.id(),"127.0.0.1");return "ok";}
            catch(BusinessException e){return e.getErrorCode().name();}};
        var a=workers.submit(create);var b=workers.submit(create);start.countDown();
        var results=List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));
        assertTrue(results.contains("ok"));assertTrue(results.contains("PLAN_VERSION_ALREADY_EXISTS"));
        var draft=service.getPlanDetail("EXTENDED").versions().stream().filter(v->"DRAFT".equals(v.status())).findFirst().orElseThrow();
        service.publishVersion("EXTENDED",draft.version(),owner.id(),"127.0.0.1");
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.subscription_plan_versions WHERE plan_code='EXTENDED' AND status='PUBLISHED'",Integer.class));
    }
}
