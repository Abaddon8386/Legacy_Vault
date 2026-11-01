package com.legacyvault.verification.service;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.handover.policy.DualCompletionGate;
import com.legacyvault.verification.dto.HandoverCompletionResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.UUID;
@Service
public class HandoverCompletionService {
 private final HandoverCompletionAccess access;
 private final AssetCompletionService assets;
 private final BeneficiaryCompletionService beneficiaries;
 public HandoverCompletionService(HandoverCompletionAccess access,AssetCompletionService assets,
  BeneficiaryCompletionService beneficiaries){this.access=access;this.assets=assets;this.beneficiaries=beneficiaries;}
 @Transactional
 public HandoverCompletionResponse get(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  return evaluate(access.read(caseId,sessionId,actor));
 }
 @Transactional(propagation=Propagation.MANDATORY)
 public HandoverCompletionResponse evaluate(HandoverCompletionAccess.Snapshot snapshot){
  var a=assets.calculate(snapshot);var b=beneficiaries.calculate(snapshot);
  var result=DualCompletionGate.evaluate(a.completed(),a.total(),b.completed(),b.total());
  return new HandoverCompletionResponse(a,b,result==DualCompletionGate.Result.READY,result.name());
 }
 @Transactional(propagation=Propagation.MANDATORY)
 public HandoverCompletionResponse requireReady(HandoverCompletionAccess.Snapshot snapshot){
  var result=evaluate(snapshot);
  if(!result.ready())throw new BusinessException(ErrorCode.HANDOVER_COMPLETION_PENDING);
  return result;
 }
}
