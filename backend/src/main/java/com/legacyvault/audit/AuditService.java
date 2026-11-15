package com.legacyvault.audit;


import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;


import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Dịch vụ ghi audit tập trung. Tự bổ sung những thông tin nơi gọi không cần biết: thời điểm UTC, hạn lưu 12 tháng,
 * traceId (từ MDC) và danh sách role của người đang đăng nhập (từ SecurityContext).
 * Nội dung {@code context} được lọc các khóa nhạy cảm (mật khẩu, token, khóa mã hóa, nội dung file/tài sản, số định danh...) trước khi lưu.
 */
@Service
public class AuditService {

    private static final String TRACE_ID_KEY = "traceId";

    // Khóa (so khớp theo chuỗi con, không phân biệt hoa thường) bị loại khỏi context để audit không rò rỉ bí mật hay dữ liệu cá nhân.
    private static final Set<String> BLOCKED_CONTEXT_KEYS = Set.of(
            "password", "passwd", "token", "access_token", "refresh_token",
            "jwt", "secret", "client_secret", "encryption_key", "private_key",
            "file_bytes", "file_content", "asset_payload", "citizen_id",
            "identity_number", "full_identity_number"
    );

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public AuditService(
            AuditLogRepository auditLogRepository,
            ObjectMapper objectMapper
    ) {
        this.auditLogRepository = auditLogRepository;
        this.objectMapper = objectMapper;
        this.clock = Clock.systemUTC();
    }

    /**
     * Ghi một audit event trong transaction hiện tại.
     * Nếu việc lưu audit thất bại, exception được truyền lên để nghiệp vụ
     * đang chạy trong cùng transaction có thể rollback.
     */
    @Transactional
    public void record(AuditEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("Audit event is required");
        }

        LocalDateTime nowUtc = LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        UUID traceId = resolveTraceId();
        String rolesJson = serializeRoles(currentAuthorities());
        String detailsJson = serializeContext(filterContext(event.context()));

        AuditLog log = new AuditLog(
                event.actorUserId(),
                event.vaultId(),
                event.action().name(),
                event.entityType(),
                event.entityId(),
                normalizeIpAddress(event.ipAddress()),
                detailsJson,
                nowUtc.plusMonths(12),
                event.actorType().name(),
                rolesJson,
                normalizeStateJson(event.stateBefore()),
                normalizeStateJson(event.stateAfter()),
                traceId,
                event.stepId(),
                event.ruleId()
        );

        // Flush ngay: nếu ghi audit lỗi thì exception nổ tại đây và transaction nghiệp vụ cùng bị rollback, tránh thao tác thành công mà thiếu dấu vết.
        auditLogRepository.saveAndFlush(log);
    }

    /**
     * Chuẩn hóa trạng thái về JSON object: nếu đã là object JSON thì giữ nguyên, ngược lại (ví dụ "ACTIVE") bọc thành {@code {"status": ...}}.
     */
    private String normalizeStateJson(String state) {
        if (state == null) {
            return null;
        }

        try {
            JsonNode node = objectMapper.readTree(state);
            if (node != null && node.isObject()) {
                return state;
            }
        } catch (JsonProcessingException ignored) {
            // Trạng thái thông thường sẽ được bọc thành JSON object bên dưới.
        }

        try {
            return objectMapper.writeValueAsString(Map.of("status", state));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot serialize audit state", exception);
        }
    }

    /**
     * Ghi sự kiện đăng nhập sai trong transaction riêng (REQUIRES_NEW) để bản ghi vẫn được commit dù transaction đăng nhập bên ngoài bị rollback do ném lỗi xác thực.
     *
     * @param actorUserId id người dùng bị nhập sai thông tin đăng nhập
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordLoginFailure(Long actorUserId) {
        record(new AuditEvent(
                AuditAction.AUTH_LOGIN_FAILED,
                AuditActorType.USER,
                actorUserId,
                null,
                "USER",
                actorUserId,
                null,
                null,
                null,
                Map.of(
                        "result", "FAILURE",
                        "reason", "INVALID_CREDENTIALS"
                ),
                "AUTH_LOGIN",
                null
        ));
    }

    /**
     * Lấy traceId từ MDC; null nếu không có (ví dụ job nền). Giá trị MDC sai định dạng UUID là lỗi lập trình nên ném IllegalStateException.
     */
    private UUID resolveTraceId() {
        String value = MDC.get(TRACE_ID_KEY);
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("Invalid traceId in MDC", exception);
        }
    }

    /**
     * Danh sách authority (role) của người đang đăng nhập; rỗng nếu chưa xác thực.
     */
    private Collection<String> currentAuthorities() {
        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            return Set.of();
        }

        return authentication.getAuthorities()
                .stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toUnmodifiableSet());
    }

    /**
     * Loại các khóa nhạy cảm khỏi context, kể cả trong Map/Collection lồng nhau.
     */
    private Map<String, Object> filterContext(Map<String, Object> context) {
        Map<String, Object> filtered = new LinkedHashMap<>();
        if (context == null) {
            return filtered;
        }

        context.forEach((key, value) -> {
            if (key != null && !isSensitiveKey(key)) {
                filtered.put(key, filterValue(value));
            }
        });
        return filtered;
    }

    private Object filterValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> filtered = new LinkedHashMap<>();
            map.forEach((key, nestedValue) -> {
                if (key instanceof String stringKey && !isSensitiveKey(stringKey)) {
                    filtered.put(stringKey, filterValue(nestedValue));
                }
            });
            return filtered;
        }

        if (value instanceof Collection<?> collection) {
            return collection.stream().map(this::filterValue).toList();
        }

        // Không nhận byte[] vì có thể chứa nội dung file/tài sản.
        if (value instanceof byte[]) {
            return "[REDACTED]";
        }

        return value;
    }

    /**
     * Khóa nhạy cảm nếu (sau khi chuyển chữ thường, "-" thành "_") chứa bất kỳ mục nào trong {@link #BLOCKED_CONTEXT_KEYS}.
     */
    private boolean isSensitiveKey(String key) {
        String normalized = key.toLowerCase().replace("-", "_");
        return BLOCKED_CONTEXT_KEYS.stream().anyMatch(normalized::contains);
    }

    private String serializeRoles(Collection<String> roles) {
        return serialize(roles);
    }

    private String serializeContext(Map<String, Object> context) {
        return serialize(context);
    }

    private String serialize(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot serialize audit data", exception);
        }
    }

    private String normalizeIpAddress(String ipAddress) {
        if (ipAddress == null || ipAddress.isBlank()) {
            return null;
        }
        if (ipAddress.length() > 45) {
            throw new IllegalArgumentException("IP address must not exceed 45 characters");
        }
        return ipAddress;
    }
}