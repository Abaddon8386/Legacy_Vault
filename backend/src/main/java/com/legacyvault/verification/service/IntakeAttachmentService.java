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
 * PS-103 (ST-11, ST-13, LV-DEATH-002, LV-WILL-001, LV-AUD-001): tệp và ảnh đính kèm vào hồ sơ giấy chứng tử và di chúc
 * bản gốc mà Staff tiếp nhận, cùng việc đọc có kiểm soát các tệp đó và tệp phiên bản hồ sơ căn cứ pháp lý.
 *
 * <p>Tải lên: chỉ Staff được giao case ĐANG MỞ, chỉ thêm mới (append-only), kiểm tra theo nội dung (PDF/JPEG/PNG) qua
 * {@code WillFile.inspect}, tính SHA-256 của byte gốc, mã hóa AES bằng {@link EncryptionService} với id tệp làm dữ liệu
 * đi kèm. Đọc: Staff được giao hoặc bất kỳ Legal Verifier theo phạm vi Legal toàn cục; tệp căn cứ chỉ Legal đọc được sau
 * khi Staff đã forward (ST-19). Mọi lần đọc nội dung đều được audit ({@code EVIDENCE_FILE_READ}) mà không ghi tên hay nội
 * dung tệp. Việc đính kèm không chứng minh tính hợp lệ của giấy tờ hay danh tính: Legal vẫn quyết định (ST-12, ST-15),
 * danh tính được xác minh trực tiếp ngoài hệ thống.
 *
 * <p>Endpoint (controller {@code StaffIntakeAttachmentController}, vai trò STAFF_EXECUTOR, base
 * {@code /api/v1/staff/verification-cases/{caseId}}): {@code POST/GET /death-documents/{recordId}/attachments},
 * {@code GET /death-documents/{recordId}/attachments/{attachmentId}/content},
 * {@code POST/GET /original-will-intakes/{intakeId}/attachments} (+ {@code /{attachmentId}/content}),
 * {@code GET /basis-dossier/versions/{versionNo}/content}. Endpoint Legal (controller
 * {@code LegalIntakeAttachmentController}, vai trò LEGAL_VERIFIER, base {@code /api/v1/legal-verifications}):
 * {@code GET /death-documents/{deathDocumentId}/attachments[/{attachmentId}/content]},
 * {@code GET /verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments[/{attachmentId}/content]},
 * {@code GET /verification-cases/{caseId}/basis-dossier/versions/{versionNo}/content}.
 * Bảng dùng: {@code staff_intake_attachments}, {@code death_document_records}, {@code original_will_intakes},
 * {@code legal_basis_dossiers}, {@code legal_basis_dossier_versions}, {@code users}.
 */
@Service
public class IntakeAttachmentService {

	/**
	 * Loại thực thể ghi trong audit cho tệp đính kèm của Staff.
	 */
	static final String ENTITY_ATTACHMENT = "STAFF_INTAKE_ATTACHMENT";
	/**
	 * Loại thực thể ghi trong audit cho phiên bản hồ sơ căn cứ pháp lý.
	 */
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
	private final com.legacyvault.notification.WorkflowNotificationService notifications;
	/**
	 * Dung lượng tối đa mỗi tệp (byte), cấu hình {@code legacyvault.intake.max-file-bytes}, mặc định 10 MB.
	 */
	private final long maxFileBytes;
	/**
	 * Số tệp đính kèm tối đa trên mỗi bản ghi, cấu hình {@code legacyvault.intake.max-attachments-per-record}, mặc định 10.
	 */
	private final int maxAttachmentsPerRecord;

	/**
	 * @param staffCases truy vấn case theo Staff được giao (có khóa ghi)
	 * @param legalCases truy vấn case theo phạm vi Legal toàn cục
	 * @param cases repository hồ sơ xác minh
	 * @param deathDocuments repository bản ghi giấy chứng tử
	 * @param originalWills repository bản ghi di chúc gốc
	 * @param attachments repository tệp đính kèm
	 * @param dossiers repository hồ sơ căn cứ pháp lý
	 * @param versions repository phiên bản hồ sơ căn cứ
	 * @param users repository người dùng (để đổi id người tải lên sang public id)
	 * @param encryption dịch vụ mã hóa AES-256
	 * @param audit dịch vụ ghi nhật ký kiểm toán
	 * @param state tiện ích refresh entity sau khi khóa
	 * @param notifications dịch vụ thông báo workflow (báo cho Legal khi có tệp mới)
	 * @param maxFileBytes dung lượng tối đa mỗi tệp
	 * @param maxAttachmentsPerRecord số tệp tối đa trên mỗi bản ghi
	 * @throws IllegalArgumentException nếu cấu hình giới hạn nhỏ hơn 1
	 */
	public IntakeAttachmentService(StaffCaseLockRepository staffCases, LegalCaseLookupRepository legalCases,
			VerificationCaseRepository cases, DeathDocumentRecordRepository deathDocuments,
			OriginalWillIntakeRepository originalWills, StaffIntakeAttachmentRepository attachments,
			LegalBasisDossierRepository dossiers, LegalBasisDossierVersionRepository versions, UserRepository users,
			EncryptionService encryption, AuditService audit, LegalBasisLockedState state,
			com.legacyvault.notification.WorkflowNotificationService notifications,
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
		this.notifications = notifications;
		this.maxFileBytes = maxFileBytes;
		this.maxAttachmentsPerRecord = maxAttachmentsPerRecord;
	}

	/**
	 * Tệp đã giải mã, sẵn sàng stream về client; không bao giờ được ghi log.
	 *
	 * @param content nội dung đã giải mã
	 * @param contentType MIME type đã kiểm tra khi tải lên
	 * @param fileName tên tệp gốc
	 */
	public record IntakeFile(byte[] content, String contentType, String fileName) { }

	// ---------------------------------------------------------------- Staff uploads

	/**
	 * Staff tải tệp đính kèm lên bản ghi giấy chứng tử.
	 * API: {@code POST /api/v1/staff/verification-cases/{caseId}/death-documents/{recordId}/attachments} (multipart).
	 *
	 * <p>Khóa case mở của Staff, tìm bản ghi chứng tử, kiểm tra giới hạn số tệp, kiểm tra tệp theo nội dung, rồi mã hóa và
	 * lưu qua {@code store}.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param recordId public id bản ghi giấy chứng tử
	 * @param principal Staff đang đăng nhập
	 * @param file tệp tải lên
	 * @return thông tin tệp đã lưu
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}, {@code VERIFICATION_CASE_NOT_OPEN},
	 *         {@code INTAKE_ATTACHMENT_LIMIT_EXCEEDED} hoặc lỗi định dạng/dung lượng từ {@code WillFile.inspect}
	 */
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

	/**
	 * Staff tải tệp đính kèm lên bản ghi di chúc gốc.
	 * API: {@code POST /api/v1/staff/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments} (multipart).
	 * Luồng giống {@link #uploadToDeathDocument} nhưng gắn với bước ST-13 / LV-WILL-001.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param intakeId public id bản ghi di chúc gốc
	 * @param principal Staff đang đăng nhập
	 * @param file tệp tải lên
	 * @return thông tin tệp đã lưu
	 * @throws BusinessException như {@link #uploadToDeathDocument}
	 */
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

	/**
	 * Mã hóa nội dung (id tệp làm dữ liệu đi kèm), lưu tệp, ghi audit {@code INTAKE_ATTACHMENT_UPLOADED} và gửi thông báo
	 * cho Legal. Audit chỉ chứa public id, dung lượng và SHA-256, không có tên tệp hay nội dung.
	 *
	 * @return phản hồi kèm thông báo workflow
	 */
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
		var notification = notifications.record(verificationCase,
				com.legacyvault.notification.WorkflowNotificationService.Workspace.LEGAL,
				"INTAKE_ATTACHMENT_UPLOADED", "attachment:" + saved.getPublicId(), null);
		return toResponse(saved.getPublicId(), verificationCase.getPublicId(), subjectType, subjectId, saved.getOriginalFileName(),
				saved.getContentType(), saved.getFileSizeBytes(), saved.getSha256Hash(), uploaderPublicId,
				saved.getUploadedAt().toInstant(ZoneOffset.UTC)).withNotification(notification);
	}

	// ---------------------------------------------------------------- Staff reads

	/**
	 * Staff liệt kê tệp đính kèm của một bản ghi chứng tử.
	 * API: {@code GET /api/v1/staff/verification-cases/{caseId}/death-documents/{recordId}/attachments}. Chỉ đọc.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param recordId public id bản ghi chứng tử
	 * @param principal Staff đang đăng nhập
	 * @return danh sách siêu dữ liệu tệp (không có nội dung)
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
	@Transactional(readOnly = true)
	public List<IntakeAttachmentResponse> listForDeathDocument(UUID caseId, UUID recordId, CustomUserPrincipal principal) {
		VerificationCase c = ownedCase(caseId, principal);
		DeathDocumentRecord record = deathDocuments
				.findByPublicIdAndVerificationCaseId(recordId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return rows(attachments.findRowsByDeathDocument(record.getDeathDocumentRecordId()), c.getPublicId(),
				StaffIntakeAttachment.SUBJECT_DEATH_DOCUMENT, record.getPublicId());
	}

	/**
	 * Staff liệt kê tệp đính kèm của một bản ghi di chúc gốc.
	 * API: {@code GET /api/v1/staff/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments}. Chỉ đọc.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param intakeId public id bản ghi di chúc gốc
	 * @param principal Staff đang đăng nhập
	 * @return danh sách siêu dữ liệu tệp
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
	@Transactional(readOnly = true)
	public List<IntakeAttachmentResponse> listForOriginalWill(UUID caseId, UUID intakeId, CustomUserPrincipal principal) {
		VerificationCase c = ownedCase(caseId, principal);
		OriginalWillIntake intake = originalWills
				.findByPublicIdAndVerificationCaseId(intakeId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return rows(attachments.findRowsByOriginalWill(intake.getOriginalWillIntakeId()), c.getPublicId(),
				StaffIntakeAttachment.SUBJECT_ORIGINAL_WILL, intake.getPublicId());
	}

	/**
	 * Staff mở (giải mã) một tệp đính kèm chứng tử và ghi audit đọc.
	 * API: {@code GET /api/v1/staff/verification-cases/{caseId}/death-documents/{recordId}/attachments/{attachmentId}/content}.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param recordId public id bản ghi chứng tử
	 * @param attachmentId public id tệp
	 * @param principal Staff đang đăng nhập
	 * @return tệp đã giải mã
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
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

	/**
	 * Staff mở (giải mã) một tệp đính kèm di chúc gốc và ghi audit đọc.
	 * API: {@code GET /api/v1/staff/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments/{attachmentId}/content}.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param intakeId public id bản ghi di chúc gốc
	 * @param attachmentId public id tệp
	 * @param principal Staff đang đăng nhập
	 * @return tệp đã giải mã
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
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

	/**
	 * Staff mở tệp của một phiên bản hồ sơ căn cứ (kể cả bản nháp chưa forward).
	 * API: {@code GET /api/v1/staff/verification-cases/{caseId}/basis-dossier/versions/{versionNo}/content}.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param versionNo số phiên bản
	 * @param principal Staff đang đăng nhập
	 * @return tệp đã giải mã
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
	@Transactional
	public IntakeFile openBasisVersionForStaff(UUID caseId, int versionNo, CustomUserPrincipal principal) {
		VerificationCase c = ownedCase(caseId, principal);
		return openBasisVersion(c, versionNo, CustomUserPrincipal.requireUserId(principal), false);
	}

	// ---------------------------------------------------------------- Legal reads (global Legal scope)

	/**
	 * Legal liệt kê tệp đính kèm của bản ghi chứng tử (phạm vi Legal toàn cục, không cần là Staff được giao).
	 * API: {@code GET /api/v1/legal-verifications/death-documents/{deathDocumentId}/attachments} (LEGAL_VERIFIER).
	 *
	 * @param deathDocumentId public id bản ghi chứng tử
	 * @param principal Legal Verifier đang đăng nhập
	 * @return danh sách siêu dữ liệu tệp
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
	@Transactional(readOnly = true)
	public List<IntakeAttachmentResponse> legalListForDeathDocument(UUID deathDocumentId, CustomUserPrincipal principal) {
		CustomUserPrincipal.requireUserId(principal);
		DeathDocumentRecord record = deathDocuments.findByPublicId(deathDocumentId).orElseThrow(IntakeAttachmentService::notFound);
		VerificationCase c = cases.findById(record.getVerificationCaseId()).orElseThrow(IntakeAttachmentService::notFound);
		return rows(attachments.findRowsByDeathDocument(record.getDeathDocumentRecordId()), c.getPublicId(),
				StaffIntakeAttachment.SUBJECT_DEATH_DOCUMENT, record.getPublicId());
	}

	/**
	 * Legal mở một tệp đính kèm chứng tử và ghi audit đọc.
	 * API: {@code GET /api/v1/legal-verifications/death-documents/{deathDocumentId}/attachments/{attachmentId}/content}.
	 *
	 * @param deathDocumentId public id bản ghi chứng tử
	 * @param attachmentId public id tệp
	 * @param principal Legal Verifier đang đăng nhập
	 * @return tệp đã giải mã
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
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

	/**
	 * Legal liệt kê tệp đính kèm của bản ghi di chúc gốc.
	 * API: {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments}.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param intakeId public id bản ghi di chúc gốc
	 * @param principal Legal Verifier đang đăng nhập
	 * @return danh sách siêu dữ liệu tệp
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
	@Transactional(readOnly = true)
	public List<IntakeAttachmentResponse> legalListForOriginalWill(UUID caseId, UUID intakeId, CustomUserPrincipal principal) {
		CustomUserPrincipal.requireUserId(principal);
		VerificationCase c = legalCases.findByPublicId(caseId).orElseThrow(IntakeAttachmentService::notFound);
		OriginalWillIntake intake = originalWills.findByPublicIdAndVerificationCaseId(intakeId, c.getVerificationCaseId())
				.orElseThrow(IntakeAttachmentService::notFound);
		return rows(attachments.findRowsByOriginalWill(intake.getOriginalWillIntakeId()), c.getPublicId(),
				StaffIntakeAttachment.SUBJECT_ORIGINAL_WILL, intake.getPublicId());
	}

	/**
	 * Legal mở một tệp đính kèm di chúc gốc và ghi audit đọc.
	 * API: {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments/{attachmentId}/content}.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param intakeId public id bản ghi di chúc gốc
	 * @param attachmentId public id tệp
	 * @param principal Legal Verifier đang đăng nhập
	 * @return tệp đã giải mã
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
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

	/**
	 * Legal mở tệp phiên bản hồ sơ căn cứ, chỉ khi phiên bản đã được Staff forward (ST-19).
	 * API: {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/versions/{versionNo}/content}.
	 *
	 * @param caseId public id hồ sơ xác minh
	 * @param versionNo số phiên bản
	 * @param principal Legal Verifier đang đăng nhập
	 * @return tệp đã giải mã
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu phiên bản chưa forward hoặc không có tệp
	 */
	@Transactional
	public IntakeFile legalOpenBasisVersion(UUID caseId, int versionNo, CustomUserPrincipal principal) {
		Long actor = CustomUserPrincipal.requireUserId(principal);
		VerificationCase c = legalCases.findByPublicId(caseId).orElseThrow(IntakeAttachmentService::notFound);
		return openBasisVersion(c, versionNo, actor, true);
	}

	// ---------------------------------------------------------------- shared

	/**
	 * Giải mã tệp của một phiên bản hồ sơ căn cứ và ghi audit đọc (ST-18, LV-BASIS-001).
	 *
	 * @param c hồ sơ xác minh
	 * @param versionNo số phiên bản (phải từ 1 trở lên)
	 * @param actorUserId id người đọc
	 * @param forwardedOnly {@code true} khi người đọc là Legal: chỉ cho đọc phiên bản đã FORWARDED
	 * @return tệp đã giải mã
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu thiếu dossier/phiên bản/tệp hoặc bản chưa forward
	 */
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

	/**
	 * Giải mã một tệp đính kèm bằng id tệp làm dữ liệu đi kèm và ghi audit đọc với bước/quy tắc tương ứng (ST-11 hoặc ST-13).
	 *
	 * @param actorKind {@code STAFF} hoặc {@code LEGAL}, ghi vào chi tiết audit
	 */
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

	/**
	 * Ghi audit {@code EVIDENCE_FILE_READ} cho một lần đọc nội dung tệp (không chứa tên tệp hay nội dung).
	 */
	private void recordRead(Long actorUserId, VerificationCase c, String entityType, Long entityId,
			Map<String, Object> details, String stepId, String ruleId) {
		audit.record(new AuditEvent(AuditAction.EVIDENCE_FILE_READ, AuditActorType.USER, actorUserId, c.getVaultId(),
				entityType, entityId, null, null, null, details, stepId, ruleId));
	}

	/**
	 * Khóa ghi case thuộc Staff, làm mới trạng thái và yêu cầu case còn mở.
	 *
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu case không thuộc Staff; {@code VERIFICATION_CASE_NOT_OPEN}
	 *         nếu case đã đóng
	 */
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

	/**
	 * Lấy case thuộc Staff (không khóa), dùng cho các thao tác đọc.
	 *
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND}
	 */
	private VerificationCase ownedCase(UUID caseId, CustomUserPrincipal principal) {
		Long staffUserId = CustomUserPrincipal.requireUserId(principal);
		return staffCases.findOwnedByStaff(caseId, staffUserId).orElseThrow(IntakeAttachmentService::notFound);
	}

	/**
	 * Chuyển các dòng siêu dữ liệu tệp thành phản hồi, quy đổi id người tải lên sang public id bằng một truy vấn gộp.
	 */
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

	/**
	 * Dựng {@link IntakeAttachmentResponse} từ các giá trị đã có.
	 */
	private static IntakeAttachmentResponse toResponse(UUID id, UUID casePublicId, String subjectType, UUID subjectId,
			String fileName, String contentType, long size, String sha256, UUID uploadedBy, java.time.Instant uploadedAt) {
		return new IntakeAttachmentResponse(id, casePublicId, subjectType, subjectId, fileName, contentType, size, sha256,
				uploadedBy, uploadedAt);
	}

	/**
	 * Tạo lỗi {@code RESOURCE_NOT_FOUND} dùng chung.
	 */
	private static BusinessException notFound() {
		return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
	}
}
