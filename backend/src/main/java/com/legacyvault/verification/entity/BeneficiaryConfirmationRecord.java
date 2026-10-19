package com.legacyvault.verification.entity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
/** Immutable Staff recording of a Beneficiary's separate counter confirmation. */
@Entity @Table(name="beneficiary_confirmations", schema="dbo")
public class BeneficiaryConfirmationRecord {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="confirmation_id") private Long id;
    @Column(name="public_id",nullable=false,unique=true,updatable=false) private UUID publicId=UUID.randomUUID();
    @Column(name="handover_session_id",nullable=false,updatable=false) private Long sessionId;
    @Column(name="dossier_version_id",nullable=false,updatable=false) private Long versionId;
    @Column(name="scope_hash",nullable=false,updatable=false,length=64) private String scopeHash;
    @Column(name="beneficiary_id",nullable=false,updatable=false) private Long beneficiaryId;
    @Column(name="confirmed_by_user_id",nullable=false,updatable=false) private Long actorId;
    @Column(name="confirmed_at",nullable=false,updatable=false) private LocalDateTime confirmedAt;
    @Column(name="receipt_reference",nullable=false,updatable=false,length=200) private String reference;
    protected BeneficiaryConfirmationRecord() {}
    public BeneficiaryConfirmationRecord(Long sessionId,Long versionId,String scopeHash,Long beneficiaryId,
            Long actorId,LocalDateTime at,String reference) {
        this.sessionId=sessionId; this.versionId=versionId; this.scopeHash=scopeHash;
        this.beneficiaryId=beneficiaryId; this.actorId=actorId; this.confirmedAt=at; this.reference=reference;
    }
    public Long getId(){return id;} public UUID getPublicId(){return publicId;}
    public Long getBeneficiaryId(){return beneficiaryId;} public Long getActorId(){return actorId;}
    public LocalDateTime getConfirmedAt(){return confirmedAt;} public String getReference(){return reference;}
}
