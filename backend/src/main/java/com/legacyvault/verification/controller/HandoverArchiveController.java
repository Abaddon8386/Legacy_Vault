package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverArchiveResponse;
import com.legacyvault.verification.service.HandoverArchiveService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
/**
 * Controller lưu trữ Vault sau bàn giao: chuyển Vault sang ARCHIVED và đóng ca xác minh bằng phiên bàn giao này (chỉ khi đã có bằng chứng đóng phiên, cổng hoàn tất kép đạt và biên nhận phủ hết phân bổ).
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
  * Lưu trữ Vault và đóng ca (idempotent nếu đã lưu trữ bởi đúng phiên này); trả về {@link HandoverArchiveResponse}.
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
