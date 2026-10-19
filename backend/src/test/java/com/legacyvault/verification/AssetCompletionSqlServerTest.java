package com.legacyvault.verification;
import com.legacyvault.verification.service.AssetCompletionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEGAL_SQLSERVER_MASTER_URL",matches=".*databaseName=master;.*")
class AssetCompletionSqlServerTest extends HandoverCompletionSqlSupport {
 @Test void realSnapshotProgressTracksDeliveryAndCannotBorrowAnotherCase(){
  var r=ready(false);var other=ready(true);var service=context.getBean(AssetCompletionService.class);
  var pending=service.get(r.f().publicCaseId(),r.session(),r.f().legal());
  assertEquals(1,pending.total());assertEquals(0,pending.completed());assertFalse(pending.complete());
  deliver(r);
  assertTrue(service.get(r.f().publicCaseId(),r.session(),r.f().legal()).complete());
  assertThrows(com.legacyvault.common.error.BusinessException.class,()->
   service.get(r.f().publicCaseId(),other.session(),r.f().legal()));
 }
}
