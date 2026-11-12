package com.legacyvault.will.repository;

import org.springframework.data.repository.Repository;

import com.legacyvault.will.entity.LegalDocument;

/**
 * Owner chỉ tạo bản ghi {@code legal_documents}; cập nhật trạng thái thẩm định thuộc luồng Legal (ST-15), không có ở đây.
 */
public interface LegalDocumentRepository extends Repository<LegalDocument, Long> {

	/**
	 * Lưu hồ sơ pháp lý mới (dùng khi tạo di chúc).
	 */
	LegalDocument save(LegalDocument document);
}
