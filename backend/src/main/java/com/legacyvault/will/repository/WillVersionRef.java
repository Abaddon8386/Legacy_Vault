package com.legacyvault.will.repository;

/** Tham chiếu một phiên bản bản scan di chúc (khóa + hash), không nạp nội dung file mã hóa. */
public record WillVersionRef(Long assetVersionId, int versionNo, String sha256Hash) {
}
