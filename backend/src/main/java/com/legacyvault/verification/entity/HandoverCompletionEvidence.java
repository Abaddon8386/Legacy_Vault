package com.legacyvault.verification.entity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
/** Immutable proof created only by PS-71 after rechecking both gates under the session lock. */
@Entity @Table(name="handover_completion_evidence",schema="dbo")
public class HandoverCompletionEvidence {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="evidence_id") private Long id;
 @Column(name="handover_session_id",nullable=false,updatable=false,unique=true) private Long sessionId;
 @Column(name="dossier_version_id",nullable=false,updatable=false) private Long versionId;
 @Column(name="sha256_hash",nullable=false,updatable=false,length=64) private String sha256;
 @Column(name="scope_hash",nullable=false,updatable=false,length=64) private String scopeHash;
 @Column(name="asset_count",nullable=false,updatable=false) private int assetCount;
 @Column(name="beneficiary_count",nullable=false,updatable=false) private int beneficiaryCount;
 @Column(name="completed_by_user_id",nullable=false,updatable=false) private Long actorId;
 @Column(name="completed_at",nullable=false,updatable=false) private LocalDateTime completedAt;
 protected HandoverCompletionEvidence(){}
 public HandoverCompletionEvidence(Long sessionId,Long versionId,String sha256,String scopeHash,
  int assetCount,int beneficiaryCount,Long actorId,LocalDateTime completedAt){
  this.sessionId=sessionId;this.versionId=versionId;this.sha256=sha256;this.scopeHash=scopeHash;
  this.assetCount=assetCount;this.beneficiaryCount=beneficiaryCount;this.actorId=actorId;this.completedAt=completedAt;
 }
 public Long getId(){return id;} public Long getVersionId(){return versionId;}
 public String getSha256(){return sha256;} public String getScopeHash(){return scopeHash;}
 public int getAssetCount(){return assetCount;} public int getBeneficiaryCount(){return beneficiaryCount;}
 public LocalDateTime getCompletedAt(){return completedAt;}
}
