package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.CompletionProgressResponse;
import com.legacyvault.verification.service.AssetCompletionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
/**
 * Controller chỉ đọc tiến độ hoàn tất tài sản của một phiên bàn giao (handover session).
 * Phạm vi: {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}}.
 * Quyền: {@code ROLE_STAFF_EXECUTOR}. Ủy quyền cho {@link AssetCompletionService}; không ghi dữ liệu.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class AssetCompletionController {
 private final AssetCompletionService service;
 public AssetCompletionController(AssetCompletionService service){this.service=service;}
 /**
  * {@code GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/asset-completion}
  * Trả về {@link CompletionProgressResponse}: tiến độ các tài sản đã/chưa bàn giao trong phiên.
  *
  * @param caseId    mã công khai (UUID) của ca xác minh
  * @param sessionId mã công khai (UUID) của phiên bàn giao
  * @param actor     Staff đang đăng nhập (lấy từ JWT)
  * @return tiến độ hoàn tất tài sản
  */
 @GetMapping("/asset-completion")
 public CompletionProgressResponse get(@PathVariable UUID caseId,@PathVariable UUID sessionId,
  @AuthenticationPrincipal CustomUserPrincipal actor){return service.get(caseId,sessionId,actor);}
}
