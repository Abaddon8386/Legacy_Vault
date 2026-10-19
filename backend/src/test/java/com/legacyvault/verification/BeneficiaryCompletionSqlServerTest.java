package com.legacyvault.verification;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.dto.ConfirmBeneficiaryRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class BeneficiaryCompletionSqlServerTest extends HandoverCompletionSqlSupport {
 @Test void deliveryDoesNotCountAsConfirmationAndUnverifiedRecipientStaysInDenominator(){
  var r=ready(true);var gate=context.getBean(BeneficiaryCompletionService.class);
  var p=gate.get(r.f().publicCaseId(),r.session(),r.f().legal());
  assertEquals(1,p.total());assertEquals(0,p.completed());assertFalse(p.complete());
  context.getBean(BeneficiaryReconciliationService.class).confirm(r.f().publicCaseId(),r.session(),
   r.recipient(),new ConfirmBeneficiaryRequest("REF"),r.f().legal());
  assertTrue(gate.get(r.f().publicCaseId(),r.session(),r.f().legal()).complete());
  jdbc.update("UPDATE dbo.beneficiaries SET id_verification_status='NOT_VERIFIED' WHERE public_id=?",r.recipient().toString());
  var revoked=gate.get(r.f().publicCaseId(),r.session(),r.f().legal());
  assertEquals(1,revoked.total());assertEquals(0,revoked.completed());assertFalse(revoked.complete());
 }
 @Test void confirmationFromCancelledSessionDoesNotSatisfyNewSession(){
  var r=ready(true);
  context.getBean(BeneficiaryReconciliationService.class).confirm(r.f().publicCaseId(),r.session(),
   r.recipient(),new ConfirmBeneficiaryRequest("REF"),r.f().legal());
  context.getBean(HandoverSessionService.class).updateStatus(r.f().publicCaseId(),r.session(),
   new com.legacyvault.verification.dto.HandoverSessionStatusRequest(
    com.legacyvault.verification.dto.HandoverSessionStatusRequest.TerminalStatus.CANCELLED),r.f().legal());
  var next=context.getBean(HandoverSessionService.class).open(r.f().publicCaseId(),r.f().legal()).sessionId();
  assertFalse(context.getBean(BeneficiaryCompletionService.class).get(r.f().publicCaseId(),next,r.f().legal()).complete());
 }
}
