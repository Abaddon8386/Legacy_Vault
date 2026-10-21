package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * PS-103: metadata of a file attached to a received document. Never contains content, a storage path or an internal key.
 * {@code subjectType} is DEATH_DOCUMENT or ORIGINAL_WILL; {@code subjectId} is that record's public id.
 */
public record IntakeAttachmentResponse(UUID id, UUID caseId, String subjectType, UUID subjectId, String fileName,
		String contentType, long sizeBytes, String sha256, UUID uploadedBy, Instant uploadedAt) { }
