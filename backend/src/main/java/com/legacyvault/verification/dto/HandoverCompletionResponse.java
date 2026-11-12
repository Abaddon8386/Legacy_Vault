package com.legacyvault.verification.dto;
/**
 * Kết quả của {@code GET .../handover-sessions/{sessionId}/completion-progress}.
 *
 * - {@code assets}, {@code beneficiaries}: tiến độ tài sản và người thụ hưởng.
 * - {@code ready}: đủ điều kiện đóng phiên.
 * - {@code reason}: lý do chưa sẵn sàng (nếu có).
 */
public record HandoverCompletionResponse(CompletionProgressResponse assets,
 CompletionProgressResponse beneficiaries,boolean ready,String reason) {}
