package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.CompletionProgressResponse;
import com.legacyvault.verification.service.BeneficiaryCompletionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
/**
 * Controller chỉ đọc tiến độ xác nhận của người thụ hưởng trong một phiên bàn giao.
 * Phạm vi: {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}}.
 * Quyền: {@code ROLE_STAFF_EXECUTOR}. Ủy quyền cho {@link BeneficiaryCompletionService}.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class BeneficiaryCompletionController {
 private final BeneficiaryCompletionService service;
 public BeneficiaryCompletionController(BeneficiaryCompletionService service){this.service=service;}
 /**
  * {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiary-completion}
  * Trả về {@link CompletionProgressResponse}: số người thụ hưởng đã xác nhận nhận bàn giao so với tổng số.
  *
  * @param caseId    mã công khai của ca xác minh
  * @param sessionId mã công khai của phiên bàn giao
  * @param actor     Staff đang đăng nhập
  * @return tiến độ hoàn tất phía người thụ hưởng
  */
 @GetMapping("/beneficiary-completion")
 public CompletionProgressResponse get(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @AuthenticationPrincipal CustomUserPrincipal actor){return service.get(caseId,sessionId,actor);}
}
