package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditService.RecordedEvent;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class WorkflowNotificationService {
 private static final Set<String> ACTIONS=Set.of("VERIFICATION_CASE_CLAIMED","DEATH_DOCUMENT_RECORDED","ORIGINAL_WILL_RECEIVED","INTAKE_ATTACHMENT_UPLOADED",
  "LEGAL_DEATH_DOCUMENT_DECIDED","WILL_COMPARISON_RECORDED","LEGAL_BASIS_RECEIVED","LEGAL_BASIS_FORWARDED",
  "LEGAL_BASIS_CLASSIFIED","LEGAL_BASIS_RECLASSIFIED","COURT_DECISION_RECORDED","LEGAL_BASIS_HELD",
  "LEGAL_BASIS_REVIEW_REQUIRED","LEGAL_BASIS_REVIEW_RECORDED","LEGAL_BASIS_DECIDED","LEGAL_VAULT_UNLOCKED");
 private final JdbcTemplate jdbc;
 public WorkflowNotificationService(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public record Item(UUID id,UUID caseId,String caseNumber,String action,String reason,Instant occurredAt,boolean read){}
 @EventListener
 public void capture(RecordedEvent recorded){
  var event=recorded.event();
  if(event.vaultId()==null || !ACTIONS.contains(event.action().name()))return;
  if(event.action().name().equals("LEGAL_BASIS_REVIEW_REQUIRED") && !"LEGAL_REQUESTED_SUPPLEMENTATION".equals(event.context().get("reasonCode")))return;
  String reason = null;
  if (Set.of("LEGAL_BASIS_REVIEW_REQUIRED","LEGAL_BASIS_REVIEW_RECORDED","LEGAL_BASIS_DECIDED").contains(event.action().name())
      && "LEGAL_BASIS_DOSSIER".equals(event.entityType()) && event.actorUserId() != null) {
   var reasons = jdbc.query("SELECT TOP(1) reason FROM dbo.legal_basis_review_history WHERE legal_basis_dossier_id=? AND reviewed_by_user_id=? ORDER BY legal_basis_review_id DESC",(rs,row)->rs.getString(1),event.entityId(),event.actorUserId());
   if (!reasons.isEmpty()) reason = reasons.getFirst();
  }
  // Mutations hold the vault lock: the current case cannot change between audit and capture.
  int inserted=jdbc.update("""
   INSERT INTO dbo.workflow_notifications(audit_log_id,verification_case_id,action,reason)
   SELECT ?,c.verification_case_id,?,? FROM dbo.verification_cases c
   WHERE c.verification_case_id=(SELECT TOP(1) verification_case_id FROM dbo.verification_cases
    WHERE vault_id=? ORDER BY opened_at DESC,verification_case_id DESC)
   """,recorded.auditId(),event.action().name(),reason,event.vaultId());
  if(inserted!=1)throw new IllegalStateException("Workflow notification was not persisted");
 }
 private static String visibility(String workspace){
  if("LEGAL".equals(workspace))return "1=1";
  if("STAFF".equals(workspace))return "(c.assigned_staff_user_id=? OR (c.assigned_staff_user_id IS NULL AND c.status='OPEN'))";
  throw new BusinessException(ErrorCode.VALIDATION_FAILED);
 }
 @Transactional(readOnly=true)
 public List<Item> list(Long userId,String workspace){
  String scope=visibility(workspace);
  String sql="""
   SELECT TOP(50) n.public_id,c.public_id AS case_public_id,c.verification_case_id,c.created_at,
    n.action,n.reason,n.occurred_at,CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS is_read
   FROM dbo.workflow_notifications n JOIN dbo.verification_cases c ON c.verification_case_id=n.verification_case_id
   LEFT JOIN dbo.workflow_notification_reads r ON r.notification_id=n.notification_id AND r.user_id=?
   WHERE %s ORDER BY n.notification_id DESC
   """.formatted(scope);
  Object[] args="STAFF".equals(workspace)?new Object[]{userId,userId}:new Object[]{userId};
  return jdbc.query(sql,(rs,row)->new Item(UUID.fromString(rs.getString("public_id")),UUID.fromString(rs.getString("case_public_id")),
   String.format(java.util.Locale.ROOT,"HS-%04d-%06d",rs.getTimestamp("created_at").toLocalDateTime().getYear(),rs.getLong("verification_case_id")),
   rs.getString("action"),rs.getString("reason"),rs.getTimestamp("occurred_at").toLocalDateTime().toInstant(ZoneOffset.UTC),rs.getBoolean("is_read")),args);
 }
 @Transactional
 public void read(Long userId,String workspace,UUID id){
  // The update repeats the same scope check; a guessed notification ID never grants access.
  String sql="SELECT n.notification_id FROM dbo.workflow_notifications n JOIN dbo.verification_cases c ON c.verification_case_id=n.verification_case_id WHERE n.public_id=? AND "+visibility(workspace);
  Object[] args="STAFF".equals(workspace)?new Object[]{id.toString(),userId}:new Object[]{id.toString()};
  var ids=jdbc.query(sql,(rs,row)->rs.getLong(1),args);
  if(ids.isEmpty())throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
  try{jdbc.update("INSERT INTO dbo.workflow_notification_reads(notification_id,user_id) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM dbo.workflow_notification_reads WITH(UPDLOCK,HOLDLOCK) WHERE notification_id=? AND user_id=?)",ids.getFirst(),userId,ids.getFirst(),userId);}
  catch(org.springframework.dao.DuplicateKeyException ignored){ /* Concurrent reads are idempotent. */ }
 }
}
