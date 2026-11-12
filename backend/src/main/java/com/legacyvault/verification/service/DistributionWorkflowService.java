package com.legacyvault.verification.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.BasisIntakeMetadata;
import com.legacyvault.verification.dto.CourtDecisionRequest;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.ActionBody;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.AllocationInfo;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.AllocationItem;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.Capability;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.DocumentInfo;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.Prerequisites;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.Receipt;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.RequestInfo;
import com.legacyvault.verification.dto.DistributionWorkflowDtos.View;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.dto.LegalApprovalResponse;
import com.legacyvault.verification.dto.LegalReadDtos.Action;
import com.legacyvault.verification.dto.LegalReadDtos.Capabilities;
import com.legacyvault.verification.dto.LegalReadDtos.Context;
import com.legacyvault.verification.dto.LegalVaultUnlockResponse;
import com.legacyvault.verification.entity.DistributionWorkflowEvent;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.BasisVersionRow;
import com.legacyvault.verification.repository.DistributionWorkflowEventRepository;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;

/**
 * Distribution workflow (PR #226 contract) kept apart from the document upload and from the final approval:
 * Legal requests documents -> Staff uploads and forwards -> Legal assesses the document -> Staff submits the
 * allocation -> Legal reviews the allocation -> Legal's final approval -> separate unlock.
 *
 * The phase is derived from append-only {@code distribution_workflow_events} plus the dossier, never sent by a client.
 * Every mutation locks Vault -> case -> dossier, checks the revision and the exact document/allocation snapshot the caller
 * looked at, and appends one event; none of them moves a vault. The {@code receive/forward/decide/unlock} methods wrap the
 * existing use cases so the HTTP entry points cannot skip a step; they run in the same transaction as the wrapped call.
 *
 * <p>Tóm tắt (tiếng Việt): máy trạng thái phân chia tài sản giữa Staff và Legal. Pha hiện tại KHÔNG do client gửi mà được suy ra từ
 * log sự kiện chỉ-thêm {@code distribution_workflow_events} cùng hồ sơ căn cứ ({@link #compute}). Mỗi thao tác ghi khóa Vault → ca → dossier,
 * kiểm tra {@code revision} và đúng snapshot tài liệu/phân bổ mà người gọi đã xem, rồi thêm một sự kiện (không tự chuyển trạng thái Vault).
 *
 * Các endpoint ({@code DistributionWorkflowController}, {@code StaffBasisIntakeController}, {@code LegalBasisDossierController},
 * {@code LegalReadController}, {@code LegalVaultUnlockController}):
 * <ul>
 *   <li>Staff ({@code STAFF_EXECUTOR}): {@code GET|POST /api/v1/staff/verification-cases/{caseId}/distribution-workflow[/submit-allocations]},
 *       {@code POST .../basis-dossier/versions} → {@link #receive}, {@code POST .../basis-dossier/versions/{version}/forward} → {@link #forward}</li>
 *   <li>Legal ({@code LEGAL_VERIFIER}): {@code GET|POST /api/v1/legal-verifications/verification-cases/{caseId}/distribution-workflow[/request-documents
 *       | /approve-documents | /request-document-supplementation | /approve-allocations | /request-allocation-changes]},
 *       {@code POST .../basis-dossier/decision} → {@link #decide}, {@code POST .../unlock} → {@link #unlock},
 *       {@code GET .../{caseId}/context} → {@link #legalContext}</li>
 * </ul>
 * Bảng liên quan: {@code distribution_workflow_events}, {@code legal_basis_dossiers}, phiên bản và phân bổ; audit các action
 * {@code DISTRIBUTION_*}; thông báo qua {@code WorkflowNotificationService}.
 */
@Service
public class DistributionWorkflowService {

    /**
     * Tên workspace của Staff (dùng để chọn quy tắc và hướng thông báo).
     */
    public static final String STAFF = "STAFF";
    /**
     * Tên workspace của Legal.
     */
    public static final String LEGAL = "LEGAL";

    /**
     * Các hằng pha (phase) của workflow: chưa đủ điều kiện tiên quyết (khai tử chưa duyệt hoặc di chúc chưa khớp).
     */
    static final String PREREQUISITES_PENDING = "PREREQUISITES_PENDING";
    /**
     * Pha: Legal cần gửi yêu cầu tài liệu.
     */
    static final String DOCUMENT_REQUEST_NEEDED = "DOCUMENT_REQUEST_NEEDED";
    /**
     * Pha: chờ Staff tải lên và chuyển tiếp tài liệu.
     */
    static final String AWAITING_DOCUMENTS = "AWAITING_DOCUMENTS";
    /**
     * Pha: tài liệu đang chờ Legal đánh giá.
     */
    static final String DOCUMENTS_UNDER_REVIEW = "DOCUMENTS_UNDER_REVIEW";
    /**
     * Pha: chờ Staff nộp phân bổ.
     */
    static final String AWAITING_ALLOCATIONS = "AWAITING_ALLOCATIONS";
    /**
     * Pha: phân bổ đang chờ Legal duyệt.
     */
    static final String ALLOCATIONS_UNDER_REVIEW = "ALLOCATIONS_UNDER_REVIEW";
    /**
     * Pha: chờ Legal ra quyết định cuối cùng.
     */
    static final String FINAL_APPROVAL = "FINAL_APPROVAL";
    /**
     * Pha: Legal đã từ chối quyết định cuối trên đúng snapshot hiện tại.
     */
    static final String REJECTED = "REJECTED";
    /**
     * Pha: quyết định cuối đã được duyệt và còn hiệu lực, chờ mở khóa Vault.
     */
    static final String APPROVED = "APPROVED";
    /**
     * Pha: Vault đã mở khóa (hoặc đang/đã bàn giao).
     */
    static final String UNLOCKED = "UNLOCKED";
    /**
     * Pha: ca đã đóng.
     */
    static final String CLOSED = "CLOSED";

    /**
     * Loại thực thể ghi vào audit log.
     */
    private static final String ENTITY_TYPE = "DISTRIBUTION_WORKFLOW";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
    private static final String RULE_ID = "LV-DIST-001";
    /**
     * Các trạng thái Vault cho thấy giấy tờ khai tử đã được Legal duyệt (điều kiện tiên quyết).
     */
    private static final Set<String> DEATH_DECIDED_VAULT_STATES = Set.of(Vault.STATUS_DOCUMENT_VERIFICATION,
            Vault.STATUS_WILL_VERIFICATION, Vault.STATUS_AWAITING_LEGAL_BASIS, Vault.STATUS_ON_HOLD,
            Vault.STATUS_LEGAL_BASIS_VERIFICATION, Vault.STATUS_UNLOCKED, Vault.STATUS_HANDOVER_IN_PROGRESS,
            Vault.STATUS_ARCHIVED);
    /**
     * Các trạng thái Vault coi như đã mở khóa.
     */
    private static final Set<String> UNLOCKED_VAULT_STATES = Set.of(Vault.STATUS_UNLOCKED,
            Vault.STATUS_HANDOVER_IN_PROGRESS, Vault.STATUS_ARCHIVED);

    /**
     * Action name -> workspace and the only phase in which it is allowed. Same names as the FE contract.
     *
     * @param workspace workspace được phép thực hiện hành động ({@code STAFF} hoặc {@code LEGAL})
     * @param phase pha duy nhất mà hành động được phép
     */
    private record Rule(String workspace, String phase) { }

    /**
     * Bảng quy tắc hành động: tên hành động → workspace và pha cho phép; khởi tạo trong khối static bên dưới.
     */
    private static final Map<String, Rule> RULES = new LinkedHashMap<>();
    static {
        RULES.put("requestDocuments", new Rule(LEGAL, DOCUMENT_REQUEST_NEEDED));
        RULES.put("uploadDocuments", new Rule(STAFF, AWAITING_DOCUMENTS));
        RULES.put("forwardDocuments", new Rule(STAFF, AWAITING_DOCUMENTS));
        RULES.put("approveDocuments", new Rule(LEGAL, DOCUMENTS_UNDER_REVIEW));
        RULES.put("requestDocumentSupplementation", new Rule(LEGAL, DOCUMENTS_UNDER_REVIEW));
        RULES.put("submitAllocations", new Rule(STAFF, AWAITING_ALLOCATIONS));
        RULES.put("approveAllocations", new Rule(LEGAL, ALLOCATIONS_UNDER_REVIEW));
        RULES.put("requestAllocationChanges", new Rule(LEGAL, ALLOCATIONS_UNDER_REVIEW));
    }

    /**
     * Ảnh chụp trạng thái workflow của một ca tại thời điểm tính (bất biến), do {@link #compute} dựng.
     *
     * @param verificationCase ca xác minh
     * @param vault Vault của ca
     * @param dossier hồ sơ căn cứ (có thể null nếu chưa có)
     * @param revision số hiệu thay đổi dùng để phát hiện client cũ ({@code DISTRIBUTION_WORKFLOW_STALE})
     * @param phase pha hiện tại
     * @param prerequisites điều kiện tiên quyết (khai tử đã duyệt, di chúc khớp)
     * @param request sự kiện yêu cầu tài liệu mới nhất của Legal
     * @param document phiên bản tài liệu đang xét (mới nhất đã lưu)
     * @param documentStatus PENDING, APPROVED hoặc CHANGES_REQUESTED của tài liệu
     * @param latestStored phiên bản mới nhất đã lưu
     * @param submitted sự kiện nộp phân bổ mới nhất
     * @param allocationStatus SUBMITTED, APPROVED hoặc CHANGES_REQUESTED của phân bổ
     * @param allocationRows các dòng phân bổ đã nộp
     * @param allocationHash hash các dòng phân bổ hiện tại
     * @param events toàn bộ log sự kiện của ca
     * @param feedback phản hồi gần nhất của Legal cho Staff
     * @param forwardedDocument phiên bản đã được Staff chuyển tiếp (Legal chỉ thấy bản này)
     * @param forwardedStatus trạng thái đánh giá của phiên bản đã chuyển tiếp
     */
    private record State(VerificationCase verificationCase, Vault vault, LegalBasisDossier dossier, long revision,
            String phase, Prerequisites prerequisites, DistributionWorkflowEvent request, BasisVersionRow document,
            String documentStatus, BasisVersionRow latestStored, DistributionWorkflowEvent submitted, String allocationStatus,
            List<AllocationRow> allocationRows, String allocationHash, List<DistributionWorkflowEvent> events,
            String feedback, BasisVersionRow forwardedDocument, String forwardedStatus) {
        boolean documentForwarded() {
            return document != null && "FORWARDED".equals(document.forwardStatus());
        }

        boolean onHold() {
            return Vault.STATUS_ON_HOLD.equals(vault.getStatus())
                    || (dossier != null && LegalBasisDossier.ROUTE_ON_HOLD.equals(dossier.getRoute()));
        }
    }

    private final LegalBasisCaseAccess access;
    private final StaffCaseLockRepository staffCases;
    private final LegalCaseLookupRepository lookup;
    private final VaultRepository vaults;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final DistributionWorkflowEventRepository events;
    private final WillComparisonService wills;
    private final CourtRouteGuard routeGuard;
    private final LegalApprovalGuard approvals;
    private final LegalBasisReviewService review;
    private final CourtDecisionService courtDecisions;
    private final BasisIntakeService intake;
    private final BasisForwardService forwarding;
    private final LegalApprovalService approvalService;
    private final LegalVaultUnlockService unlockService;
    private final LegalReadService reads;
    private final AuditService audit;
    private final com.legacyvault.notification.WorkflowNotificationService notifications;
    private final com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository decisionHistory;

    /**
     * Khởi tạo service với các repository, các service ủy quyền (tiếp nhận, chuyển tiếp, duyệt, mở khóa, đọc), audit và thông báo.
     */
    public DistributionWorkflowService(LegalBasisCaseAccess access, StaffCaseLockRepository staffCases,
            LegalCaseLookupRepository lookup, VaultRepository vaults, LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions, LegalBasisVersionAllocationRepository allocations,
            DistributionWorkflowEventRepository events, WillComparisonService wills, CourtRouteGuard routeGuard,
            LegalApprovalGuard approvals, LegalBasisReviewService review, CourtDecisionService courtDecisions,
            BasisIntakeService intake,
            BasisForwardService forwarding, LegalApprovalService approvalService, LegalVaultUnlockService unlockService,
            LegalReadService reads, AuditService audit, com.legacyvault.notification.WorkflowNotificationService notifications,
            com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository decisionHistory) {
        this.access = access;
        this.staffCases = staffCases;
        this.lookup = lookup;
        this.vaults = vaults;
        this.dossiers = dossiers;
        this.versions = versions;
        this.allocations = allocations;
        this.events = events;
        this.wills = wills;
        this.routeGuard = routeGuard;
        this.approvals = approvals;
        this.review = review;
        this.courtDecisions = courtDecisions;
        this.intake = intake;
        this.forwarding = forwarding;
        this.approvalService = approvalService;
        this.unlockService = unlockService;
        this.reads = reads;
        this.audit = audit;
        this.notifications = notifications;
        this.decisionHistory = decisionHistory;
    }

    // ------------------------------------------------------------------------------------------------ reads

    /**
     * Current workflow of a case. Staff only see a case assigned to them; Legal see any case.
     *
     * <p>Xem workflow hiện tại của ca. Endpoint: {@code GET /api/v1/staff/verification-cases/{caseId}/distribution-workflow} (Staff)
     * và {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/distribution-workflow} (Legal).
     *
     * @param caseId UUID công khai của ca
     * @param workspace {@link #STAFF} hoặc {@link #LEGAL}
     * @param principal người dùng đang đăng nhập
     * @return view gồm pha, revision, tài liệu, phân bổ và các khả năng (capabilities) cho từng hành động
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND nếu ca/Vault không tồn tại hoặc Staff không phụ trách ca
     */
    @Transactional(readOnly = true)
    public View view(UUID caseId, String workspace, CustomUserPrincipal principal) {
        Long actorId = CustomUserPrincipal.requireUserId(principal);
        VerificationCase found = STAFF.equals(workspace)
                ? staffCases.findOwnedByStaff(caseId, actorId).orElseThrow(DistributionWorkflowService::notFound)
                : lookup.findByPublicId(caseId).orElseThrow(DistributionWorkflowService::notFound);
        Vault vault = vaults.findById(found.getVaultId()).orElseThrow(DistributionWorkflowService::notFound);
        LegalBasisDossier dossier = dossiers.findByVerificationCaseId(found.getVerificationCaseId()).orElse(null);
        return toView(compute(found, vault, dossier), workspace);
    }

    /**
     * Legal context whose approval/unlock capabilities also require the matching distribution phase.
     *
     * <p>Endpoint {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/context} (Legal): lấy ngữ cảnh từ {@code LegalReadService}
     * rồi chặn thêm khả năng duyệt cuối/mở khóa nếu pha workflow chưa tới (xem {@link #gate}).
     *
     * @param principal Legal đang đăng nhập
     * @param caseId UUID công khai của ca
     * @return ngữ cảnh đã bổ sung điều kiện theo pha
     */
    @Transactional(timeout = 20)
    public Context legalContext(CustomUserPrincipal principal, UUID caseId) {
        Context base = reads.context(principal, caseId);
        VerificationCase found = lookup.findByPublicId(caseId).orElseThrow(DistributionWorkflowService::notFound);
        Vault vault = vaults.findById(found.getVaultId()).orElseThrow(DistributionWorkflowService::notFound);
        State state = compute(found, vault, dossiers.findByVerificationCaseId(found.getVerificationCaseId()).orElse(null));
        Capabilities capabilities = new Capabilities(
                gate(base.capabilities().approval(), state, Set.of(FINAL_APPROVAL, APPROVED)),
                gate(base.capabilities().unlock(), state, Set.of(APPROVED)));
        return new Context(base.caseId(), base.caseNumber(), base.vaultId(), base.caseStatus(), base.vaultStatus(),
                base.deathDocuments(), base.willComparison(), base.basisDossier(), base.snapshot(), capabilities,
                base.evaluatedAt());
    }

    /**
     * Giữ nguyên khả năng gốc nếu đã bị chặn hoặc pha hiện tại nằm trong tập cho phép; nếu không, chặn với lý do
     * {@code DISTRIBUTION_PREREQUISITES_PENDING} hoặc {@code DISTRIBUTION_NOT_CURRENT_STEP}.
     */
    private static Action gate(Action base, State state, Set<String> phases) {
        if (!base.allowed() || phases.contains(state.phase())) {
            return base;
        }
        ErrorCode reason = PREREQUISITES_PENDING.equals(state.phase())
                ? ErrorCode.DISTRIBUTION_PREREQUISITES_PENDING : ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP;
        return new Action(false, reason.name());
    }

    // ------------------------------------------------------------------------------- gated existing use cases

    /**
     * Document upload: only while Legal waits for documents, and it never carries an allocation.
     *
     * <p>Endpoint {@code POST /api/v1/staff/verification-cases/{caseId}/basis-dossier/versions} (multipart): kiểm tra Staff phụ trách ca và pha
     * {@code uploadDocuments}, từ chối nếu metadata có kèm phân bổ ({@code VALIDATION_FAILED}) rồi ủy quyền cho {@link BasisIntakeService#intake}.
     *
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND, DISTRIBUTION_NOT_CURRENT_STEP, VALIDATION_FAILED
     */
    @Transactional
    public BasisDossierResponse receive(UUID caseId, CustomUserPrincipal principal, BasisIntakeMetadata metadata,
            MultipartFile file) {
        Long actorId = CustomUserPrincipal.requireUserId(principal);
        requireStaffCase(caseId, actorId);
        requirePhase(compute(access.lockContext(caseId)), "uploadDocuments", STAFF);
        if (metadata != null && metadata.allocations() != null && !metadata.allocations().isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        return intake.intake(caseId, principal, metadata, file);
    }

    /**
     * Forwarding the stored version: same phase as the upload; it approves nothing and prepares no allocation.
     *
     * <p>Endpoint {@code POST /api/v1/staff/verification-cases/{caseId}/basis-dossier/versions/{version}/forward}: kiểm tra pha
     * {@code forwardDocuments} rồi ủy quyền cho {@link BasisForwardService#forward}.
     *
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND, DISTRIBUTION_NOT_CURRENT_STEP
     */
    @Transactional
    public BasisDossierResponse forward(UUID caseId, int version, CustomUserPrincipal principal) {
        Long actorId = CustomUserPrincipal.requireUserId(principal);
        requireStaffCase(caseId, actorId);
        requirePhase(compute(access.lockContext(caseId)), "forwardDocuments", STAFF);
        return forwarding.forward(caseId, version, principal);
    }

    /**
     * Final decision: the document and the allocation must both have been accepted first.
     *
     * <p>Endpoint {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/decision} (Legal): chỉ cho phép khi pha là
     * FINAL_APPROVAL hoặc APPROVED, rồi ủy quyền cho {@code LegalApprovalService#decide}.
     *
     * @throws com.legacyvault.common.error.BusinessException DISTRIBUTION_PREREQUISITES_PENDING, DISTRIBUTION_NOT_CURRENT_STEP
     */
    @Transactional
    public LegalApprovalResponse decide(UUID caseId, CustomUserPrincipal principal, LegalApprovalRequest request) {
        CustomUserPrincipal.requireUserId(principal);
        State state = compute(access.lockContext(caseId));
        if (!Set.of(FINAL_APPROVAL, APPROVED).contains(state.phase())) {
            throw phaseError(state);
        }
        return approvalService.decide(caseId, principal, request);
    }

    /**
     * Controlled unlock: only after the final approval is current.
     *
     * <p>Endpoint {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/unlock} (Legal): chỉ cho phép khi pha là APPROVED,
     * rồi ủy quyền cho {@code LegalVaultUnlockService#unlock}.
     *
     * @throws com.legacyvault.common.error.BusinessException DISTRIBUTION_PREREQUISITES_PENDING, DISTRIBUTION_NOT_CURRENT_STEP
     */
    @Transactional
    public LegalVaultUnlockResponse unlock(UUID caseId, CustomUserPrincipal principal) {
        CustomUserPrincipal.requireUserId(principal);
        State state = compute(access.lockContext(caseId));
        if (!APPROVED.equals(state.phase())) {
            throw phaseError(state);
        }
        return unlockService.unlock(caseId, principal);
    }

    // ---------------------------------------------------------------------------------------------- actions

    /**
     * Runs one workflow action for the given workspace and returns the new revision.
     *
     * <p>Thực hiện một hành động workflow. Endpoint: Staff {@code POST .../distribution-workflow/submit-allocations}; Legal {@code POST .../distribution-workflow/
     * request-documents | approve-documents | request-document-supplementation | approve-allocations | request-allocation-changes}.
     *
     * Các bước: kiểm tra hành động thuộc đúng workspace và body có {@code revision}; khóa ca (Vault → ca → dossier); so revision với
     * trạng thái tính lại, kiểm tra pha cho phép; xử lý riêng từng hành động (yêu cầu tài liệu; duyệt tài liệu, với nhánh COURT ghi
     * kết luận VALID; yêu cầu bổ sung; nộp phân bổ qua {@link BasisIntakeService#replaceAllocations}; duyệt hay yêu cầu sửa phân bổ,
     * duyệt thì ghi kết quả rà soát Legal); lưu sự kiện mới (nếu trùng số thứ tự do đua thì báo STALE); đánh giá lại PS-37 sau khi nộp phân bổ;
     * ghi audit {@code DISTRIBUTION_*} và gửi thông báo cho workspace còn lại.
     *
     * @param caseId UUID công khai của ca
     * @param workspace {@link #STAFF} hoặc {@link #LEGAL}
     * @param action tên hành động (khóa của {@link #RULES})
     * @param body revision, lý do, snapshot tài liệu/phân bổ, danh sách phân bổ mới
     * @param principal người dùng đang đăng nhập
     * @return biên nhận gồm revision mới và thông báo
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED, DISTRIBUTION_WORKFLOW_STALE, DISTRIBUTION_NOT_CURRENT_STEP,
     *         DISTRIBUTION_PREREQUISITES_PENDING, LEGAL_WORKFLOW_ON_HOLD, RESOURCE_NOT_FOUND và lỗi của các service ủy quyền
     */
    @Transactional
    public Receipt perform(UUID caseId, String workspace, String action, ActionBody body, CustomUserPrincipal principal) {
        Long actorId = CustomUserPrincipal.requireUserId(principal);
        Rule rule = RULES.get(action);
        if (rule == null || !rule.workspace().equals(workspace) || body == null || body.revision() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        if (STAFF.equals(workspace)) {
            requireStaffCase(caseId, actorId);
        }
        State state = compute(access.lockContext(caseId));
        if (state.revision() != body.revision()) {
            throw new BusinessException(ErrorCode.DISTRIBUTION_WORKFLOW_STALE);
        }
        requirePhase(state, action, workspace);

        String reason = text(body.reason());
        Integer documentVersion = state.document() == null ? null : state.document().versionNo();
        String documentSha = state.document() == null ? null : state.document().sha256Hash();
        Integer allocationVersion = null;
        String allocationSha = null;
        com.legacyvault.notification.WorkflowNotificationService.Receipt reviewNotification = null;
        AuditAction auditAction;
        String eventAction;

        switch (action) {
            case "requestDocuments" -> {
                requireReason(reason);
                eventAction = DistributionWorkflowEvent.REQUEST_DOCUMENTS;
                auditAction = AuditAction.DISTRIBUTION_DOCUMENTS_REQUESTED;
            }
            case "approveDocuments" -> {
                requireReason(reason);
                requireDocumentSnapshot(state, body);
                if (LegalBasisDossier.ROUTE_COURT.equals(state.dossier().getRoute())) {
                    // The FE no longer has a separate court-conclusion step: accepting the court document records a VALID
                    // assessment of exactly this version (evidence was verified reviewable by the phase check above).
                    courtDecisions.record(caseId, principal, new CourtDecisionRequest(state.document().versionNo(),
                            CourtDecisionRequest.Result.VALID, reason));
                }
                eventAction = DistributionWorkflowEvent.APPROVE_DOCUMENTS;
                auditAction = AuditAction.DISTRIBUTION_DOCUMENTS_APPROVED;
            }
            case "requestDocumentSupplementation" -> {
                requireReason(reason);
                requireDocumentSnapshot(state, body);
                // Reuses the existing return-to-Staff step: the dossier goes back to PROVIDED and the vault to AWAITING_LEGAL_BASIS.
                reviewNotification = review.requestSupplementationByCasePublicId(caseId, actorId, reason).notification();
                eventAction = DistributionWorkflowEvent.REQUEST_DOCUMENT_SUPPLEMENTATION;
                auditAction = AuditAction.DISTRIBUTION_DOCUMENT_SUPPLEMENTATION_REQUESTED;
            }
            case "submitAllocations" -> {
                requireDocumentSnapshot(state, body);
                if (body.allocations() == null || body.allocations().isEmpty()) {
                    throw new BusinessException(ErrorCode.VALIDATION_FAILED);
                }
                Long versionId = versions.findByLegalBasisDossierIdAndVersionNo(state.dossier().getLegalBasisDossierId(),
                        state.document().versionNo()).orElseThrow(DistributionWorkflowService::notFound).getDossierVersionId();
                intake.replaceAllocations(state.vault(), state.dossier(), versionId, body.allocations());
                allocationVersion = (int) state.events().stream()
                        .filter(e -> DistributionWorkflowEvent.SUBMIT_ALLOCATIONS.equals(e.getAction())).count() + 1;
                allocationSha = AllocationScopeHash.hashApprovalRows(
                        rowsOf(state.dossier(), state.document().versionNo()));
                eventAction = DistributionWorkflowEvent.SUBMIT_ALLOCATIONS;
                auditAction = AuditAction.DISTRIBUTION_ALLOCATIONS_SUBMITTED;
            }
            case "approveAllocations", "requestAllocationChanges" -> {
                requireReason(reason);
                requireDocumentSnapshot(state, body);
                requireAllocationSnapshot(state, body);
                allocationVersion = state.submitted().getAllocationVersion();
                allocationSha = state.submitted().getAllocationSha256();
                boolean approve = "approveAllocations".equals(action);
                if (approve) {
                    // Accepting the allocation is the Legal review of the exact snapshot: record it here so the final
                    // decision does not depend on a separate "complete review" step. Only the stored document the caller
                    // looked at may be reviewed.
                    if (state.latestStored() == null || state.latestStored().versionNo() != state.document().versionNo()) {
                        throw new BusinessException(ErrorCode.DISTRIBUTION_WORKFLOW_STALE);
                    }
                    reviewNotification = review.recordCompletedReviewByCasePublicId(caseId, actorId, reason).notification();
                }
                eventAction = approve ? DistributionWorkflowEvent.APPROVE_ALLOCATIONS
                        : DistributionWorkflowEvent.REQUEST_ALLOCATION_CHANGES;
                auditAction = approve ? AuditAction.DISTRIBUTION_ALLOCATIONS_APPROVED
                        : AuditAction.DISTRIBUTION_ALLOCATION_CHANGES_REQUESTED;
            }
            default -> throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        DistributionWorkflowEvent saved;
        try {
            saved = events.saveAndFlush(new DistributionWorkflowEvent(state.verificationCase().getVerificationCaseId(),
                    state.events().size() + 1, eventAction, actorId, reason, documentVersion, documentSha,
                    allocationVersion, allocationSha));
        } catch (DataIntegrityViolationException raced) {
            throw new BusinessException(ErrorCode.DISTRIBUTION_WORKFLOW_STALE);
        }
        if ("submitAllocations".equals(action)) {
            // The allocation scope changed, so an earlier Legal review of the old scope is no longer fresh.
            review.evaluateAfterChange(caseId);
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("casePublicId", caseId.toString());
        details.put("action", action);
        details.put("eventNo", saved.getEventNo());
        if (documentVersion != null) details.put("documentVersion", documentVersion);
        if (allocationVersion != null) details.put("allocationVersion", allocationVersion);
        audit.record(new AuditEvent(auditAction, AuditActorType.USER, actorId, state.vault().getVaultId(), ENTITY_TYPE,
                saved.getId(), state.phase(), null, null, details, "ST-19", RULE_ID));
        // These delegated mutations already record the notification, including a null receipt without assigned Staff.
        var notification = Set.of("requestDocumentSupplementation", "approveAllocations").contains(action)
                ? reviewNotification : notifications.record(state.verificationCase(),
                STAFF.equals(workspace)
                    ? com.legacyvault.notification.WorkflowNotificationService.Workspace.LEGAL
                    : com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF,
                auditAction.name(), "distribution:" + saved.getPublicId(), reason);
        return new Receipt(caseId, action, state.revision() + 1, notification);
    }

    // --------------------------------------------------------------------------------------------- derivation

    /**
     * Tính trạng thái từ ngữ cảnh đã khóa (xem {@link #compute(VerificationCase, Vault, LegalBasisDossier)}).
     */
    private State compute(LegalBasisCaseAccess.LockedContext locked) {
        return compute(locked.verificationCase(), locked.vault(), locked.dossier());
    }

    /**
     * Suy ra toàn bộ trạng thái workflow: đọc log sự kiện và các phiên bản, tính revision (số sự kiện + số phiên bản đã chuyển tiếp + phiên bản
     * yêu cầu), điều kiện tiên quyết, trạng thái tài liệu, phản hồi, trạng thái và hash phân bổ, rồi xác định pha qua {@link #phase}.
     * Phân bổ có hash không còn khớp với bản đã nộp được coi là CHANGES_REQUESTED.
     */
    private State compute(VerificationCase found, Vault vault, LegalBasisDossier dossier) {
        List<DistributionWorkflowEvent> log = events.findByVerificationCaseIdOrderByEventNoAsc(found.getVerificationCaseId());
        List<BasisVersionRow> rows = dossier == null ? List.of() : versions.findRows(dossier.getLegalBasisDossierId());
        BasisVersionRow latestStored = rows.isEmpty() ? null : rows.get(0);
        // The document is the latest STORED version, so Staff see what they just uploaded and can forward exactly that version.
        BasisVersionRow document = latestStored;
        BasisVersionRow forwardedDocument = rows.stream().filter(r -> "FORWARDED".equals(r.forwardStatus())).findFirst().orElse(null);
        long forwarded = rows.stream().filter(r -> "FORWARDED".equals(r.forwardStatus())).count();
        long revision = log.size() + forwarded + (dossier == null ? 0 : Math.max(0, dossier.getRequiredVersionNo() - 1));

        Prerequisites prerequisites = new Prerequisites(DEATH_DECIDED_VAULT_STATES.contains(vault.getStatus()),
                !wills.isApprovalBlocked(found.getVerificationCaseId()));
        DistributionWorkflowEvent request = last(log, DistributionWorkflowEvent.REQUEST_DOCUMENTS);

        String documentStatus = documentStatus(log, document);
        String forwardedStatus = documentStatus(log, forwardedDocument);
        String feedback = null;
        if ("CHANGES_REQUESTED".equals(documentStatus)) {
            feedback = lastMatching(log, e -> DistributionWorkflowEvent.REQUEST_DOCUMENT_SUPPLEMENTATION.equals(e.getAction())
                    && e.getDocumentVersion() != null && e.getDocumentVersion() == document.versionNo()).getReason();
        }

        DistributionWorkflowEvent submitted = last(log, DistributionWorkflowEvent.SUBMIT_ALLOCATIONS);
        String allocationStatus = null;
        List<AllocationRow> allocationRows = List.of();
        String allocationHash = null;
        if (submitted != null && dossier != null) {
            allocationRows = rowsOf(dossier, submitted.getDocumentVersion());
            allocationHash = AllocationScopeHash.hashApprovalRows(allocationRows);
            DistributionWorkflowEvent decision = lastMatching(log, e -> e.getAllocationVersion() != null
                    && e.getAllocationVersion().equals(submitted.getAllocationVersion()));
            allocationStatus = DistributionWorkflowEvent.APPROVE_ALLOCATIONS.equals(decision.getAction()) ? "APPROVED"
                    : DistributionWorkflowEvent.REQUEST_ALLOCATION_CHANGES.equals(decision.getAction()) ? "CHANGES_REQUESTED" : "SUBMITTED";
            // Rows that no longer hash to what was submitted cannot be reviewed; Staff must submit again.
            if (allocationRows.isEmpty() || !allocationHash.equalsIgnoreCase(submitted.getAllocationSha256())) {
                allocationStatus = "CHANGES_REQUESTED";
            } else if ("CHANGES_REQUESTED".equals(allocationStatus) && feedback == null) {
                feedback = decision.getReason();
            }
        }

        String phase = phase(found, vault, dossier, prerequisites, request, document, documentStatus, latestStored, submitted,
                allocationStatus);
        return new State(found, vault, dossier, revision, phase, prerequisites, request, document, documentStatus, latestStored,
                submitted, allocationStatus, allocationRows, allocationHash, log, feedback, forwardedDocument, forwardedStatus);
    }

    /**
     * PENDING until Legal decides on exactly this version and hash; a new version never inherits an older decision.
     *
     * @return {@code null} nếu chưa có phiên bản; {@code PENDING}, {@code APPROVED} hoặc {@code CHANGES_REQUESTED} theo sự kiện mới nhất của Legal
     *         trên đúng phiên bản và SHA-256 đó
     */
    private static String documentStatus(List<DistributionWorkflowEvent> log, BasisVersionRow row) {
        if (row == null) return null;
        DistributionWorkflowEvent decision = lastMatching(log, e -> e.getDocumentVersion() != null
                && e.getDocumentVersion() == row.versionNo() && row.sha256Hash().equalsIgnoreCase(e.getDocumentSha256())
                && (DistributionWorkflowEvent.APPROVE_DOCUMENTS.equals(e.getAction())
                || DistributionWorkflowEvent.REQUEST_DOCUMENT_SUPPLEMENTATION.equals(e.getAction())));
        return decision == null ? "PENDING"
                : DistributionWorkflowEvent.APPROVE_DOCUMENTS.equals(decision.getAction()) ? "APPROVED" : "CHANGES_REQUESTED";
    }

    /**
     * Xác định pha theo thứ tự ưu tiên: CLOSED (ca đóng) → UNLOCKED → PREREQUISITES_PENDING → DOCUMENT_REQUEST_NEEDED →
     * AWAITING_DOCUMENTS → DOCUMENTS_UNDER_REVIEW → AWAITING_ALLOCATIONS → ALLOCATIONS_UNDER_REVIEW → APPROVED (quyết định cuối còn hiệu lực)
     * → REJECTED (Legal từ chối đúng snapshot) → FINAL_APPROVAL.
     */
    private String phase(VerificationCase found, Vault vault, LegalBasisDossier dossier, Prerequisites prerequisites,
            DistributionWorkflowEvent request, BasisVersionRow document, String documentStatus, BasisVersionRow latestStored,
            DistributionWorkflowEvent submitted, String allocationStatus) {
        if (!found.isOpen()) return CLOSED;
        if (UNLOCKED_VAULT_STATES.contains(vault.getStatus())) return UNLOCKED;
        if (!prerequisites.deathApproved() || !prerequisites.willMatched()) return PREREQUISITES_PENDING;
        if (request == null) return DOCUMENT_REQUEST_NEEDED;
        if (dossier != null && latestStored != null && dossier.getRequiredVersionNo() > latestStored.versionNo()) {
            return AWAITING_DOCUMENTS;
        }
        if (document == null || !"FORWARDED".equals(document.forwardStatus()) || "CHANGES_REQUESTED".equals(documentStatus)) {
            return AWAITING_DOCUMENTS;
        }
        if ("PENDING".equals(documentStatus)) return DOCUMENTS_UNDER_REVIEW;
        boolean current = submitted != null && submitted.getDocumentVersion() == document.versionNo();
        if (!current || "CHANGES_REQUESTED".equals(allocationStatus)) return AWAITING_ALLOCATIONS;
        if ("SUBMITTED".equals(allocationStatus)) return ALLOCATIONS_UNDER_REVIEW;
        var evidence = latestStored == null ? null
                : versions.findCourtEvidence(dossier.getLegalBasisDossierId(), latestStored.versionNo()).orElse(null);
        if (evidence != null && approvals.currentApprovalBlocker(dossier, evidence) == null) return APPROVED;
        var decision = decisionHistory.findFirstByDossierIdAndReviewStatusInOrderByIdDesc(
                dossier.getLegalBasisDossierId(), List.of("LEGAL_APPROVED", "LEGAL_REJECTED")).orElse(null);
        if (decision != null && "LEGAL_REJECTED".equals(decision.getReviewStatus())
                && latestStored != null && java.util.Objects.equals(decision.getVersionNo(), latestStored.versionNo())
                && latestStored.sha256Hash().equalsIgnoreCase(decision.getSha256Hash())
                && java.util.Objects.equals(decision.getDisputeStatus(), dossier.getDisputeStatus())
                && allocationHashFor(dossier, latestStored.versionNo()).equalsIgnoreCase(decision.getAllocationHash())) return REJECTED;
        return FINAL_APPROVAL;
    }

    /**
     * Hash phạm vi phân bổ của một phiên bản hồ sơ.
     */
    private String allocationHashFor(LegalBasisDossier dossier, int versionNo) {
        return AllocationScopeHash.hashApprovalRows(rowsOf(dossier, versionNo));
    }

    /**
     * Lấy các dòng phân bổ của đúng một phiên bản tài liệu (rỗng nếu {@code versionNo} null).
     */
    private List<AllocationRow> rowsOf(LegalBasisDossier dossier, Integer versionNo) {
        return allocations.findRowsByDossier(dossier.getLegalBasisDossierId()).stream()
                .filter(row -> versionNo != null && row.versionNo() == versionNo).toList();
    }

    /**
     * Chuyển {@link State} thành {@link View} cho một workspace: tính capabilities cho từng hành động; Legal chỉ thấy phiên bản đã được chuyển tiếp,
     * Staff thấy cả phiên bản đã lưu nhưng chưa chuyển tiếp.
     */
    private View toView(State state, String workspace) {
        Map<String, Capability> capabilities = new LinkedHashMap<>();
        for (String action : RULES.keySet()) {
            ErrorCode blocker = RULES.get(action).workspace().equals(workspace) ? blocker(state, action)
                    : ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP;
            capabilities.put(action, new Capability(blocker == null, blocker == null ? null : blocker.name()));
        }
        // Legal only see a version Staff already forwarded; Staff also see the version they stored and have not forwarded yet.
        boolean legalView = LEGAL.equals(workspace) && !state.documentForwarded();
        BasisVersionRow shown = legalView ? state.forwardedDocument() : state.document();
        String shownStatus = legalView ? state.forwardedStatus() : state.documentStatus();
        DocumentInfo document = shown == null ? null : new DocumentInfo(shown.versionNo(), shown.sha256Hash(), shownStatus);
        AllocationInfo allocation = null;
        if (state.submitted() != null) {
            List<AllocationItem> items = new ArrayList<>();
            for (AllocationRow row : state.allocationRows()) {
                items.add(new AllocationItem(row.assetId(), row.beneficiaryId(), nullToEmpty(row.assetName()),
                        nullToEmpty(row.recipientName()), nullToEmpty(row.description())));
            }
            allocation = new AllocationInfo(state.submitted().getAllocationVersion(), state.submitted().getDocumentVersion(),
                    state.submitted().getAllocationSha256(), state.allocationStatus(), items);
        }
        RequestInfo request = state.request() == null ? null
                : new RequestInfo(state.request().getPublicId(), state.request().getReason());
        return new View(state.verificationCase().getPublicId(), state.revision(), state.phase(), state.prerequisites(),
                request, document, allocation, capabilities, state.feedback());
    }

    /**
     * Why an action cannot run now, or null when it can. Thứ tự kiểm tra: PREREQUISITES_PENDING, sai pha (riêng
     * {@code requestDocumentSupplementation} còn được phép ở pha REJECTED), ON_HOLD, rồi điều kiện riêng của
     * {@code approveDocuments} / {@code forwardDocuments}.
     *
     * @param state trạng thái hiện tại
     * @param action tên hành động
     * @return {@link ErrorCode} lý do chặn hoặc {@code null} nếu hành động được phép
     */
    private ErrorCode blocker(State state, String action) {
        if (PREREQUISITES_PENDING.equals(state.phase())) return ErrorCode.DISTRIBUTION_PREREQUISITES_PENDING;
        if (!RULES.get(action).phase().equals(state.phase())
                && !("requestDocumentSupplementation".equals(action) && REJECTED.equals(state.phase())))
            return ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP;
        if (state.onHold()) return ErrorCode.LEGAL_WORKFLOW_ON_HOLD;
        return switch (action) {
            case "approveDocuments" -> documentBlocker(state);
            case "forwardDocuments" -> state.latestStored() == null || "FORWARDED".equals(state.latestStored().forwardStatus())
                    ? ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP : null;
            default -> null;
        };
    }

    /**
     * Can Legal accept the forwarded document? COURT: the stored file and its court metadata must be reviewable (Legal's
     * acceptance then records the VALID assessment); NOTARIAL and others keep the route evidence rules.
     *
     * @return {@link ErrorCode} lý do chặn duyệt tài liệu hoặc {@code null}
     */
    private ErrorCode documentBlocker(State state) {
        if (!LegalBasisDossier.ROUTE_COURT.equals(state.dossier().getRoute())) {
            return routeGuard.blocker(state.dossier());
        }
        var evidence = versions.findCourtEvidence(state.dossier().getLegalBasisDossierId(), state.document().versionNo()).orElse(null);
        return evidence != null && evidence.isReviewable() ? null : ErrorCode.COURT_EVIDENCE_REQUIRED;
    }

    /**
     * Ném lỗi nếu hành động không được phép ở workspace/pha hiện tại.
     *
     * @throws com.legacyvault.common.error.BusinessException mã lỗi do {@link #blocker} trả về
     */
    private void requirePhase(State state, String action, String workspace) {
        ErrorCode blocker = RULES.get(action).workspace().equals(workspace) ? blocker(state, action)
                : ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP;
        if (blocker != null) {
            throw new BusinessException(blocker);
        }
    }

    /**
     * Tạo lỗi theo pha: PREREQUISITES_PENDING nếu chưa đủ điều kiện tiên quyết, ngược lại DISTRIBUTION_NOT_CURRENT_STEP.
     */
    private static BusinessException phaseError(State state) {
        return new BusinessException(PREREQUISITES_PENDING.equals(state.phase())
                ? ErrorCode.DISTRIBUTION_PREREQUISITES_PENDING : ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP);
    }

    /**
     * Bắt buộc client xác nhận đúng phiên bản và SHA-256 của tài liệu hiện tại.
     *
     * @throws com.legacyvault.common.error.BusinessException DISTRIBUTION_WORKFLOW_STALE khi không khớp
     */
    private static void requireDocumentSnapshot(State state, ActionBody body) {
        if (state.document() == null || body.documentVersion() == null || body.documentSha256() == null
                || body.documentVersion() != state.document().versionNo()
                || !body.documentSha256().equalsIgnoreCase(state.document().sha256Hash())) {
            throw new BusinessException(ErrorCode.DISTRIBUTION_WORKFLOW_STALE);
        }
    }

    /**
     * Bắt buộc client xác nhận đúng phiên bản và SHA-256 phân bổ đã nộp, gắn với tài liệu hiện tại và có dòng phân bổ.
     *
     * @throws com.legacyvault.common.error.BusinessException DISTRIBUTION_WORKFLOW_STALE khi không khớp
     */
    private static void requireAllocationSnapshot(State state, ActionBody body) {
        DistributionWorkflowEvent submitted = state.submitted();
        if (submitted == null || body.allocationVersion() == null || body.allocationSha256() == null
                || !body.allocationVersion().equals(submitted.getAllocationVersion())
                || !body.allocationSha256().equalsIgnoreCase(submitted.getAllocationSha256())
                || state.document() == null || submitted.getDocumentVersion() != state.document().versionNo()
                || state.allocationRows().isEmpty()) {
            throw new BusinessException(ErrorCode.DISTRIBUTION_WORKFLOW_STALE);
        }
    }

    /**
     * Kiểm tra ca được giao cho Staff này; nếu không thì coi như không tồn tại.
     *
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND
     */
    private void requireStaffCase(UUID caseId, Long staffUserId) {
        staffCases.findOwnedByStaff(caseId, staffUserId).orElseThrow(DistributionWorkflowService::notFound);
    }

    /**
     * Lý do là bắt buộc và tối đa 1000 ký tự.
     *
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED
     */
    private static void requireReason(String reason) {
        if (reason == null || reason.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
    }

    /**
     * @return chuỗi đã trim hoặc null nếu null/trống
     */
    private static String text(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * @return chuỗi rỗng nếu đầu vào null
     */
    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /**
     * Sự kiện cuối cùng có hành động chỉ định, hoặc null.
     */
    private static DistributionWorkflowEvent last(List<DistributionWorkflowEvent> log, String action) {
        return lastMatching(log, e -> action.equals(e.getAction()));
    }

    /**
     * Sự kiện cuối cùng thỏa bộ lọc, hoặc null nếu không có.
     */
    private static DistributionWorkflowEvent lastMatching(List<DistributionWorkflowEvent> log,
            java.util.function.Predicate<DistributionWorkflowEvent> filter) {
        DistributionWorkflowEvent found = null;
        for (DistributionWorkflowEvent event : log) {
            if (filter.test(event)) found = event;
        }
        return found;
    }

    /**
     * Tạo lỗi {@code RESOURCE_NOT_FOUND}.
     */
    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }
}
