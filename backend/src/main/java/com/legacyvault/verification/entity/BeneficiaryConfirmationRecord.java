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
    @Column(name="signed_file_ciphertext",columnDefinition="varbinary(max)") private byte[] signedFile;
    @Column(name="signed_file_iv",columnDefinition="varbinary(12)") private byte[] signedIv;
    @Column(name="signed_file_key_version",length=64) private String signedKeyVersion;
    @Column(name="signed_file_name",length=255) private String signedFileName;
    @Column(name="signed_file_type",length=100) private String signedFileType;
    @Column(name="signed_file_sha256",length=64) private String signedSha256;
    @Column(name="paper_receipt_reference",length=200) private String paperReference;
    public void setPaperReference(String value){paperReference=value;}
    public void attachSignedFile(com.legacyvault.common.crypto.EncryptedData encrypted, String name, String type, String hash) {
        if(signedFile != null) throw new IllegalStateException("Receipt is immutable");
        signedFile=encrypted.ciphertext(); signedIv=encrypted.iv(); signedKeyVersion=encrypted.keyVersion();
        signedFileName=name; signedFileType=type; signedSha256=hash;
    }
    public boolean hasSignedFile(){return signedFile != null;}
    public Long getSessionId(){return sessionId;}
    public String getSignedFileName(){return signedFileName;} public String getSignedFileType(){return signedFileType;}
    public String getSignedSha256(){return signedSha256;}
    public com.legacyvault.common.crypto.EncryptedData signedData(){return new com.legacyvault.common.crypto.EncryptedData(signedFile,signedIv,signedKeyVersion);}
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
