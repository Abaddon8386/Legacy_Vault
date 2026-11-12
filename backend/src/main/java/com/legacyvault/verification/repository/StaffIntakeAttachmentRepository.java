package com.legacyvault.verification.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.legacyvault.verification.entity.StaffIntakeAttachment;

/**
 * Bảng file đính kèm tiếp nhận ({@code StaffIntakeAttachment}); dùng bởi {@code IntakeAttachmentService}.
 */
public interface StaffIntakeAttachmentRepository extends JpaRepository<StaffIntakeAttachment, Long> {

	/**
	 * Số file đính kèm của một giấy tờ chứng tử (kiểm tra giới hạn).
	 */
	long countByDeathDocumentRecordId(Long deathDocumentRecordId);

	/**
	 * Số file đính kèm của một lần nhận di chúc gốc.
	 */
	long countByOriginalWillIntakeId(Long originalWillIntakeId);

	/**
	 * Tải file đính kèm (kể cả nội dung mã hóa) của giấy tờ chứng tử.
	 */
	Optional<StaffIntakeAttachment> findByPublicIdAndDeathDocumentRecordId(UUID publicId, Long deathDocumentRecordId);

	/**
	 * Tải file đính kèm của lần nhận di chúc gốc.
	 */
	Optional<StaffIntakeAttachment> findByPublicIdAndOriginalWillIntakeId(UUID publicId, Long originalWillIntakeId);

	@Query("""
		select new com.legacyvault.verification.repository.IntakeAttachmentRow(a.attachmentId, a.publicId,
			a.originalFileName, a.contentType, a.fileSizeBytes, a.sha256Hash, a.uploadedByUserId, a.uploadedAt)
		from StaffIntakeAttachment a
		where a.deathDocumentRecordId = :recordId
		order by a.attachmentId asc
		""")
	/**
	 * Metadata file đính kèm của giấy tờ chứng tử, không nạp nội dung.
	 */
	List<IntakeAttachmentRow> findRowsByDeathDocument(@Param("recordId") Long recordId);

	@Query("""
		select new com.legacyvault.verification.repository.IntakeAttachmentRow(a.attachmentId, a.publicId,
			a.originalFileName, a.contentType, a.fileSizeBytes, a.sha256Hash, a.uploadedByUserId, a.uploadedAt)
		from StaffIntakeAttachment a
		where a.originalWillIntakeId = :intakeId
		order by a.attachmentId asc
		""")
	/**
	 * Metadata file đính kèm của lần nhận di chúc gốc, không nạp nội dung.
	 */
	List<IntakeAttachmentRow> findRowsByOriginalWill(@Param("intakeId") Long intakeId);
}
