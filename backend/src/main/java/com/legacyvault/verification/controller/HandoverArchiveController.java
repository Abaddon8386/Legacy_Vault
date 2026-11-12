package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverArchiveResponse;
import com.legacyvault.verification.service.HandoverArchiveService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
/**
 * Controller lưu trữ (archive) phiên bàn giao sau khi đóng.
 * Phạm vi: {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}}.
 * Quyền: {@code ROLE_STAFF_EXECUTOR}. Ủy quyền cho {@link HandoverArchiveService}.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class HandoverArchiveController {
 private final HandoverArchiveService service;
 public HandoverArchiveController(HandoverArchiveService service){this.service=service;}
 /**
  * {@code POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/archive}
  * Lưu trữ phiên bàn giao; trả về {@link HandoverArchiveResponse}.
  *
  * @param caseId    mã công khai của ca xác minh
  * @param sessionId mã công khai của phiên bàn giao
  * @param actor     Staff đang đăng nhập
  * @return kết quả lưu trữ
  */
 @PostMapping("/archive")
 public HandoverArchiveResponse archive(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @AuthenticationPrincipal CustomUserPrincipal actor){return service.archive(caseId,sessionId,actor);}
}
