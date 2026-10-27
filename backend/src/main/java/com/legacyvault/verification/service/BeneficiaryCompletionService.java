package com.legacyvault.verification.service;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.handover.policy.BeneficiaryCompletionProgress;
import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.verification.dto.CompletionProgressResponse;
import com.legacyvault.verification.repository.BeneficiaryConfirmationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;
@Service
public class BeneficiaryCompletionService {
 private final HandoverCompletionAccess access;
 private final BeneficiaryConfirmationRepository confirmations;
 public BeneficiaryCompletionService(HandoverCompletionAccess access,BeneficiaryConfirmationRepository confirmations){
  this.access=access;this.confirmations=confirmations;
 }
 @Transactional
 public CompletionProgressResponse get(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  return calculate(access.read(caseId,sessionId,actor));
 }
 @Transactional(propagation=Propagation.MANDATORY)
 public CompletionProgressResponse calculate(HandoverCompletionAccess.Snapshot s){
  var rows=s.rows();
  var recorded=confirmations.findBySessionIdAndVersionIdAndScopeHash(s.session().getId(),
   s.version().id(),s.scopeHash()).stream().map(c->c.getBeneficiaryId()).collect(java.util.stream.Collectors.toSet());
  var relevant=rows.stream().map(r->r.beneficiaryPublicId()).distinct().toList();
  // A revoked identity check cannot be hidden from the gate by dropping its recipient from scope.
  var confirmed=rows.stream().filter(r->recorded.contains(r.beneficiaryId())
   && Beneficiary.VERIFIED_AT_COUNTER.equals(r.beneficiaryIdentityVerificationStatus()))
   .map(r->r.beneficiaryPublicId()).distinct().toList();
  var p=BeneficiaryCompletionProgress.from(relevant,confirmed);
  return new CompletionProgressResponse(p.confirmed(),p.total(),p.pending(),p.allConfirmed());
 }
}
