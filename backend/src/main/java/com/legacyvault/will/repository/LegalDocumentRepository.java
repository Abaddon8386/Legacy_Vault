package com.legacyvault.will.repository;

import org.springframework.data.repository.Repository;

import com.legacyvault.will.entity.LegalDocument;

/** Owner chỉ tạo bản ghi; cập nhật trạng thái thẩm định thuộc luồng Legal (ST-15), không có ở đây. */
public interface LegalDocumentRepository extends Repository<LegalDocument, Long> {

	LegalDocument save(LegalDocument document);
}
