package com.legacyvault.verification.service;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.handover.policy.AssetCompletionProgress;
import com.legacyvault.verification.dto.CompletionProgressResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;
@Service
public class AssetCompletionService {
 private final HandoverCompletionAccess access;
 public AssetCompletionService(HandoverCompletionAccess access){this.access=access;}
 @Transactional
 public CompletionProgressResponse get(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  return calculate(access.lock(caseId,sessionId,actor,true));
 }
 /** An asset shared by multiple recipients is delivered only when ALL approved allocation lines are delivered. */
 public CompletionProgressResponse calculate(HandoverCompletionAccess.Snapshot snapshot){
  var byAsset=snapshot.rows().stream().collect(java.util.stream.Collectors.groupingBy(
   com.legacyvault.verification.repository.ReceiptAllocationRow::assetPublicId));
  var delivered=byAsset.entrySet().stream().filter(e->e.getValue().stream()
   .allMatch(row->snapshot.delivered().contains(row.allocationId()))).map(Map.Entry::getKey).toList();
  var p=AssetCompletionProgress.from(byAsset.keySet(),delivered);
  return new CompletionProgressResponse(p.delivered(),p.total(),p.pending(),p.allDelivered());
 }
}
