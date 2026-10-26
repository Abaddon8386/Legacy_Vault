package com.legacyvault.verification;
import com.legacyvault.verification.service.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.web.MockMultipartFile;
import java.util.*;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class SignedReceiptSqlServerTest extends HandoverCompletionSqlSupport {
 private SignedReceiptService service(){return context.getBean(SignedReceiptService.class);}
 private MockMultipartFile file(){return new MockMultipartFile("file","signed-demo.pdf","application/pdf","%PDF-1.4 signed fixture".getBytes(StandardCharsets.UTF_8));}
 @Test void mandatoryEvidenceAttestationAndDelivery(){
  var r=ready(false);
  assertThrows(BusinessException.class,()->service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),file(),false,null,r.f().legal()));
  assertThrows(BusinessException.class,()->service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),null,true,null,r.f().legal()));
  assertThrows(BusinessException.class,()->service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),new MockMultipartFile("file","fake.pdf","application/pdf","html".getBytes()),true,null,r.f().legal()));
  assertEquals(ErrorCode.HANDOVER_CONFIRMATION_PENDING_DELIVERY,assertThrows(BusinessException.class,()->service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),file(),true,null,r.f().legal())).getErrorCode());
 }
 @Test void encryptedAtomicReceiptRetryScopeAndArchivedRead() throws Exception {
  var r=ready(true);
  var first=service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),file(),true,"PAPER-1",r.f().legal());
  assertTrue(first.hasSignedFile()); assertTrue(first.receiptReference().startsWith("BN-")); assertNotEquals("PAPER-1",first.receiptReference());
  var retry=service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),file(),true,"PAPER-1",r.f().legal());
  assertEquals(first.confirmationId(),retry.confirmationId()); assertTrue(retry.hasSignedFile());
  assertArrayEquals(file().getBytes(),service().read(r.f().publicCaseId(),r.session(),first.confirmationId(),r.f().legal()).content());
  assertThrows(BusinessException.class,()->service().read(r.f().publicCaseId(),UUID.randomUUID(),first.confirmationId(),r.f().legal()));
  var wrong=new CustomUserPrincipal(r.f().userId()+999,UUID.randomUUID(),"other@example.test");
  assertThrows(BusinessException.class,()->service().read(r.f().publicCaseId(),r.session(),first.confirmationId(),wrong));
  var changed=new MockMultipartFile("file","other.pdf","application/pdf","%PDF-1.4 different".getBytes());
  assertThrows(BusinessException.class,()->service().confirm(r.f().publicCaseId(),r.session(),r.recipient(),changed,true,null,r.f().legal()));
  jdbc.update("UPDATE dbo.vaults SET status='ARCHIVED' WHERE vault_id=?",r.f().vaultId());
  assertArrayEquals(file().getBytes(),service().read(r.f().publicCaseId(),r.session(),first.confirmationId(),r.f().legal()).content());
 }
}
