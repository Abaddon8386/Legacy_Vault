package com.legacyvault.verification.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.legacyvault.verification.entity.StaffIntakeAttachment;

public interface StaffIntakeAttachmentRepository extends JpaRepository<StaffIntakeAttachment, Long> {

	long countByDeathDocumentRecordId(Long deathDocumentRecordId);

	long countByOriginalWillIntakeId(Long originalWillIntakeId);

	Optional<StaffIntakeAttachment> findByPublicIdAndDeathDocumentRecordId(UUID publicId, Long deathDocumentRecordId);

	Optional<StaffIntakeAttachment> findByPublicIdAndOriginalWillIntakeId(UUID publicId, Long originalWillIntakeId);

	@Query("""
		select new com.legacyvault.verification.repository.IntakeAttachmentRow(a.attachmentId, a.publicId,
			a.originalFileName, a.contentType, a.fileSizeBytes, a.sha256Hash, a.uploadedByUserId, a.uploadedAt)
		from StaffIntakeAttachment a
		where a.deathDocumentRecordId = :recordId
		order by a.attachmentId asc
		""")
	List<IntakeAttachmentRow> findRowsByDeathDocument(@Param("recordId") Long recordId);

	@Query("""
		select new com.legacyvault.verification.repository.IntakeAttachmentRow(a.attachmentId, a.publicId,
			a.originalFileName, a.contentType, a.fileSizeBytes, a.sha256Hash, a.uploadedByUserId, a.uploadedAt)
		from StaffIntakeAttachment a
		where a.originalWillIntakeId = :intakeId
		order by a.attachmentId asc
		""")
	List<IntakeAttachmentRow> findRowsByOriginalWill(@Param("intakeId") Long intakeId);
}
