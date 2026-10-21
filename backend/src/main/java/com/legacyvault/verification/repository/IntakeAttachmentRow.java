package com.legacyvault.verification.repository;

import java.time.LocalDateTime;
import java.util.UUID;

/** Metadata of an intake attachment; the query never loads the encrypted content. */
public record IntakeAttachmentRow(Long id, UUID publicId, String fileName, String contentType, long sizeBytes,
		String sha256Hash, Long uploadedByUserId, LocalDateTime uploadedAt) { }
