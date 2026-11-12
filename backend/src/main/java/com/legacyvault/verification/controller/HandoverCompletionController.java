package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverCompletionResponse;
import com.legacyvault.verification.service.HandoverCompletionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
/**
 * Controller chỉ đọc: tiến độ hoàn tất tài sản và người nhận của phiên bàn giao cùng cờ sẵn sàng đóng phiên (cổng hoàn tất kép).
 * Phạm vi: {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}}.
 * Quyền: {@code ROLE_STAFF_EXECUTOR}. Ủy quyền cho {@link HandoverCompletionService}.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class HandoverCompletionController {
 private final HandoverCompletionService service;
 public HandoverCompletionController(HandoverCompletionService service){this.service=service;}
 /**
  * {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/completion-progress}
  * Trả về {@link HandoverCompletionResponse}: tiến độ tài sản, tiến độ người nhận, cờ ready và lý do.
  *
  * @param caseId    mã công khai của ca xác minh
  * @param sessionId mã công khai của phiên bàn giao
  * @param actor     Staff đang đăng nhập
  * @return tiến độ hoàn tất tổng hợp
  */
 @GetMapping("/completion-progress")
 public HandoverCompletionResponse get(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @AuthenticationPrincipal CustomUserPrincipal actor){return service.get(caseId,sessionId,actor);}
}
