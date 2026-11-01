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
 */
final class GroupEventReader {

    /** Who recorded an event. Public ids only. */
    record Actor(UUID userId, String fullName) { }

    /** One stored event with its resulting state. */
    record Event(UUID eventId, UUID sessionId, String operation, long revision, GroupState state,
            Set<UUID> presentRecipientIds, String reason, Instant at, Actor actor) { }

    private static final String SELECT = """
            SELECT e.public_id, s.public_id AS session_public_id, e.operation, e.revision, e.state_json, e.present_json,
                   e.reason, e.created_at, u.public_id AS actor_public_id, u.full_name
            FROM dbo.handover_group_events e
            JOIN dbo.handover_sessions s ON s.handover_session_id = e.session_id
            JOIN dbo.users u ON u.user_id = e.actor_user_id
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    GroupEventReader(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    GroupState decodeState(String value) {
        try {
            return json.readValue(value, GroupState.class);
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid persisted group state", ex);
        }
    }

    private Set<UUID> decodePresent(String value) {
        try {
            return Set.copyOf(json.readValue(value, new TypeReference<Set<UUID>>() { }));
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid persisted present recipients", ex);
        }
    }

    private Event map(java.sql.ResultSet rs) throws java.sql.SQLException {
        LocalDateTime created = rs.getObject("created_at", LocalDateTime.class);
        return new Event(UUID.fromString(rs.getString("public_id")), UUID.fromString(rs.getString("session_public_id")),
                rs.getString("operation"), rs.getLong("revision"), decodeState(rs.getString("state_json")),
                decodePresent(rs.getString("present_json")), rs.getString("reason"), created.toInstant(ZoneOffset.UTC),
                new Actor(UUID.fromString(rs.getString("actor_public_id")), rs.getString("full_name")));
    }

    Optional<Event> latest(long caseId) {
        return jdbc.query(SELECT + " WHERE e.case_id = ? ORDER BY e.revision DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY",
                (rs, i) -> map(rs), caseId).stream().findFirst();
    }

    GroupState currentState(long caseId) {
        return latest(caseId).map(Event::state).orElseGet(GroupState::initial);
    }

    Optional<Event> byId(long caseId, UUID eventId) {
        if (eventId == null) {
            return Optional.empty();
        }
        return jdbc.query(SELECT + " WHERE e.case_id = ? AND e.public_id = ?", (rs, i) -> map(rs), caseId,
                eventId.toString()).stream().findFirst();
    }

    Optional<Event> lastDecision(long caseId) {
        return jdbc.query(SELECT + " WHERE e.case_id = ? AND e.operation IN ('APPROVE','REJECT') "
                + "ORDER BY e.revision DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY", (rs, i) -> map(rs), caseId)
                .stream().findFirst();
    }

    long count(long caseId) {
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM dbo.handover_group_events WHERE case_id = ?", Long.class,
                caseId);
        return total == null ? 0 : total;
    }

    /** Newest first. */
    List<Event> page(long caseId, int page, int size) {
        return jdbc.query(SELECT + " WHERE e.case_id = ? ORDER BY e.revision DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
                (rs, i) -> map(rs), caseId, (long) page * size, size);
    }
}
