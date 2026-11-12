package com.legacyvault.verification.controller;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.service.BeneficiaryReconciliationService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
/**
 * Controller đối soát xác nhận của người thụ hưởng (beneficiary confirmation) trong phiên bàn giao.
 * Phạm vi: {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}}.
 * Quyền: {@code ROLE_STAFF_EXECUTOR}.
 * Đọc danh sách qua {@link BeneficiaryReconciliationService}; nộp và đọc lại file xác nhận giấy qua
 * {@code SignedReceiptService}.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}")
@PreAuthorize("hasRole('STAFF_EXECUTOR')")
public class BeneficiaryReconciliationController {
    private final BeneficiaryReconciliationService service;
    private final com.legacyvault.verification.service.SignedReceiptService receipts;
    public BeneficiaryReconciliationController(BeneficiaryReconciliationService service,com.legacyvault.verification.service.SignedReceiptService receipts){this.service=service;this.receipts=receipts;}
    /**
     * {@code GET .../handover-sessions/{sessionId}/beneficiary-confirmations}
     * Liệt kê xác nhận của từng người thụ hưởng trong phiên.
     *
     * @return danh sách {@link BeneficiaryConfirmationResponse}
     */
    @GetMapping("/beneficiary-confirmations")
    public List<BeneficiaryConfirmationResponse> list(@PathVariable UUID caseId,@PathVariable UUID sessionId,
            @AuthenticationPrincipal CustomUserPrincipal actor){return service.list(caseId,sessionId,actor);}
    /**
     * {@code POST .../handover-sessions/{sessionId}/beneficiaries/{beneficiaryId}/confirmation}
     * Nhận multipart: phần {@code file} (bản scan phiếu xác nhận có chữ ký), {@code attested} (người thụ hưởng đã
     * xác nhận hay chưa) và {@code paperReference} (số tham chiếu giấy, tùy chọn). Ủy quyền cho
     * {@code SignedReceiptService.confirm}.
     *
     * @param beneficiaryId mã công khai của người thụ hưởng
     * @return xác nhận vừa ghi nhận
     */
    @PostMapping(value="/beneficiaries/{beneficiaryId}/confirmation",consumes="multipart/form-data")
    public BeneficiaryConfirmationResponse confirm(@PathVariable UUID caseId,@PathVariable UUID sessionId,
            @PathVariable UUID beneficiaryId,@RequestPart("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam boolean attested,@RequestParam(required=false) String paperReference,
            @AuthenticationPrincipal CustomUserPrincipal actor){return receipts.confirm(caseId,sessionId,beneficiaryId,file,attested,paperReference,actor);}
    /**
     * {@code GET .../handover-sessions/{sessionId}/beneficiary-confirmations/{confirmationId}/file}
     * Tải lại file xác nhận đã nộp; trả về dạng attachment an toàn qua {@link IntakeFileResponses}.
     *
     * @param confirmationId mã công khai của bản xác nhận
     * @return byte của file kèm header bảo mật
     */
    @GetMapping("/beneficiary-confirmations/{confirmationId}/file")
    public org.springframework.http.ResponseEntity<byte[]> file(@PathVariable UUID caseId,@PathVariable UUID sessionId,
      @PathVariable UUID confirmationId,@AuthenticationPrincipal CustomUserPrincipal actor){return IntakeFileResponses.of(receipts.read(caseId,sessionId,confirmationId,actor));}
}
