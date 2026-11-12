package com.legacyvault.verification.dto;
/**
 * Tiến độ hoàn tất (dùng cho {@code GET .../asset-completion} và {@code .../beneficiary-completion}).
 *
 * - {@code completed}: số mục đã hoàn tất.
 * - {@code total}: tổng số mục.
 * - {@code pending}: số mục còn lại.
 * - {@code complete}: true khi đã hoàn tất toàn bộ.
 */
public record CompletionProgressResponse(int completed,int total,int pending,boolean complete) {}
