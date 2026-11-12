package com.legacyvault.verification.repository;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Metadata of an intake attachment; the query never loads the encrypted content.
 *
 * Kết quả projection của {@code StaffIntakeAttachmentRepository.findRowsByDeathDocument/findRowsByOriginalWill}, dùng
 * để dựng {@code IntakeAttachmentResponse}. {@code uploadedByUserId} là khóa nội bộ, không ra API.
 */
public record IntakeAttachmentRow(Long id, UUID publicId, String fileName, String contentType, long sizeBytes,
		String sha256Hash, Long uploadedByUserId, LocalDateTime uploadedAt) { }
