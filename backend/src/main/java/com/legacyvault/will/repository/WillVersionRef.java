package com.legacyvault.will.repository;

/**
 * Tham chiếu một phiên bản bản scan di chúc, không nạp nội dung file mã hóa.
 *
 * <ul>
 * <li>{@code assetVersionId} - khóa chính phiên bản</li>
 * <li>{@code versionNo} - số phiên bản</li>
 * <li>{@code sha256Hash} - băm SHA-256 của nội dung</li>
 * </ul>
 */
public record WillVersionRef(Long assetVersionId, int versionNo, String sha256Hash) {
}
