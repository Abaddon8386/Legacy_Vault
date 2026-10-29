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
 */
@Service
public class DistributionWorkflowService {

    public static final String STAFF = "STAFF";
    public static final String LEGAL = "LEGAL";

    static final String PREREQUISITES_PENDING = "PREREQUISITES_PENDING";
    static final String DOCUMENT_REQUEST_NEEDED = "DOCUMENT_REQUEST_NEEDED";
    static final String AWAITING_DOCUMENTS = "AWAITING_DOCUMENTS";
    static final String DOCUMENTS_UNDER_REVIEW = "DOCUMENTS_UNDER_REVIEW";
    static final String AWAITING_ALLOCATIONS = "AWAITING_ALLOCATIONS";
    static final String ALLOCATIONS_UNDER_REVIEW = "ALLOCATIONS_UNDER_REVIEW";
    static final String FINAL_APPROVAL = "FINAL_APPROVAL";
    static final String APPROVED = "APPROVED";
    static final String UNLOCKED = "UNLOCKED";
    static final String CLOSED = "CLOSED";

    private static final String ENTITY_TYPE = "DISTRIBUTION_WORKFLOW";
    private static final String RULE_ID = "LV-DIST-001";
    private static final Set<String> DEATH_DECIDED_VAULT_STATES = Set.of(Vault.STATUS_DOCUMENT_VERIFICATION,
            Vault.STATUS_WILL_VERIFICATION, Vault.STATUS_AWAITING_LEGAL_BASIS, Vault.STATUS_ON_HOLD,
            Vault.STATUS_LEGAL_BASIS_VERIFICATION, Vault.STATUS_UNLOCKED, Vault.STATUS_HANDOVER_IN_PROGRESS,
            Vault.STATUS_ARCHIVED);
    private static final Set<String> UNLOCKED_VAULT_STATES = Set.of(Vault.STATUS_UNLOCKED,
            Vault.STATUS_HANDOVER_IN_PROGRESS, Vault.STATUS_ARCHIVED);

    /** Action name -> workspace and the only phase in which it is allowed. Same names as the FE contract. */
    private record Rule(String workspace, String phase) { }

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

    private record State(VerificationCase verificationCase, Vault vault, LegalBasisDossier dossier, long revision,
            String phase, Prerequisites prerequisites, DistributionWorkflowEvent request, BasisVersionRow document,
            String documentStatus, BasisVersionRow latestStored, DistributionWorkflowEvent submitted, String allocationStatus,
            List<AllocationRow> allocationRows, String allocationHash, List<DistributionWorkflowEvent> events,
            String feedback) {
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
    private final BasisIntakeService intake;
    private final BasisForwardService forwarding;
    private final LegalApprovalService approvalService;
    private final LegalVaultUnlockService unlockService;
    private final LegalReadService reads;
    private final AuditService audit;

    public DistributionWorkflowService(LegalBasisCaseAccess access, StaffCaseLockRepository staffCases,
            LegalCaseLookupRepository lookup, VaultRepository vaults, LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions, LegalBasisVersionAllocationRepository allocations,
            DistributionWorkflowEventRepository events, WillComparisonService wills, CourtRouteGuard routeGuard,
            LegalApprovalGuard approvals, LegalBasisReviewService review, BasisIntakeService intake,
            BasisForwardService forwarding, LegalApprovalService approvalService, LegalVaultUnlockService unlockService,
            LegalReadService reads, AuditService audit) {
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
        this.intake = intake;
        this.forwarding = forwarding;
        this.approvalService = approvalService;
        this.unlockService = unlockService;
        this.reads = reads;
        this.audit = audit;
    }

    // ------------------------------------------------------------------------------------------------ reads

    /** Current workflow of a case. Staff only see a case assigned to them; Legal see any case. */
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

    /** Legal context whose approval/unlock capabilities also require the matching distribution phase. */
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

    private static Action gate(Action base, State state, Set<String> phases) {
        if (!base.allowed() || phases.contains(state.phase())) {
            return base;
        }
        ErrorCode reason = PREREQUISITES_PENDING.equals(state.phase())
                ? ErrorCode.DISTRIBUTION_PREREQUISITES_PENDING : ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP;
        return new Action(false, reason.name());
    }

    // ------------------------------------------------------------------------------- gated existing use cases

    /** Document upload: only while Legal waits for documents, and it never carries an allocation. */
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

    /** Forwarding the stored version: same phase as the upload; it approves nothing and prepares no allocation. */
    @Transactional
    public BasisDossierResponse forward(UUID caseId, int version, CustomUserPrincipal principal) {
        Long actorId = CustomUserPrincipal.requireUserId(principal);
        requireStaffCase(caseId, actorId);
        requirePhase(compute(access.lockContext(caseId)), "forwardDocuments", STAFF);
        return forwarding.forward(caseId, version, principal);
    }

    /** Final decision: the document and the allocation must both have been accepted first. */
    @Transactional
    public LegalApprovalResponse decide(UUID caseId, CustomUserPrincipal principal, LegalApprovalRequest request) {
        CustomUserPrincipal.requireUserId(principal);
        State state = compute(access.lockContext(caseId));
        if (!Set.of(FINAL_APPROVAL, APPROVED).contains(state.phase())) {
            throw phaseError(state);
        }
        return approvalService.decide(caseId, principal, request);
    }

    /** Controlled unlock: only after the final approval is current. */
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

    /** Runs one workflow action for the given workspace and returns the new revision. */
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
                eventAction = DistributionWorkflowEvent.APPROVE_DOCUMENTS;
                auditAction = AuditAction.DISTRIBUTION_DOCUMENTS_APPROVED;
            }
            case "requestDocumentSupplementation" -> {
                requireReason(reason);
                requireDocumentSnapshot(state, body);
                // Reuses the existing return-to-Staff step: the dossier goes back to PROVIDED and the vault to AWAITING_LEGAL_BASIS.
                review.requestSupplementationByCasePublicId(caseId, actorId, reason);
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
        return new Receipt(caseId, action, state.revision() + 1);
    }

    // --------------------------------------------------------------------------------------------- derivation

    private State compute(LegalBasisCaseAccess.LockedContext locked) {
        return compute(locked.verificationCase(), locked.vault(), locked.dossier());
    }

    private State compute(VerificationCase found, Vault vault, LegalBasisDossier dossier) {
        List<DistributionWorkflowEvent> log = events.findByVerificationCaseIdOrderByEventNoAsc(found.getVerificationCaseId());
        List<BasisVersionRow> rows = dossier == null ? List.of() : versions.findRows(dossier.getLegalBasisDossierId());
        BasisVersionRow latestStored = rows.isEmpty() ? null : rows.get(0);
        BasisVersionRow document = rows.stream().filter(r -> "FORWARDED".equals(r.forwardStatus())).findFirst().orElse(null);
        long forwarded = rows.stream().filter(r -> "FORWARDED".equals(r.forwardStatus())).count();
        long revision = log.size() + forwarded;

        Prerequisites prerequisites = new Prerequisites(DEATH_DECIDED_VAULT_STATES.contains(vault.getStatus()),
                !wills.isApprovalBlocked(found.getVerificationCaseId()));
        DistributionWorkflowEvent request = last(log, DistributionWorkflowEvent.REQUEST_DOCUMENTS);

        String documentStatus = null;
        String feedback = null;
        if (document != null) {
            DistributionWorkflowEvent decision = lastMatching(log, e -> e.getDocumentVersion() != null
                    && e.getDocumentVersion() == document.versionNo() && document.sha256Hash().equalsIgnoreCase(e.getDocumentSha256())
                    && (DistributionWorkflowEvent.APPROVE_DOCUMENTS.equals(e.getAction())
                    || DistributionWorkflowEvent.REQUEST_DOCUMENT_SUPPLEMENTATION.equals(e.getAction())));
            documentStatus = decision == null ? "PENDING"
                    : DistributionWorkflowEvent.APPROVE_DOCUMENTS.equals(decision.getAction()) ? "APPROVED" : "CHANGES_REQUESTED";
            if (decision != null && "CHANGES_REQUESTED".equals(documentStatus)) feedback = decision.getReason();
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
                submitted, allocationStatus, allocationRows, allocationHash, log, feedback);
    }

    private String phase(VerificationCase found, Vault vault, LegalBasisDossier dossier, Prerequisites prerequisites,
            DistributionWorkflowEvent request, BasisVersionRow document, String documentStatus, BasisVersionRow latestStored,
            DistributionWorkflowEvent submitted, String allocationStatus) {
        if (!found.isOpen()) return CLOSED;
        if (UNLOCKED_VAULT_STATES.contains(vault.getStatus())) return UNLOCKED;
        if (!prerequisites.deathApproved() || !prerequisites.willMatched()) return PREREQUISITES_PENDING;
        if (request == null) return DOCUMENT_REQUEST_NEEDED;
        if (document == null || "CHANGES_REQUESTED".equals(documentStatus)) return AWAITING_DOCUMENTS;
        if ("PENDING".equals(documentStatus)) return DOCUMENTS_UNDER_REVIEW;
        boolean current = submitted != null && submitted.getDocumentVersion() == document.versionNo();
        if (!current || "CHANGES_REQUESTED".equals(allocationStatus)) return AWAITING_ALLOCATIONS;
        if ("SUBMITTED".equals(allocationStatus)) return ALLOCATIONS_UNDER_REVIEW;
        var evidence = latestStored == null ? null
                : versions.findCourtEvidence(dossier.getLegalBasisDossierId(), latestStored.versionNo()).orElse(null);
        return evidence != null && approvals.currentApprovalBlocker(dossier, evidence) == null ? APPROVED : FINAL_APPROVAL;
    }

    private List<AllocationRow> rowsOf(LegalBasisDossier dossier, Integer versionNo) {
        return allocations.findRowsByDossier(dossier.getLegalBasisDossierId()).stream()
                .filter(row -> versionNo != null && row.versionNo() == versionNo).toList();
    }

    private View toView(State state, String workspace) {
        Map<String, Capability> capabilities = new LinkedHashMap<>();
        for (String action : RULES.keySet()) {
            ErrorCode blocker = RULES.get(action).workspace().equals(workspace) ? blocker(state, action)
                    : ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP;
            capabilities.put(action, new Capability(blocker == null, blocker == null ? null : blocker.name()));
        }
        DocumentInfo document = state.document() == null ? null
                : new DocumentInfo(state.document().versionNo(), state.document().sha256Hash(), state.documentStatus());
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

    /** Why an action cannot run now, or null when it can. */
    private ErrorCode blocker(State state, String action) {
        if (PREREQUISITES_PENDING.equals(state.phase())) return ErrorCode.DISTRIBUTION_PREREQUISITES_PENDING;
        if (!RULES.get(action).phase().equals(state.phase())) return ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP;
        if (state.onHold()) return ErrorCode.LEGAL_WORKFLOW_ON_HOLD;
        return switch (action) {
            case "approveDocuments" -> routeGuard.blocker(state.dossier());
            case "forwardDocuments" -> state.latestStored() == null || "FORWARDED".equals(state.latestStored().forwardStatus())
                    ? ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP : null;
            default -> null;
        };
    }

    private void requirePhase(State state, String action, String workspace) {
        ErrorCode blocker = RULES.get(action).workspace().equals(workspace) ? blocker(state, action)
                : ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP;
        if (blocker != null) {
            throw new BusinessException(blocker);
        }
    }

    private static BusinessException phaseError(State state) {
        return new BusinessException(PREREQUISITES_PENDING.equals(state.phase())
                ? ErrorCode.DISTRIBUTION_PREREQUISITES_PENDING : ErrorCode.DISTRIBUTION_NOT_CURRENT_STEP);
    }

    private static void requireDocumentSnapshot(State state, ActionBody body) {
        if (state.document() == null || body.documentVersion() == null || body.documentSha256() == null
                || body.documentVersion() != state.document().versionNo()
                || !body.documentSha256().equalsIgnoreCase(state.document().sha256Hash())) {
            throw new BusinessException(ErrorCode.DISTRIBUTION_WORKFLOW_STALE);
        }
    }

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

    private void requireStaffCase(UUID caseId, Long staffUserId) {
        staffCases.findOwnedByStaff(caseId, staffUserId).orElseThrow(DistributionWorkflowService::notFound);
    }

    private static void requireReason(String reason) {
        if (reason == null || reason.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
    }

    private static String text(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static DistributionWorkflowEvent last(List<DistributionWorkflowEvent> log, String action) {
        return lastMatching(log, e -> action.equals(e.getAction()));
    }

    private static DistributionWorkflowEvent lastMatching(List<DistributionWorkflowEvent> log,
            java.util.function.Predicate<DistributionWorkflowEvent> filter) {
        DistributionWorkflowEvent found = null;
        for (DistributionWorkflowEvent event : log) {
            if (filter.test(event)) found = event;
        }
        return found;
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }
}
