package com.legacyvault.verification.group;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.service.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.vault.entity.Vault;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;
import static com.legacyvault.common.error.ErrorCode.*;

@Service
public class GroupHandoverService {
 public record Body(Long expectedRevision,Set<UUID> presentRecipientIds,String reason) {}
 public record Receipt(UUID caseId,UUID sessionId,UUID eventId,GroupState state,com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {}
 public record View(GroupState state,String snapshot,Set<UUID> requiredRecipientIds,boolean deliveryAllowed) {}
 private final JdbcTemplate jdbc;
 private final ObjectMapper json;
 private final HandoverCompletionAccess completion;
 private final LegalWorkflowGuard workflow;
 private final HandoverSessionRepository sessions;
 private final LegalBasisReviewHistoryRepository history;
 private final AuditService audit;
 private final LegalBasisLockedState lockedState;
 public GroupHandoverService(JdbcTemplate jdbc,ObjectMapper json,HandoverCompletionAccess completion,
   LegalWorkflowGuard workflow,HandoverSessionRepository sessions,LegalBasisReviewHistoryRepository history,AuditService audit,LegalBasisLockedState lockedState){
  this.jdbc=jdbc;this.json=json;this.completion=completion;this.workflow=workflow;this.sessions=sessions;this.history=history;this.audit=audit;this.lockedState=lockedState;
 }
 private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Cannot encode group state",e);}}
 private GroupState decode(String value){try{return json.readValue(value,GroupState.class);}catch(Exception e){throw new IllegalStateException("Invalid persisted group state",e);}}
 private GroupState current(long caseId){
  var rows=jdbc.queryForList("SELECT TOP(1) state_json FROM dbo.handover_group_events WHERE case_id=? ORDER BY revision DESC",String.class,caseId);
  return rows.isEmpty()?GroupState.initial():decode(rows.get(0));
 }
 private HandoverCompletionAccess.Snapshot lock(UUID caseId,UUID sessionId,CustomUserPrincipal actor,boolean legal){
  if(!legal) return completion.lock(caseId,sessionId,actor,true);
  CustomUserPrincipal.requireUserId(actor);
  var locked=workflow.requireProtectedTransition(caseId,LegalWorkflowGuard.ProtectedTransition.APPROVAL);locked.requireOpen();
  var c=locked.verificationCase();
  if(c.getAssignedStaffUserId()==null) throw new BusinessException(RESOURCE_NOT_FOUND);
  var session=sessions.findByPublicIdAndCaseAndStaffForUpdate(sessionId,c.getVerificationCaseId(),c.getAssignedStaffUserId())
    .orElseThrow(()->new BusinessException(RESOURCE_NOT_FOUND));
  lockedState.refresh(session);
  if(session.getStatus()!=HandoverSessionStatus.OPEN) throw new BusinessException(HANDOVER_SESSION_INVALID_STATE);
  return completion.snapshot(locked,session);
 }
 private String fingerprint(HandoverCompletionAccess.Snapshot s){
  var approval=history.findFirstByDossierIdAndReviewStatusInOrderByIdDesc(s.locked().dossier().getLegalBasisDossierId(),
    List.of("LEGAL_APPROVED","LEGAL_REJECTED")).orElseThrow(()->new BusinessException(LEGAL_DECISION_STALE));
  return AllocationScopeHash.hashCanonicalValues(List.of(s.session().getPublicId().toString(),
    String.valueOf(s.locked().verificationCase().getAssignedStaffUserId()),
    String.valueOf(s.locked().verificationCase().getUpdatedAt()),String.valueOf(s.locked().dossier().getUpdatedAt()),String.valueOf(s.version().version()),
    s.version().sha256(),s.scopeHash(),approval.getPublicId().toString(),AllocationScopeHash.hashReceiptRows(s.rows())));
 }
 private Set<UUID> required(HandoverCompletionAccess.Snapshot s){
  return s.rows().stream().map(ReceiptAllocationRow::beneficiaryPublicId).collect(java.util.stream.Collectors.toUnmodifiableSet());
 }
 @Transactional
 public View view(UUID caseId,UUID sessionId,CustomUserPrincipal actor,boolean legal){
  var s=lock(caseId,sessionId,actor,legal);var state=current(s.locked().verificationCase().getVerificationCaseId());
  var hash=fingerprint(s);return new View(state,hash,required(s),state.allowed(hash));
 }
 @Transactional(propagation=Propagation.MANDATORY)
 public void requireReady(UUID caseId,UUID sessionId,CustomUserPrincipal actor){
  var v=view(caseId,sessionId,actor,false);
  if(!v.deliveryAllowed()) throw new BusinessException(GROUP_HANDOVER_BLOCKED);
 }
 @Transactional
 public Receipt mutate(UUID caseId,UUID sessionId,UUID requestId,UUID key,String operation,Body body,CustomUserPrincipal actor,boolean legal){
  long actorId=CustomUserPrincipal.requireUserId(actor);
  if(key==null || body==null || body.expectedRevision()==null || body.expectedRevision()<0 || body.reason()==null
    || body.reason().isBlank() || body.reason().length()>1000) throw new BusinessException(VALIDATION_FAILED);
  if((legal&&!Set.of("APPROVE","REJECT").contains(operation)) || (!legal&&!Set.of("ATTENDANCE","REQUEST").contains(operation)))
    throw new BusinessException(VALIDATION_FAILED);
  if(body.presentRecipientIds()!=null && body.presentRecipientIds().stream().anyMatch(Objects::isNull)) throw new BusinessException(VALIDATION_FAILED);
  var s=lock(caseId,sessionId,actor,legal);var c=s.locked().verificationCase();long id=c.getVerificationCaseId();
  var payload=AllocationScopeHash.hashCanonicalValues(List.of(sessionId.toString(),String.valueOf(requestId),operation,
    body.expectedRevision().toString(),body.reason(),encode(body.presentRecipientIds()==null?List.of():body.presentRecipientIds().stream().sorted().toList())));
  var replay=jdbc.queryForList("SELECT public_id,payload_hash,state_json FROM dbo.handover_group_events WHERE case_id=? AND actor_user_id=? AND idempotency_key=?",
    id,actorId,key.toString());
  if(!replay.isEmpty()){
   var row=replay.get(0);
   if(!payload.equals(row.get("payload_hash"))) throw new BusinessException(GROUP_HANDOVER_STALE);
   return new Receipt(caseId,sessionId,UUID.fromString(row.get("public_id").toString()),decode(row.get("state_json").toString()),null);
  }
  var before=current(id);
  if(before.revision()!=body.expectedRevision()) throw new BusinessException(GROUP_HANDOVER_STALE);
  var hash=fingerprint(s);var eventId=UUID.randomUUID();GroupState after;
  try{
   after=switch(operation){
    case "ATTENDANCE" -> {
     if(s.session().getStatus()!=HandoverSessionStatus.OPEN || body.presentRecipientIds()==null) throw new IllegalArgumentException();
     yield before.attendance(eventId,hash,required(s),body.presentRecipientIds());
    }
    case "REQUEST" -> before.request(eventId,hash);
    case "APPROVE","REJECT" -> before.decide(requestId,operation.equals("APPROVE"),hash);
    default -> throw new IllegalArgumentException();
   };
  }catch(IllegalArgumentException e){throw new BusinessException(VALIDATION_FAILED);}
   catch(IllegalStateException e){throw new BusinessException(GROUP_HANDOVER_BLOCKED);}
  // Audit and event persistence are part of the same transaction as the gate state.
  jdbc.update("INSERT INTO dbo.handover_group_events(public_id,case_id,session_id,actor_user_id,operation,idempotency_key,payload_hash,revision,state_json,present_json,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    eventId.toString(),id,s.session().getId(),actorId,operation,key.toString(),payload,after.revision(),encode(after),
    encode(body.presentRecipientIds()==null?Set.of():body.presentRecipientIds()),body.reason().trim());
  audit.record(new AuditEvent(AuditAction.HANDOVER_GROUP_CHANGED,AuditActorType.USER,actorId,s.locked().vault().getVaultId(),
    "HANDOVER_SESSION",s.session().getId(),before.status(),after.status(),null,
    Map.of("casePublicId",caseId.toString(),"eventPublicId",eventId.toString(),"operation",operation),"GROUP_HANDOVER","PS-120"));
  return new Receipt(caseId,sessionId,eventId,after,null);
 }
}
