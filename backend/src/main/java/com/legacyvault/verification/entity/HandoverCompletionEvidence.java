package com.legacyvault.verification.entity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
/**
 * Immutable proof created only by PS-71 after rechecking both gates under the session lock.
 * <p>
 * Bảng {@code dbo.handover_completion_evidence}: bằng chứng bất biến, tối đa một dòng cho mỗi phiên bàn giao (unique theo
 * {@code handover_session_id}). Do {@code HandoverCloseService} tạo khi đóng phiên sau khi cổng hoàn tất kép ({@code DualCompletionGate})
 * đạt READY.
 */
@Entity @Table(name="handover_completion_evidence",schema="dbo")
public class HandoverCompletionEvidence {
 /**
  * Khóa chính nội bộ {@code evidence_id} (IDENTITY).
  */
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="evidence_id") private Long id;
 /**
  * Id phiên bàn giao đã hoàn tất (duy nhất).
  */
 @Column(name="handover_session_id",nullable=false,updatable=false,unique=true) private Long sessionId;
 /**
  * Id phiên bản hồ sơ căn cứ làm cơ sở phạm vi bàn giao.
  */
 @Column(name="dossier_version_id",nullable=false,updatable=false) private Long versionId;
 /**
  * SHA-256 của phiên bản hồ sơ căn cứ tại thời điểm hoàn tất.
  */
 @Column(name="sha256_hash",nullable=false,updatable=false,length=64) private String sha256;
 /**
  * Hash phạm vi phân bổ (tài sản và người nhận) tại thời điểm hoàn tất.
  */
 @Column(name="scope_hash",nullable=false,updatable=false,length=64) private String scopeHash;
 /**
  * Số tài sản đã giao trong phạm vi.
  */
 @Column(name="asset_count",nullable=false,updatable=false) private int assetCount;
 /**
  * Số người nhận đã xác nhận trong phạm vi.
  */
 @Column(name="beneficiary_count",nullable=false,updatable=false) private int beneficiaryCount;
 /**
  * Id Staff đóng phiên.
  */
 @Column(name="completed_by_user_id",nullable=false,updatable=false) private Long actorId;
 /**
  * Thời điểm hoàn tất (UTC).
  */
 @Column(name="completed_at",nullable=false,updatable=false) private LocalDateTime completedAt;
 /**
  * Constructor không tham số cho JPA.
  */
 protected HandoverCompletionEvidence(){}
 /**
  * Tạo bằng chứng hoàn tất bàn giao.
  * @param sessionId       id phiên bàn giao
  * @param versionId       id phiên bản hồ sơ căn cứ
  * @param sha256          SHA-256 của phiên bản hồ sơ
  * @param scopeHash       hash phạm vi
  * @param assetCount      số tài sản đã giao
  * @param beneficiaryCount số người nhận đã xác nhận
  * @param actorId         id Staff đóng phiên
  * @param completedAt     thời điểm hoàn tất (UTC)
  */
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
