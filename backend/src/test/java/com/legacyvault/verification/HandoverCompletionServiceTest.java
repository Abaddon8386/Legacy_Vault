package com.legacyvault.verification;
import com.legacyvault.common.error.*;
import com.legacyvault.verification.dto.CompletionProgressResponse;
import com.legacyvault.verification.service.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
class HandoverCompletionServiceTest {
 final AssetCompletionService assets=mock(AssetCompletionService.class);
 final BeneficiaryCompletionService beneficiaries=mock(BeneficiaryCompletionService.class);
 final HandoverCompletionService service=new HandoverCompletionService(null,assets,beneficiaries);
 final HandoverCompletionAccess.Snapshot snapshot=new HandoverCompletionAccess.Snapshot(null,null,null,null,List.of(),Set.of());
 void values(int a,int at,int b,int bt){
  when(assets.calculate(snapshot)).thenReturn(new CompletionProgressResponse(a,at,at-a,a==at&&at>0));
  when(beneficiaries.calculate(snapshot)).thenReturn(new CompletionProgressResponse(b,bt,bt-b,b==bt&&bt>0));
 }
 @Test void oneSnapshotFeedsBothSidesAndBothCompletePass(){
  values(2,2,1,1);assertTrue(service.requireReady(snapshot).ready());
  verify(assets).calculate(same(snapshot));verify(beneficiaries).calculate(same(snapshot));
 }
 @Test void neitherOneSidedCompletionNorEmptyScopeMayClose(){
  for(int[] v:new int[][]{{2,2,0,1},{1,2,1,1},{0,0,0,0},{1,1,0,0}}){
   values(v[0],v[1],v[2],v[3]);
   assertEquals(ErrorCode.HANDOVER_COMPLETION_PENDING,
    assertThrows(BusinessException.class,()->service.requireReady(snapshot)).getErrorCode());
  }
 }
 @Test void aHundredPercentRoundedDisplayCannotOverridePendingCount(){
  values(999,1000,1,1);
  assertFalse(service.evaluate(snapshot).ready());assertEquals("ASSETS_PENDING",service.evaluate(snapshot).reason());
 }
}
