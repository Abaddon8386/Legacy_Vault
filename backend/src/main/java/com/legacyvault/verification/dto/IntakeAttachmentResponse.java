package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * PS-103: metadata of a file attached to a received document. Never contains content, a storage path or an internal key.
 * {@code subjectType} is DEATH_DOCUMENT or ORIGINAL_WILL; {@code subjectId} is that record's public id.
 */
public record IntakeAttachmentResponse(UUID id, UUID caseId, String subjectType, UUID subjectId, String fileName,
		String contentType, long sizeBytes, String sha256, UUID uploadedBy, Instant uploadedAt,
		com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
	public IntakeAttachmentResponse(UUID id, UUID caseId, String subjectType, UUID subjectId, String fileName,
			String contentType, long sizeBytes, String sha256, UUID uploadedBy, Instant uploadedAt) {
		this(id, caseId, subjectType, subjectId, fileName, contentType, sizeBytes, sha256, uploadedBy, uploadedAt, null);
	}
	public IntakeAttachmentResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) {
		return new IntakeAttachmentResponse(id, caseId, subjectType, subjectId, fileName, contentType, sizeBytes, sha256, uploadedBy, uploadedAt, receipt);
	}
}
