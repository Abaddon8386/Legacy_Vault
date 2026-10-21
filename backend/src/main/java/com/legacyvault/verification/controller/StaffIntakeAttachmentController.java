package com.legacyvault.verification.controller;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.IntakeAttachmentResponse;
import com.legacyvault.verification.service.IntakeAttachmentService;

import jakarta.validation.constraints.Min;

/**
 * PS-103: Staff attaches files to the received death documents and the original paper will, and reads them back, plus
 * reads the file of a legal-basis version. Only the Staff assigned to the case (missing role is 403, any other case is
 * 404). No API edits or deletes an attachment: it is evidence.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class StaffIntakeAttachmentController {

	private final IntakeAttachmentService service;

	public StaffIntakeAttachmentController(IntakeAttachmentService service) {
		this.service = service;
	}

	@PostMapping(path = "/death-documents/{recordId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<IntakeAttachmentResponse> attachToDeathDocument(@PathVariable UUID caseId,
			@PathVariable UUID recordId, @RequestPart(name = "file", required = false) MultipartFile file,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		IntakeAttachmentResponse created = service.uploadToDeathDocument(caseId, recordId, principal, file);
		return ResponseEntity.created(URI.create("/api/v1/staff/verification-cases/" + caseId + "/death-documents/"
				+ recordId + "/attachments/" + created.id())).body(created);
	}

	@GetMapping("/death-documents/{recordId}/attachments")
	public List<IntakeAttachmentResponse> listDeathDocumentAttachments(@PathVariable UUID caseId,
			@PathVariable UUID recordId, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return service.listForDeathDocument(caseId, recordId, principal);
	}

	@GetMapping("/death-documents/{recordId}/attachments/{attachmentId}/content")
	public ResponseEntity<byte[]> deathDocumentAttachmentContent(@PathVariable UUID caseId, @PathVariable UUID recordId,
			@PathVariable UUID attachmentId, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return IntakeFileResponses.of(service.openDeathDocumentAttachment(caseId, recordId, attachmentId, principal));
	}

	@PostMapping(path = "/original-will-intakes/{intakeId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<IntakeAttachmentResponse> attachToOriginalWill(@PathVariable UUID caseId,
			@PathVariable UUID intakeId, @RequestPart(name = "file", required = false) MultipartFile file,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		IntakeAttachmentResponse created = service.uploadToOriginalWill(caseId, intakeId, principal, file);
		return ResponseEntity.created(URI.create("/api/v1/staff/verification-cases/" + caseId + "/original-will-intakes/"
				+ intakeId + "/attachments/" + created.id())).body(created);
	}

	@GetMapping("/original-will-intakes/{intakeId}/attachments")
	public List<IntakeAttachmentResponse> listOriginalWillAttachments(@PathVariable UUID caseId,
			@PathVariable UUID intakeId, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return service.listForOriginalWill(caseId, intakeId, principal);
	}

	@GetMapping("/original-will-intakes/{intakeId}/attachments/{attachmentId}/content")
	public ResponseEntity<byte[]> originalWillAttachmentContent(@PathVariable UUID caseId, @PathVariable UUID intakeId,
			@PathVariable UUID attachmentId, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return IntakeFileResponses.of(service.openOriginalWillAttachment(caseId, intakeId, attachmentId, principal));
	}

	@GetMapping("/basis-dossier/versions/{versionNo}/content")
	public ResponseEntity<byte[]> basisVersionContent(@PathVariable UUID caseId, @PathVariable @Min(1) int versionNo,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return IntakeFileResponses.of(service.openBasisVersionForStaff(caseId, versionNo, principal));
	}
}
