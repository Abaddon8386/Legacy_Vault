package com.legacyvault.verification.group;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * PS-122: lock-free reads of the append-only {@code handover_group_events} source (V57). Nothing here writes; the
 * latest revision of a case is its current gate state, earlier rows are history.
 *
 * Cách hoạt động: dùng {@link JdbcTemplate} chạy SELECT trên {@code dbo.handover_group_events} (join
 * {@code handover_sessions} và {@code users}), giải mã JSON {@code state_json}/{@code present_json} thành
 * {@link GroupState} và tập UUID người thụ hưởng có mặt. Được {@code GroupHandoverService} tạo thủ công
 * ({@code new GroupEventReader(jdbc, json)}) trong các hàm {@code view} và {@code history}; không ghi dữ liệu.
 */
final class GroupEventReader {

    /**
     * Who recorded an event. Public ids only.
     *
     * Người ghi sự kiện: UUID công khai và họ tên (bảng {@code users}).
     */
    record Actor(UUID userId, String fullName) { }

    /**
     * One stored event with its resulting state.
     *
     * Một sự kiện đã lưu: mã sự kiện, phiên, thao tác (ATTENDANCE, REQUEST, APPROVE, REJECT), revision, trạng thái kết quả,
     * tập người có mặt, lý do, thời điểm (UTC) và người ghi.
     */
    record Event(UUID eventId, UUID sessionId, String operation, long revision, GroupState state,
            Set<UUID> presentRecipientIds, String reason, Instant at, Actor actor) { }

    /**
     * Câu SELECT chung cho mọi truy vấn sự kiện nhóm; các hàm bên dưới nối thêm WHERE/ORDER BY.
     */
    private static final String SELECT = """
            SELECT e.public_id, s.public_id AS session_public_id, e.operation, e.revision, e.state_json, e.present_json,
                   e.reason, e.created_at, u.public_id AS actor_public_id, u.full_name
            FROM dbo.handover_group_events e
            JOIN dbo.handover_sessions s ON s.handover_session_id = e.session_id
            JOIN dbo.users u ON u.user_id = e.actor_user_id
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    /**
     * Tạo reader với {@code jdbc} để truy vấn và {@code json} để giải mã trạng thái.
     */
    GroupEventReader(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /**
     * Giải mã chuỗi JSON thành {@link GroupState}.
     *
     * @param value chuỗi {@code state_json} đã lưu
     * @return trạng thái cổng nhóm
     * @throws IllegalStateException nếu JSON lưu trong DB không hợp lệ
     */
    GroupState decodeState(String value) {
        try {
            return json.readValue(value, GroupState.class);
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid persisted group state", ex);
        }
    }

    /**
     * Giải mã {@code present_json} thành tập UUID người thụ hưởng có mặt (bất biến).
     *
     * @throws IllegalStateException nếu JSON không hợp lệ
     */
    private Set<UUID> decodePresent(String value) {
        try {
            return Set.copyOf(json.readValue(value, new TypeReference<Set<UUID>>() { }));
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid persisted present recipients", ex);
        }
    }

    /**
     * Ánh xạ một dòng kết quả sang {@link Event}; {@code created_at} (LocalDateTime) được coi là UTC.
     */
    private Event map(java.sql.ResultSet rs) throws java.sql.SQLException {
        LocalDateTime created = rs.getObject("created_at", LocalDateTime.class);
        return new Event(UUID.fromString(rs.getString("public_id")), UUID.fromString(rs.getString("session_public_id")),
                rs.getString("operation"), rs.getLong("revision"), decodeState(rs.getString("state_json")),
                decodePresent(rs.getString("present_json")), rs.getString("reason"), created.toInstant(ZoneOffset.UTC),
                new Actor(UUID.fromString(rs.getString("actor_public_id")), rs.getString("full_name")));
    }

    /**
     * Sự kiện mới nhất (revision lớn nhất) của ca, tức trạng thái cổng hiện tại.
     *
     * @param caseId khóa nội bộ của ca xác minh
     */
    Optional<Event> latest(long caseId) {
        return jdbc.query(SELECT + " WHERE e.case_id = ? ORDER BY e.revision DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY",
                (rs, i) -> map(rs), caseId).stream().findFirst();
    }

    /**
     * Trạng thái cổng hiện tại của ca; nếu chưa có sự kiện nào thì trả {@link GroupState#initial()} (UNCONFIRMED).
     */
    GroupState currentState(long caseId) {
        return latest(caseId).map(Event::state).orElseGet(GroupState::initial);
    }

    /**
     * Tìm sự kiện theo UUID công khai trong phạm vi ca; {@code eventId} null thì trả rỗng.
     */
    Optional<Event> byId(long caseId, UUID eventId) {
        if (eventId == null) {
            return Optional.empty();
        }
        return jdbc.query(SELECT + " WHERE e.case_id = ? AND e.public_id = ?", (rs, i) -> map(rs), caseId,
                eventId.toString()).stream().findFirst();
    }

    /**
     * Quyết định gần nhất của Legal (thao tác APPROVE hoặc REJECT) của ca.
     */
    Optional<Event> lastDecision(long caseId) {
        return jdbc.query(SELECT + " WHERE e.case_id = ? AND e.operation IN ('APPROVE','REJECT') "
                + "ORDER BY e.revision DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY", (rs, i) -> map(rs), caseId)
                .stream().findFirst();
    }

    /**
     * Tổng số sự kiện của ca (dùng để phân trang lịch sử).
     */
    long count(long caseId) {
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.handover_group_events WHERE case_id = ?", Long.class,
                caseId);
        return total == null ? 0 : total;
    }

    /**
     * Newest first.
     *
     * Một trang sự kiện, mới nhất trước; offset = {@code page * size}.
     */
    List<Event> page(long caseId, int page, int size) {
        return jdbc.query(SELECT + " WHERE e.case_id = ? ORDER BY e.revision DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
                (rs, i) -> map(rs), caseId, (long) page * size, size);
    }
}
