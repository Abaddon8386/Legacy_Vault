package com.legacyvault.verification.service;

import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.dto.IntakeAttachmentResponse;
import com.legacyvault.verification.entity.DeathDocumentRecord;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import com.legacyvault.verification.entity.OriginalWillIntake;
import com.legacyvault.verification.entity.StaffIntakeAttachment;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.DeathDocumentRecordRepository;
import com.legacyvault.verification.repository.IntakeAttachmentRow;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.OriginalWillIntakeRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.StaffIntakeAttachmentRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.will.service.WillFile;

/**
 * PS-103 (ST-11, ST-13, LV-DEATH-002, LV-WILL-001, LV-AUD-001): files and images attached to the death documents and the
 * original paper will Staff received, plus authorized reads of those files and of legal-basis version files.
 *
 * <p>Uploads: only the Staff assigned to the OPEN case, append-only, validated by content (PDF/JPEG/PNG), SHA-256 of the
 * original bytes, encrypted with the attachment id as associated data. Reads: the assigned Staff, or any Legal Verifier
 * under the existing global Legal scope; a legal-basis file is readable by Legal only after it was forwarded (ST-19).
 * Every content read is audited without file names or content. Attaching a file proves neither validity of the document
 * nor anyone's identity: Legal still decides (ST-12, ST-15) and identity is verified in person outside the system.
 */
@Service
public class IntakeAttachmentService {

	static final String ENTITY_ATTACHMENT = "STAFF_INTAKE_ATTACHMENT";
	static final String ENTITY_BASIS_VERSION = "LEGAL_BASIS_VERSION";

	private final StaffCaseLockRepository staffCases;
	private final LegalCaseLookupRepository legalCases;
	private final VerificationCaseRepository cases;
	private final DeathDocumentRecordRepository deathDocuments;
	private final OriginalWillIntakeRepository originalWills;
	private final StaffIntakeAttachmentRepository attachments;
	private final LegalBasisDossierRepository dossiers;
	private final LegalBasisDossierVersionRepository versions;
	private final UserRepository users;
	private final EncryptionService encryption;
	private final AuditService audit;
	private final LegalBasisLockedState state;
	private final long maxFileBytes;
	private final int maxAttachmentsPerRecord;

	public IntakeAttachmentService(StaffCaseLockRepository staffCases, LegalCaseLookupRepository legalCases,
			VerificationCaseRepository cases, DeathDocumentRecordRepository deathDocuments,
			OriginalWillIntakeRepository originalWills, StaffIntakeAttachmentRepository attachments,
			LegalBasisDossierRepository dossiers, LegalBasisDossierVersionRepository versions, UserRepository users,
			EncryptionService encryption, AuditService audit, LegalBasisLockedState state,
			// TODO(open-question): file policy (size, count, retention) is a proposal until the group confirms D-API-41.
			@Value("${legacyvault.intake.max-file-bytes:10485760}") long maxFileBytes,
			@Value("${legacyvault.intake.max-attachments-per-record:10}") int maxAttachmentsPerRecord) {
		if (maxFileBytes < 1 || maxAttachmentsPerRecord < 1) {
			throw new IllegalArgumentException("Invalid intake attachment configuration");
		}
		this.staffCases = staffCases;
		this.legalCases = legalCases;
		this.cases = cases;
		this.deathDocuments = deathDocuments;
		this.originalWills = originalWills;
		this.attachments = attachments;
		this.dossiers = dossiers;
		this.versions = versions;
		this.users = users;
		this.encryption = encryption;
		this.audit = audit;
		this.state = state;
		this.maxFileBytes = maxFileBytes;
		this.maxAttachmentsPerRecord = maxAttachmentsPerRecord;
	}

	/** Decrypted file ready to stream; never logged. */
	public record IntakeFile(byte[] content, String contentType, String fileName) { }

	// ---------------------------------------------------------------- Staff uploads

	@Transactional
	public IntakeAttachmentResponse uploadToDeathDocument(UUID caseId, UUID recordId, CustomUserPrincipal principal,
			MultipartFile file) {
		Long staffUserId = CustomUserPrincipal.requireUserId(principal);
		VerificationCase verificationCase = lockOpenOwnedCase(caseId, staffUserId);
		DeathDocumentRecord record = deathDocuments
				.findByPublicIdAndVerificationCaseId(recordId, verificationCase.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		if (attachments.countByDeathDocumentRecordId(record.getDeathDocumentRecordId()) >= maxAttachmentsPerRecord) {
			throw new BusinessException(ErrorCode.INTAKE_ATTACHMENT_LIMIT_EXCEEDED);
		}
		WillFile scan = WillFile.inspect(file, maxFileBytes);
		StaffIntakeAttachment attachment = StaffIntakeAttachment.forDeathDocument(verificationCase.getVerificationCaseId(),
				record.getDeathDocumentRecordId(), scan.fileName(), scan.contentType(), scan.size(), scan.sha256(),
				staffUserId);
		return store(attachment, scan, verificationCase, StaffIntakeAttachment.SUBJECT_DEATH_DOCUMENT, record.getPublicId(),
				principal.publicId(), "ST-11", "LV-DEATH-002");
	}

	@Transactional
	public IntakeAttachmentResponse uploadToOriginalWill(UUID caseId, UUID intakeId, CustomUserPrincipal principal,
			MultipartFile file) {
		Long staffUserId = CustomUserPrincipal.requireUserId(principal);
		VerificationCase verificationCase = lockOpenOwnedCase(caseId, staffUserId);
		OriginalWillIntake intake = originalWills
				.findByPublicIdAndVerificationCaseId(intakeId, verificationCase.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		if (attachments.countByOriginalWillIntakeId(intake.getOriginalWillIntakeId()) >= maxAttachmentsPerRecord) {
			throw new BusinessException(ErrorCode.INTAKE_ATTACHMENT_LIMIT_EXCEEDED);
		}
		WillFile scan = WillFile.inspect(file, maxFileBytes);
		StaffIntakeAttachment attachment = StaffIntakeAttachment.forOriginalWill(verificationCase.getVerificationCaseId(),
				intake.getOriginalWillIntakeId(), scan.fileName(), scan.contentType(), scan.size(), scan.sha256(),
				staffUserId);
		return store(attachment, scan, verificationCase, StaffIntakeAttachment.SUBJECT_ORIGINAL_WILL, intake.getPublicId(),
				principal.publicId(), "ST-13", "LV-WILL-001");
	}

	private IntakeAttachmentResponse store(StaffIntakeAttachment attachment, WillFile scan, VerificationCase verificationCase,
			String subjectType, UUID subjectId, UUID uploaderPublicId, String stepId, String ruleId) {
		attachment.setEncryptedContent(
				encryption.encrypt(scan.content(), StaffIntakeAttachment.associatedData(attachment.getPublicId())));
		StaffIntakeAttachment saved = attachments.saveAndFlush(attachment);
		// No file name, content or document number in the audit: only public ids, size and hash.
		audit.record(new AuditEvent(AuditAction.INTAKE_ATTACHMENT_UPLOADED, AuditActorType.USER, saved.getUploadedByUserId(),
				verificationCase.getVaultId(), ENTITY_ATTACHMENT, saved.getAttachmentId(), null, null, null,
				Map.of("attachmentId", saved.getPublicId().toString(), "subjectType", subjectType,
						"subjectId", subjectId.toString(), "verificationCaseId", verificationCase.getPublicId().toString(),
						"sizeBytes", saved.getFileSizeBytes(), "sha256", saved.getSha256Hash()),
				stepId, ruleId));
		return toResponse(saved.getPublicId(), verificationCase.getPublicId(), subjectType, subjectId, saved.getOriginalFileName(),
				saved.getContentType(), saved.getFileSizeBytes(), saved.getSha256Hash(), uploaderPublicId,
				saved.getUploadedAt().toInstant(ZoneOffset.UTC));
	}

	// ---------------------------------------------------------------- Staff reads

	@Transactional(readOnly = true)
	public List<IntakeAttachmentResponse> listForDeathDocument(UUID caseId, UUID recordId, CustomUserPrincipal principal) {
		VerificationCase c = ownedCase(caseId, principal);
		DeathDocumentRecord record = deathDocuments
				.findByPublicIdAndVerificationCaseId(recordId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return rows(attachments.findRowsByDeathDocument(record.getDeathDocumentRecordId()), c.getPublicId(),
				StaffIntakeAttachment.SUBJECT_DEATH_DOCUMENT, record.getPublicId());
	}

	@Transactional(readOnly = true)
	public List<IntakeAttachmentResponse> listForOriginalWill(UUID caseId, UUID intakeId, CustomUserPrincipal principal) {
		VerificationCase c = ownedCase(caseId, principal);
		OriginalWillIntake intake = originalWills
				.findByPublicIdAndVerificationCaseId(intakeId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return rows(attachments.findRowsByOriginalWill(intake.getOriginalWillIntakeId()), c.getPublicId(),
				StaffIntakeAttachment.SUBJECT_ORIGINAL_WILL, intake.getPublicId());
	}

	@Transactional
	public IntakeFile openDeathDocumentAttachment(UUID caseId, UUID recordId, UUID attachmentId,
			CustomUserPrincipal principal) {
		VerificationCase c = ownedCase(caseId, principal);
		DeathDocumentRecord record = deathDocuments
				.findByPublicIdAndVerificationCaseId(recordId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		StaffIntakeAttachment a = attachments
				.findByPublicIdAndDeathDocumentRecordId(attachmentId, record.getDeathDocumentRecordId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return open(a, c, CustomUserPrincipal.requireUserId(principal), "STAFF");
	}

	@Transactional
	public IntakeFile openOriginalWillAttachment(UUID caseId, UUID intakeId, UUID attachmentId,
			CustomUserPrincipal principal) {
		VerificationCase c = ownedCase(caseId, principal);
		OriginalWillIntake intake = originalWills
				.findByPublicIdAndVerificationCaseId(intakeId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		StaffIntakeAttachment a = attachments
				.findByPublicIdAndOriginalWillIntakeId(attachmentId, intake.getOriginalWillIntakeId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return open(a, c, CustomUserPrincipal.requireUserId(principal), "STAFF");
	}

	@Transactional
	public IntakeFile openBasisVersionForStaff(UUID caseId, int versionNo, CustomUserPrincipal principal) {
		VerificationCase c = ownedCase(caseId, principal);
		return openBasisVersion(c, versionNo, CustomUserPrincipal.requireUserId(principal), false);
	}

	// ---------------------------------------------------------------- Legal reads (global Legal scope)

	@Transactional(readOnly = true)
	public List<IntakeAttachmentResponse> legalListForDeathDocument(UUID deathDocumentId, CustomUserPrincipal principal) {
		CustomUserPrincipal.requireUserId(principal);
		DeathDocumentRecord record = deathDocuments.findByPublicId(deathDocumentId).orElseThrow(IntakeAttachmentService::notFound);
		VerificationCase c = cases.findById(record.getVerificationCaseId()).orElseThrow(IntakeAttachmentService::notFound);
		return rows(attachments.findRowsByDeathDocument(record.getDeathDocumentRecordId()), c.getPublicId(),
				StaffIntakeAttachment.SUBJECT_DEATH_DOCUMENT, record.getPublicId());
	}

	@Transactional
	public IntakeFile legalOpenDeathDocumentAttachment(UUID deathDocumentId, UUID attachmentId, CustomUserPrincipal principal) {
		Long actor = CustomUserPrincipal.requireUserId(principal);
		DeathDocumentRecord record = deathDocuments.findByPublicId(deathDocumentId).orElseThrow(IntakeAttachmentService::notFound);
		VerificationCase c = cases.findById(record.getVerificationCaseId()).orElseThrow(IntakeAttachmentService::notFound);
		StaffIntakeAttachment a = attachments
				.findByPublicIdAndDeathDocumentRecordId(attachmentId, record.getDeathDocumentRecordId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return open(a, c, actor, "LEGAL");
	}

	@Transactional(readOnly = true)
	public List<IntakeAttachmentResponse> legalListForOriginalWill(UUID caseId, UUID intakeId, CustomUserPrincipal principal) {
		CustomUserPrincipal.requireUserId(principal);
		VerificationCase c = legalCases.findByPublicId(caseId).orElseThrow(IntakeAttachmentService::notFound);
		OriginalWillIntake intake = originalWills.findByPublicIdAndVerificationCaseId(intakeId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return rows(attachments.findRowsByOriginalWill(intake.getOriginalWillIntakeId()), c.getPublicId(),
				StaffIntakeAttachment.SUBJECT_ORIGINAL_WILL, intake.getPublicId());
	}

	@Transactional
	public IntakeFile legalOpenOriginalWillAttachment(UUID caseId, UUID intakeId, UUID attachmentId,
			CustomUserPrincipal principal) {
		Long actor = CustomUserPrincipal.requireUserId(principal);
		VerificationCase c = legalCases.findByPublicId(caseId).orElseThrow(IntakeAttachmentService::notFound);
		OriginalWillIntake intake = originalWills.findByPublicIdAndVerificationCaseId(intakeId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		StaffIntakeAttachment a = attachments
				.findByPublicIdAndOriginalWillIntakeId(attachmentId, intake.getOriginalWillIntakeId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return open(a, c, actor, "LEGAL");
	}

	@Transactional
	public IntakeFile legalOpenBasisVersion(UUID caseId, int versionNo, CustomUserPrincipal principal) {
		Long actor = CustomUserPrincipal.requireUserId(principal);
		VerificationCase c = legalCases.findByPublicId(caseId).orElseThrow(IntakeAttachmentService::notFound);
		return openBasisVersion(c, versionNo, actor, true);
	}

	// ---------------------------------------------------------------- shared

	private IntakeFile openBasisVersion(VerificationCase c, int versionNo, Long actorUserId, boolean forwardedOnly) {
		if (versionNo < 1) {
			throw notFound();
		}
		LegalBasisDossier dossier = dossiers.findByVerificationCaseId(c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		LegalBasisDossierVersion version = versions
				.findByLegalBasisDossierIdAndVersionNo(dossier.getLegalBasisDossierId(), versionNo)
				.orElseThrow(IntakeAttachmentService::notFound);
		// Legal sees only versions that Staff forwarded (ST-19); an unforwarded draft is not Legal's evidence yet.
		if (forwardedOnly && !LegalBasisDossierVersion.FORWARDED.equals(version.getForwardStatus())) {
			throw notFound();
		}
		if (!version.hasStoredFile()) {
			throw notFound();
		}
		byte[] content = encryption.decryptBytes(version.encryptedContent(),
				BasisIntakeService.associatedData(version.getPublicId()));
		recordRead(actorUserId, c, ENTITY_BASIS_VERSION, version.getDossierVersionId(),
				Map.of("verificationCaseId", c.getPublicId().toString(), "versionNo", versionNo,
						"actorKind", forwardedOnly ? "LEGAL" : "STAFF"),
				"ST-18", "LV-BASIS-001");
		return new IntakeFile(content, version.getContentType(), version.getOriginalFileName());
	}

	private IntakeFile open(StaffIntakeAttachment a, VerificationCase c, Long actorUserId, String actorKind) {
		byte[] content = encryption.decryptBytes(a.encryptedContent(), StaffIntakeAttachment.associatedData(a.getPublicId()));
		String subject = a.getDeathDocumentRecordId() != null ? StaffIntakeAttachment.SUBJECT_DEATH_DOCUMENT
				: StaffIntakeAttachment.SUBJECT_ORIGINAL_WILL;
		boolean death = a.getDeathDocumentRecordId() != null;
		recordRead(actorUserId, c, ENTITY_ATTACHMENT, a.getAttachmentId(),
				Map.of("attachmentId", a.getPublicId().toString(), "subjectType", subject,
						"verificationCaseId", c.getPublicId().toString(), "actorKind", actorKind),
				death ? "ST-11" : "ST-13", death ? "LV-DEATH-002" : "LV-WILL-001");
		return new IntakeFile(content, a.getContentType(), a.getOriginalFileName());
	}

	private void recordRead(Long actorUserId, VerificationCase c, String entityType, Long entityId,
			Map<String, Object> details, String stepId, String ruleId) {
		audit.record(new AuditEvent(AuditAction.EVIDENCE_FILE_READ, AuditActorType.USER, actorUserId, c.getVaultId(),
				entityType, entityId, null, null, null, details, stepId, ruleId));
	}

	private VerificationCase lockOpenOwnedCase(UUID caseId, Long staffUserId) {
		VerificationCase verificationCase = staffCases.findOwnedByStaffForUpdate(caseId, staffUserId)
				.orElseThrow(IntakeAttachmentService::notFound);
		state.refresh(verificationCase);
		if (!Objects.equals(verificationCase.getAssignedStaffUserId(), staffUserId)) {
			throw notFound();
		}
		if (!verificationCase.isOpen()) {
			throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
		}
		return verificationCase;
	}

	private VerificationCase ownedCase(UUID caseId, CustomUserPrincipal principal) {
		Long staffUserId = CustomUserPrincipal.requireUserId(principal);
		return staffCases.findOwnedByStaff(caseId, staffUserId).orElseThrow(IntakeAttachmentService::notFound);
	}

	private List<IntakeAttachmentResponse> rows(List<IntakeAttachmentRow> rows, UUID casePublicId, String subjectType,
			UUID subjectId) {
		if (rows.isEmpty()) {
			return List.of();
		}
		Map<Long, UUID> uploaders = users.findAllById(rows.stream().map(IntakeAttachmentRow::uploadedByUserId).distinct().toList())
				.stream().collect(Collectors.toMap(User::getUserId, User::getPublicId, (x, y) -> x));
		return rows.stream().map(r -> toResponse(r.publicId(), casePublicId, subjectType, subjectId, r.fileName(), r.contentType(),
				r.sizeBytes(), r.sha256Hash(), uploaders.get(r.uploadedByUserId()), r.uploadedAt().toInstant(ZoneOffset.UTC))).toList();
	}

	private static IntakeAttachmentResponse toResponse(UUID id, UUID casePublicId, String subjectType, UUID subjectId,
			String fileName, String contentType, long size, String sha256, UUID uploadedBy, java.time.Instant uploadedAt) {
		return new IntakeAttachmentResponse(id, casePublicId, subjectType, subjectId, fileName, contentType, size, sha256,
				uploadedBy, uploadedAt);
	}

	private static BusinessException notFound() {
		return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
	}
}
