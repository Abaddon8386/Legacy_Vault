package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * PS-103: metadata của file đính kèm vào giấy tờ đã nhận. Không bao giờ chứa nội dung, đường dẫn lưu trữ hay khóa nội bộ.
 * {@code subjectType} is DEATH_DOCUMENT or ORIGINAL_WILL; {@code subjectId} is that record's public id.
 *
 * Các trường: {@code id}, {@code caseId}, {@code subjectType}, {@code subjectId}, {@code fileName},
 * {@code contentType}, {@code sizeBytes}, {@code sha256}, {@code uploadedBy}, {@code uploadedAt},
 * {@code notification} (biên nhận thông báo, có thể null).
 */
public record IntakeAttachmentResponse(UUID id, UUID caseId, String subjectType, UUID subjectId, String fileName,
		String contentType, long sizeBytes, String sha256, UUID uploadedBy, Instant uploadedAt,
		com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
	/**
	 * Constructor không có {@code notification}.
	 */
	public IntakeAttachmentResponse(UUID id, UUID caseId, String subjectType, UUID subjectId, String fileName,
			String contentType, long sizeBytes, String sha256, UUID uploadedBy, Instant uploadedAt) {
		this(id, caseId, subjectType, subjectId, fileName, contentType, sizeBytes, sha256, uploadedBy, uploadedAt, null);
	}
	/**
	 * Trả bản sao có gắn biên nhận thông báo.
	 */
	public IntakeAttachmentResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) {
		return new IntakeAttachmentResponse(id, caseId, subjectType, subjectId, fileName, contentType, sizeBytes, sha256, uploadedBy, uploadedAt, receipt);
	}
}
