package com.legacyvault.verification;
import com.legacyvault.verification.repository.ReceiptAllocationRow;
import com.legacyvault.verification.service.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class AssetCompletionServiceTest {
 private final AssetCompletionService service=new AssetCompletionService(null);
 private final UUID asset=UUID.randomUUID();
 private ReceiptAllocationRow row(long id,UUID recipient){return new ReceiptAllocationRow(1,id,1L,asset,id,
  recipient,"NOT_VERIFIED","APPROVED",null);}
 @Test void sharedAssetRequiresEveryRecipientEvenUnverifiedRecipient(){
  var rows=List.of(row(1,UUID.randomUUID()),row(2,UUID.randomUUID()));
  var partial=service.calculate(new HandoverCompletionAccess.Snapshot(null,null,null,null,rows,Set.of(1L)));
  assertEquals(1,partial.total());assertEquals(0,partial.completed());assertFalse(partial.complete());
  var done=service.calculate(new HandoverCompletionAccess.Snapshot(null,null,null,null,rows,Set.of(1L,2L)));
  assertTrue(done.complete());assertEquals(1,done.completed());
 }
 @Test void outOfScopeDeliveryCannotSatisfyMissingAllocation(){
  var p=service.calculate(new HandoverCompletionAccess.Snapshot(null,null,null,null,
   List.of(row(1,UUID.randomUUID())),Set.of(99L)));
  assertEquals(0,p.completed());assertEquals(1,p.pending());
 }
 @Test void emptyScopeIsNotComplete(){
  assertFalse(service.calculate(new HandoverCompletionAccess.Snapshot(null,null,null,null,List.of(),Set.of())).complete());
 }
}
