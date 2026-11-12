package com.legacyvault.verification.group;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PS-122 (D-GROUP-HANDOVER, 30/10/2026): read-only discovery for Legal and the private status of a recipient.
 * Both reads use the case-wide event source of PS-119/120 ({@code handover_group_events}); neither changes a gate,
 * a right or a decision, and neither opens a second source of truth.
 *
 * Được {@link GroupHandoverReadController} gọi. Truy vấn trực tiếp bằng {@link JdbcTemplate} các bảng
 * {@code handover_group_events}, {@code verification_cases}, {@code handover_sessions}, {@code vaults},
 * {@code beneficiaries}, {@code legal_basis_*}, {@code handover_items}; không ghi và không ghi audit.
 */
@Service
public class GroupHandoverReadService {

    /**
     * Định dạng số hồ sơ {@code HS-<năm>-<id>}; dùng để lọc theo {@code caseNumber}.
     */
    private static final Pattern CASE_NUMBER = Pattern.compile("^HS-(\\d{4})-(\\d{1,9})$", Pattern.CASE_INSENSITIVE);
    /**
     * Kích thước trang tối đa cho phép.
     */
    static final int MAX_PAGE_SIZE = 100;

    /**
     * One pending Staff request Legal may decide now. Public ids only; no internal ids or hashes.
     *
     * Các trường: mã yêu cầu, ca, số hồ sơ, phiên, tên vault, thời điểm và người yêu cầu, lý do, revision, tiến độ
     * (đã có mặt, tổng tài sản, đã giao) và {@code decidable}.
     */
    public record PendingRequest(UUID requestId, UUID caseId, String caseNumber, UUID sessionId, String vaultName,
            Instant requestedAt, GroupHandoverService.Person requestedBy, String reason, long revision,
            boolean allPresent, int requiredRecipients, int presentRecipients, int totalAssets, int deliveredAssets,
            boolean decidable) { }

    /**
     * What a recipient may see of one of their own cases. Nothing about other people or Staff/Legal internals.
     *
     * Một ca của người thụ hưởng: trạng thái cổng nhóm, tổng số tài sản được duyệt và số đã giao.
     */
    public record BeneficiaryCase(UUID caseId, String caseNumber, String status, int totalAssets, int deliveredAssets) { }

    /**
     * Kết quả cho một tài khoản: {@code subjectId} (UUID công khai) và các ca liên quan.
     */
    public record BeneficiaryStatus(UUID subjectId, List<BeneficiaryCase> cases) { }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final GroupHandoverService group;
    private final VerificationCaseRepository cases;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final LegalBasisReviewHistoryRepository history;
    private final HandoverSessionRepository sessions;

    /**
     * Constructor inject các thành phần truy vấn và {@link GroupHandoverService}.
     */
    public GroupHandoverReadService(JdbcTemplate jdbc, ObjectMapper json, GroupHandoverService group,
            VerificationCaseRepository cases, LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions, LegalBasisVersionAllocationRepository allocations,
            LegalBasisReviewHistoryRepository history, HandoverSessionRepository sessions) {
        this.jdbc = jdbc;
        this.json = json;
        this.group = group;
        this.cases = cases;
        this.dossiers = dossiers;
        this.versions = versions;
        this.allocations = allocations;
        this.history = history;
        this.sessions = sessions;
    }

    /**
     * Ứng viên yêu cầu mở lại lấy từ SQL, chờ kiểm tra thêm bằng {@code group.view}.
     */
    private record Candidate(UUID caseId, UUID sessionId, UUID requestId, String vaultName) { }

    /**
     * Pending reopen requests Legal can decide, oldest first. A request is listed only while it is the case's current
     * state (not replaced, decided or invalidated), the session is open and every authoritative gate that the decision
     * itself enforces still holds. That last part reuses the decision path's own checks, one short transaction per
     * case, so a list can never promise what the decision would then refuse and never holds many case locks at once.
     * Pending requests are naturally few (at most one per open case), so the page is cut after the checks.
     *
     * Các bước: (1) kiểm tra phân trang; (2) SQL lấy yêu cầu REQUEST là sự kiện mới nhất của ca với trạng thái
     * AWAITING_LEGAL, ca và phiên đang OPEN; (3) lọc theo {@code caseId}/{@code caseNumber}; (4) với từng ứng viên gọi
     * {@code group.view(..., true)} và chỉ giữ nếu {@code canDecide}; (5) cắt trang trong bộ nhớ.
     *
     * @throws BusinessException {@code VALIDATION_FAILED} nếu trang/kích thước hoặc {@code caseNumber} không hợp lệ
     */
    public PageResponse<PendingRequest> pendingForLegal(CustomUserPrincipal legal, UUID caseId, String caseNumber,
            int page, int size) {
        CustomUserPrincipal.requireUserId(legal);
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        StringBuilder sql = new StringBuilder("""
                SELECT c.public_id AS case_public, s.public_id AS session_public, e.public_id AS request_public,
                       v.vault_name
                FROM dbo.handover_group_events e
                JOIN dbo.verification_cases c ON c.verification_case_id = e.case_id
                JOIN dbo.handover_sessions s ON s.handover_session_id = e.session_id
                JOIN dbo.vaults v ON v.vault_id = c.vault_id
                WHERE e.operation = 'REQUEST'
                  AND e.revision = (SELECT MAX(x.revision) FROM dbo.handover_group_events x WHERE x.case_id = e.case_id)
                  AND JSON_VALUE(e.state_json, '$.status') = 'AWAITING_LEGAL'
                  AND c.status = 'OPEN' AND s.status = 'OPEN'
                """);
        List<Object> args = new ArrayList<>();
        if (caseId != null) {
            sql.append(" AND c.public_id = ?");
            args.add(caseId.toString());
        }
        if (caseNumber != null && !caseNumber.isBlank()) {
            Matcher matcher = CASE_NUMBER.matcher(caseNumber.trim());
            if (!matcher.matches()) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED);
            }
            sql.append(" AND c.verification_case_id = ? AND YEAR(c.created_at) = ?");
            args.add(Long.parseLong(matcher.group(2)));
            args.add(Integer.parseInt(matcher.group(1)));
        }
        sql.append(" ORDER BY e.created_at ASC, e.event_id ASC");
        List<Candidate> candidates = jdbc.query(sql.toString(), (rs, i) -> new Candidate(
                UUID.fromString(rs.getString("case_public")), UUID.fromString(rs.getString("session_public")),
                UUID.fromString(rs.getString("request_public")), rs.getString("vault_name")), args.toArray());

        List<PendingRequest> eligible = new ArrayList<>();
        for (Candidate candidate : candidates) {
            GroupHandoverService.View view;
            try {
                view = group.view(candidate.caseId(), candidate.sessionId(), legal, true);
            } catch (BusinessException notCurrent) {
                continue; // assignment, session, document, allocation or approval changed: no longer decidable
            }
            var request = view.request();
            if (request == null || !candidate.requestId().equals(request.requestId()) || view.capabilities() == null
                    || !view.capabilities().canDecide()) {
                continue;
            }
            var progress = view.progress();
            eligible.add(new PendingRequest(request.requestId(), view.caseId(), view.caseNumber(), view.sessionId(),
                    candidate.vaultName(), request.requestedAt(), request.requestedBy(), request.reason(),
                    view.state().revision(), view.state().allPresent(), progress.requiredRecipients(),
                    progress.presentRecipients(), progress.totalAssets(), progress.deliveredAssets(), true));
        }
        int from = Math.min(page * size, eligible.size());
        int to = Math.min(from + size, eligible.size());
        return new PageResponse<>(List.copyOf(eligible.subList(from, to)), page, size, eligible.size(),
                (int) ((eligible.size() + size - 1L) / size));
    }

    /**
     * SQL lấy các ca mà tài khoản là người thụ hưởng đã liên kết: tổng tài sản APPROVED ở phiên bản mới nhất, số đã có
     * {@code handover_items} và trạng thái cổng nhóm mới nhất.
     */
    private static final String BENEFICIARY_SQL = """
            SELECT c.verification_case_id, c.public_id AS case_public, c.status AS case_status,
                   (SELECT COUNT(*) FROM dbo.legal_basis_version_allocations al
                      JOIN dbo.legal_basis_dossier_versions v ON v.dossier_version_id = al.dossier_version_id
                     WHERE v.legal_basis_dossier_id = d.legal_basis_dossier_id AND v.version_no = mv.max_version
                       AND al.beneficiary_id = b.beneficiary_id AND al.status = 'APPROVED') AS total_assets,
                   (SELECT COUNT(*) FROM dbo.legal_basis_version_allocations al
                      JOIN dbo.legal_basis_dossier_versions v ON v.dossier_version_id = al.dossier_version_id
                     WHERE v.legal_basis_dossier_id = d.legal_basis_dossier_id AND v.version_no = mv.max_version
                       AND al.beneficiary_id = b.beneficiary_id AND al.status = 'APPROVED'
                       AND EXISTS (SELECT 1 FROM dbo.handover_items i WHERE i.allocation_id = al.allocation_id)) AS delivered_assets,
                   (SELECT TOP 1 e.state_json FROM dbo.handover_group_events e
                     WHERE e.case_id = c.verification_case_id ORDER BY e.revision DESC) AS state_json
            FROM dbo.beneficiaries b
            JOIN dbo.users u ON u.user_id = b.linked_user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
            JOIN dbo.verification_cases c ON c.vault_id = b.vault_id
            JOIN dbo.legal_basis_dossiers d ON d.verification_case_id = c.verification_case_id
            CROSS APPLY (SELECT MAX(x.version_no) AS max_version FROM dbo.legal_basis_dossier_versions x
                          WHERE x.legal_basis_dossier_id = d.legal_basis_dossier_id) mv
            WHERE b.linked_user_id = ?
            ORDER BY c.created_at DESC, c.verification_case_id DESC
            """;

    /**
     * Một dòng kết quả của {@code BENEFICIARY_SQL}.
     */
    private record Row(long caseDbId, UUID casePublicId, String caseStatus, int total, int delivered, String stateJson) { }

    /**
     * Cases where the authenticated account is a currently linked recipient, with the account's own approved total and
     * delivered counts. A case with no delivery yet is still listed; absence never shrinks the total; a revoked link
     * disappears at once because it is read from the live link. READY never means delivered.
     *
     * Bỏ qua ca không có phạm vi được duyệt cho tài khoản; nếu trạng thái READY nhưng điểm danh không còn khớp phạm vi
     * hiện tại thì báo UNCONFIRMED.
     *
     * @param principal người thụ hưởng đang đăng nhập
     * @return trạng thái các ca của tài khoản
     */
    @Transactional(readOnly = true)
    public BeneficiaryStatus beneficiaryStatus(CustomUserPrincipal principal) {
        Long accountId = CustomUserPrincipal.requireUserId(principal);
        List<Row> rows = jdbc.query(BENEFICIARY_SQL, (rs, i) -> new Row(rs.getLong("verification_case_id"),
                UUID.fromString(rs.getString("case_public")), rs.getString("case_status"), rs.getInt("total_assets"),
                rs.getInt("delivered_assets"), rs.getString("state_json")), accountId);
        List<BeneficiaryCase> result = new ArrayList<>();
        for (Row row : rows) {
            if (row.total() == 0) {
                continue; // no approved scope for this account in this case
            }
            GroupState state = row.stateJson() == null ? GroupState.initial() : decode(row.stateJson());
            String status = state.status();
            if ("READY".equals(status) && "OPEN".equals(row.caseStatus()) && !readyIsCurrent(row.caseDbId(), state)) {
                status = "UNCONFIRMED"; // attendance no longer matches the current scope: it must be recorded again
            }
            result.add(new BeneficiaryCase(row.casePublicId(),
                    caseNumber(row.caseDbId()), status, row.total(), Math.min(row.delivered(), row.total())));
        }
        return new BeneficiaryStatus(principal.publicId(), List.copyOf(result));
    }

    /**
     * Lấy số hồ sơ của ca.
     *
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu ca không tồn tại
     */
    private String caseNumber(long caseDbId) {
        return cases.findById(caseDbId).map(c -> c.getCaseNumber())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    /**
     * Giải mã JSON thành {@link GroupState}; ném {@link IllegalStateException} nếu dữ liệu hỏng.
     */
    private GroupState decode(String value) {
        try {
            return json.readValue(value, GroupState.class);
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid persisted group state", ex);
        }
    }

    /**
     * Lock-free re-evaluation of the same fingerprint the delivery gate uses. Anything missing means "not current".
     *
     * Tính lại vân tay phạm vi hiện tại bằng {@link GroupFingerprint} và so với {@code state}; thiếu bất kỳ dữ liệu nào
     * (ca, hồ sơ, phiên, phê duyệt) thì trả false.
     */
    private boolean readyIsCurrent(long caseDbId, GroupState state) {
        var verificationCase = cases.findById(caseDbId).orElse(null);
        if (verificationCase == null || !verificationCase.isOpen() || verificationCase.getAssignedStaffUserId() == null) {
            return false;
        }
        var dossier = dossiers.findByVerificationCaseId(caseDbId).orElse(null);
        var session = sessions.findByVerificationCaseIdAndStaffUserIdAndStatusOrderByOpenedAtDesc(caseDbId,
                verificationCase.getAssignedStaffUserId(), HandoverSessionStatus.OPEN).stream().findFirst().orElse(null);
        if (dossier == null || session == null) {
            return false;
        }
        int number = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        var version = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), number).orElse(null);
        var approval = history.findFirstByDossierIdAndReviewStatusInOrderByIdDesc(dossier.getLegalBasisDossierId(),
                List.of("LEGAL_APPROVED", "LEGAL_REJECTED")).orElse(null);
        if (version == null || approval == null) {
            return false;
        }
        var rows = allocations.findReceiptRowsByDossier(dossier.getLegalBasisDossierId()).stream()
                .filter(r -> r.versionNo() == number && LegalBasisVersionAllocation.STATUS_APPROVED.equals(r.status()))
                .toList();
        String hash = GroupFingerprint.of(session.getPublicId(), verificationCase.getAssignedStaffUserId(),
                verificationCase.getUpdatedAt(), dossier.getUpdatedAt(), version.version(), version.sha256(),
                dossier.getLastReviewedAllocationHash(), approval.getPublicId(), rows);
        return state.allowed(hash);
    }
}
