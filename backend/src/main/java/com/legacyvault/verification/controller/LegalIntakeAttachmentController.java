package com.legacyvault.verification.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.IntakeAttachmentResponse;
import com.legacyvault.verification.service.IntakeAttachmentService;

import jakarta.validation.constraints.Min;

/**
 * PS-103: read-only access for Legal Verifiers (existing global Legal scope) to the files Staff attached to the death
 * documents and the original will, and to forwarded legal-basis version files. Legal cannot upload or change anything
 * here and reading a file does not approve or verify it.
 */
@RestController
@RequestMapping("/api/v1/legal-verifications")
@PreAuthorize("hasRole('LEGAL_VERIFIER')")
public class LegalIntakeAttachmentController {

	private final IntakeAttachmentService service;

	public LegalIntakeAttachmentController(IntakeAttachmentService service) {
		this.service = service;
	}

	/**
	 * {@code GET /api/v1/legal-verifications/death-documents/{deathDocumentId}/attachments}
	 * Liệt kê file đính kèm của giấy tờ chứng tử.
	 *
	 * @return danh sách {@link IntakeAttachmentResponse}
	 */
	@GetMapping("/death-documents/{deathDocumentId}/attachments")
	public List<IntakeAttachmentResponse> deathDocumentAttachments(@PathVariable UUID deathDocumentId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return service.legalListForDeathDocument(deathDocumentId, principal);
	}

	/**
	 * {@code GET .../death-documents/{deathDocumentId}/attachments/{attachmentId}/content}
	 * Tải nội dung một file đính kèm của giấy tờ chứng tử (dạng attachment an toàn).
	 */
	@GetMapping("/death-documents/{deathDocumentId}/attachments/{attachmentId}/content")
	public ResponseEntity<byte[]> deathDocumentAttachmentContent(@PathVariable UUID deathDocumentId,
			@PathVariable UUID attachmentId, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return IntakeFileResponses.of(service.legalOpenDeathDocumentAttachment(deathDocumentId, attachmentId, principal));
	}

	/**
	 * {@code GET .../verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments}
	 * Liệt kê file đính kèm của bản di chúc giấy gốc.
	 */
	@GetMapping("/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments")
	public List<IntakeAttachmentResponse> originalWillAttachments(@PathVariable UUID caseId, @PathVariable UUID intakeId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return service.legalListForOriginalWill(caseId, intakeId, principal);
	}

	/**
	 * {@code GET .../original-will-intakes/{intakeId}/attachments/{attachmentId}/content}
	 * Tải nội dung file đính kèm của di chúc giấy gốc.
	 */
	@GetMapping("/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments/{attachmentId}/content")
	public ResponseEntity<byte[]> originalWillAttachmentContent(@PathVariable UUID caseId, @PathVariable UUID intakeId,
			@PathVariable UUID attachmentId, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return IntakeFileResponses.of(service.legalOpenOriginalWillAttachment(caseId, intakeId, attachmentId, principal));
	}

	/**
	 * {@code GET .../verification-cases/{caseId}/basis-dossier/versions/{versionNo}/content}
	 * Tải file của một phiên bản văn bản căn cứ đã được Staff chuyển cho Legal.
	 *
	 * @param versionNo số phiên bản, tối thiểu 1
	 */
	@GetMapping("/verification-cases/{caseId}/basis-dossier/versions/{versionNo}/content")
	public ResponseEntity<byte[]> basisVersionContent(@PathVariable UUID caseId, @PathVariable @Min(1) int versionNo,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return IntakeFileResponses.of(service.legalOpenBasisVersion(caseId, versionNo, principal));
	}
}
