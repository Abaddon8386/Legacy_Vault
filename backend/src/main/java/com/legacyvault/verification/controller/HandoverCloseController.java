package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverCloseResponse;
import com.legacyvault.verification.service.HandoverCloseService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
/**
 * Controller đóng phiên bàn giao (OPEN sang COMPLETED) khi cổng hoàn tất kép đạt (mọi tài sản và người nhận đã xong); lưu bằng chứng đóng phiên.
 * Phạm vi: {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}}.
 * Quyền: {@code ROLE_STAFF_EXECUTOR}. Ủy quyền cho {@link HandoverCloseService}.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class HandoverCloseController {
 private final HandoverCloseService service;
 public HandoverCloseController(HandoverCloseService service){this.service=service;}
 /**
  * {@code POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/close}
  * Đóng phiên bàn giao (idempotent nếu đã COMPLETED); trả về {@link HandoverCloseResponse}.
  *
  * @param caseId    mã công khai của ca xác minh
  * @param sessionId mã công khai của phiên bàn giao
  * @param actor     Staff đang đăng nhập
  * @return kết quả đóng phiên
  */
 @PostMapping("/close")
 public HandoverCloseResponse close(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @AuthenticationPrincipal CustomUserPrincipal actor){return service.close(caseId,sessionId,actor);}
}
