package com.legacyvault.verification;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.dto.ConfirmBeneficiaryRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class HandoverCompletionSqlServerTest extends HandoverCompletionSqlSupport {
 @Test void bothGatesReadTheSameApprovedSnapshot(){
  var r=ready(false);var service=context.getBean(HandoverCompletionService.class);
  assertFalse(service.get(r.f().publicCaseId(),r.session(),r.f().legal()).ready());
  deliver(r);
  var deliveredOnly=service.get(r.f().publicCaseId(),r.session(),r.f().legal());
  assertTrue(deliveredOnly.assets().complete());assertFalse(deliveredOnly.beneficiaries().complete());
  context.getBean(BeneficiaryReconciliationService.class).confirm(r.f().publicCaseId(),r.session(),r.recipient(),
   new ConfirmBeneficiaryRequest("REF"),r.f().legal());
  assertTrue(service.get(r.f().publicCaseId(),r.session(),r.f().legal()).ready());
 }
}
