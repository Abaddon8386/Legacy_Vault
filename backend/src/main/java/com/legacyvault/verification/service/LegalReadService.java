package com.legacyvault.verification.service;

import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.dto.LegalReadDtos.*;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.vault.entity.Vault;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

/**
 * Các thao tác đọc phía Legal: hàng đợi ca và ngữ cảnh ca (ST-20 đến ST-22). Không thay đổi dữ liệu.
 *
 * <p>{@link #queue} phục vụ {@code GET /api/v1/legal-verifications/verification-cases} (LEGAL_VERIFIER) qua
 * {@code LegalReadController}. {@link #context} cung cấp dữ liệu cho {@code GET .../verification-cases/{caseId}/context}
 * (thông qua {@code DistributionWorkflowService.legalContext}). Ngữ cảnh gồm giấy tờ chứng tử, so sánh di chúc, hồ sơ căn
 * cứ, snapshot phiên bản mới nhất, quyết định gần nhất, kết quả tòa án và khả năng thực hiện hành động phê duyệt/mở khóa.
 */
@Service
public class LegalReadService {
    private final LegalQueueRepository queue;
    private final LegalBasisCaseAccess access;
    private final BasisDossierViewService dossiers;
    private final WillComparisonService wills;
    private final DeathDocumentRecordRepository deaths;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final LegalBasisReviewHistoryRepository history;
    private final CourtDecisionRepository courtDecisions;
    private final LegalApprovalGuard approvals;
    private final CourtRouteGuard court;
    private final UserRepository users;
    /**
     * @param queue repository hàng đợi ca của Legal
     * @param access khóa Vault/case/dossier theo thứ tự chuẩn
     * @param dossiers dịch vụ dựng view hồ sơ căn cứ
     * @param wills dịch vụ so sánh di chúc
     * @param deaths repository bản ghi giấy chứng tử
     * @param versions repository phiên bản hồ sơ căn cứ
     * @param allocations repository dòng phân bổ theo phiên bản
     * @param history repository lịch sử review/quyết định
     * @param courtDecisions repository quyết định tòa án
     * @param approvals guard kiểm tra phê duyệt hiện hành
     * @param court guard tuyến tòa án
     * @param users repository người dùng
     */
    public LegalReadService(LegalQueueRepository queue,LegalBasisCaseAccess access,BasisDossierViewService dossiers,
        WillComparisonService wills,DeathDocumentRecordRepository deaths,LegalBasisDossierVersionRepository versions,
        LegalBasisVersionAllocationRepository allocations,LegalBasisReviewHistoryRepository history,
        CourtDecisionRepository courtDecisions,LegalApprovalGuard approvals,CourtRouteGuard court,UserRepository users) {
        this.queue=queue;this.access=access;this.dossiers=dossiers;this.wills=wills;this.deaths=deaths;this.versions=versions;
        this.allocations=allocations;this.history=history;this.courtDecisions=courtDecisions;this.approvals=approvals;this.court=court;this.users=users;
    }
    /**
     * Lấy hàng đợi ca cho Legal có phân trang.
     *
     * @param principal Legal Verifier đang đăng nhập
     * @param status lọc trạng thái (OPEN, CLOSED, CANCELLED) hoặc {@code null}
     * @param route lọc tuyến xử lý (NOTARIAL, COURT, ON_HOLD) hoặc {@code null}
     * @param page số trang từ 0
     * @param size kích thước trang từ 1 đến 100
     * @return trang các {@code QueueItem}
     * @throws BusinessException {@code VALIDATION_FAILED} khi tham số lọc hoặc phân trang không hợp lệ
     */
    @Transactional(readOnly=true)
    public PageResponse<QueueItem> queue(CustomUserPrincipal principal,String status,String route,int page,int size) {
        CustomUserPrincipal.requireUserId(principal);
        if(page<0 || size<1 || size>100 || (status!=null && !Set.of("OPEN","CLOSED","CANCELLED").contains(status))
            || (route!=null && !Set.of("NOTARIAL","COURT","ON_HOLD").contains(route))) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        return queue.page(status,route,page,size);
    }
    /**
     * Dựng ngữ cảnh đọc của một ca cho Legal. Đây là lần đọc có khóa (timeout 20 giây), không ghi dữ liệu. Không được bắt
     * các guard ghi có ném lỗi để tính khả năng thao tác; thay vào đó dùng các hàm {@code *Blocker} trả mã lỗi.
     *
     * <p>Các bước: khóa Vault -> case -> dossier (dossier có thể chưa có); lấy tham chiếu giấy chứng tử; lấy tổng quan di
     * chúc; nếu có dossier thì lấy phiên bản mới nhất và chứng cứ tòa án, tính hash phạm vi phân bổ, xác định snapshot còn
     * FRESH/hiện hành, quyết định duyệt/từ chối gần nhất và kết quả tòa án; tính mã chặn của hành động phê duyệt và mở khóa.
     *
     * @param principal Legal Verifier đang đăng nhập
     * @param caseId public id của hồ sơ xác minh
     * @return ngữ cảnh gồm {@code Capabilities} cho từng hành động
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu không có case
     */
    @Transactional(timeout=20)
    public Context context(CustomUserPrincipal principal,UUID caseId) {
        CustomUserPrincipal.requireUserId(principal);
        var locked=access.lockContext(caseId);
        var c=locked.verificationCase();var v=locked.vault();var d=locked.dossier();
        var references=deaths.findByVerificationCaseIdOrderByReceivedAtDescDeathDocumentRecordIdDesc(c.getVerificationCaseId()).stream()
            .map(x->new DeathReference(x.getPublicId(),x.getDocumentType(),x.getReceivedAt().toInstant(ZoneOffset.UTC))).toList();
        var will=wills.overview(caseId);
        Snapshot snapshot=null;
        ErrorCode approvalReason=ErrorCode.BASIS_DOSSIER_INVALID_STATE,unlockReason=approvalReason;
        if(d!=null) {
            int latest=versions.findMaxVersionNo(d.getLegalBasisDossierId());
            var version=latest==0?null:versions.findCourtEvidence(d.getLegalBasisDossierId(),latest).orElse(null);
            String hash=AllocationScopeHash.hashApprovalRows(allocations.findRowsByDossier(d.getLegalBasisDossierId()).stream().filter(x->x.versionNo()==latest).toList());
            boolean fresh=version!=null && approvals.reviewBlocker(d,version)==null;
            boolean current=version!=null && approvals.currentApprovalBlocker(d,version)==null;
            var decision=history.findFirstByDossierIdAndReviewStatusInOrderByIdDesc(d.getLegalBasisDossierId(),List.of("LEGAL_APPROVED","LEGAL_REJECTED"))
                .map(x->new Decision(x.getPublicId(),x.getVersionNo(),x.getSha256Hash(),x.getAllocationHash(),x.getDisputeStatus(),x.getReviewStatus(),
                    x.getReviewedByUserId()==null?null:users.findById(x.getReviewedByUserId()).map(u->u.getPublicId()).orElse(null),
                    x.getReviewedAt()==null?null:x.getReviewedAt().toInstant(ZoneOffset.UTC))).orElse(null);
            String courtResult=version==null?null:courtDecisions.findFirstByDossierVersionIdOrderByIdDesc(version.id()).map(CourtDecision::getResult).orElse(null);
            snapshot=new Snapshot(d.getPublicId(),latest,d.getRequiredVersionNo(),version==null?null:version.sha256(),hash,d.getDisputeStatus(),d.getReviewStatus(),fresh,current,decision,courtResult);
            ErrorCode base=baseBlocker(c,v,d,version);
            if(base==null) base=court.blocker(d);
            approvalReason=base!=null?base:(fresh?null:ErrorCode.LEGAL_DECISION_STALE);
            unlockReason=base;
            if(unlockReason==null) unlockReason=court.blocker(d);
            if(unlockReason==null) unlockReason=approvals.currentApprovalBlocker(d,version);
        }
        return new Context(c.getPublicId(),c.getCaseNumber(),v.getPublicId(),c.getStatus(),v.getStatus(),references,will,
            d==null?null:dossiers.view(c,true),snapshot,new Capabilities(action(approvalReason),action(unlockReason)),Instant.now());
    }
    /**
     * Trả mã lỗi chặn chung cho phê duyệt/mở khóa, hoặc {@code null} nếu không bị chặn: case đóng hoặc phiên bản sai thì
     * {@code BASIS_DOSSIER_INVALID_STATE}; Vault hay dossier đang hold thì {@code LEGAL_WORKFLOW_ON_HOLD}; Vault không ở
     * LEGAL_BASIS_VERIFICATION, dossier chưa FORWARDED/không thể xem xét, phiên bản chưa forward hoặc thiếu SHA-256 thì
     * {@code BASIS_DOSSIER_INVALID_STATE}.
     */
    private static ErrorCode baseBlocker(VerificationCase c,Vault vault,LegalBasisDossier d,CourtEvidenceVersion version) {
        if(!c.isOpen()) return ErrorCode.BASIS_DOSSIER_INVALID_STATE;
        if(Vault.STATUS_ON_HOLD.equals(vault.getStatus()) || LegalBasisDossier.ROUTE_ON_HOLD.equals(d.getRoute())) return ErrorCode.LEGAL_WORKFLOW_ON_HOLD;
        if(!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus()) || !LegalBasisDossier.STATUS_FORWARDED.equals(d.getStatus())
            || !d.isLegalReviewable() || version==null || version.version()<d.getRequiredVersionNo() || !"FORWARDED".equals(version.forwardStatus())
            || version.sha256()==null || version.sha256().isBlank()) return ErrorCode.BASIS_DOSSIER_INVALID_STATE;
        return null;
    }
    /**
     * Chuyển mã chặn thành {@code Action}: cho phép khi không có mã, ngược lại kèm tên mã lỗi làm lý do.
     */
    private static Action action(ErrorCode reason) {return new Action(reason==null,reason==null?null:reason.name());}
}
