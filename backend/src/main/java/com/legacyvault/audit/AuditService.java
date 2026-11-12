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
 * Dịch vụ ghi nhật ký kiểm toán vào bảng {@code audit_logs} (thông qua {@link AuditLogRepository}).
 *
 * <p>Là điểm ghi audit duy nhất của hệ thống: các service nghiệp vụ gọi
 * {@code record(new AuditEvent(...))}. Dịch vụ tự bổ sung traceId (từ MDC do {@code TraceIdFilter} đặt),
 * danh sách quyền của người đang đăng nhập (từ SecurityContext), hạn lưu trữ 12 tháng, và lọc bỏ các khóa nhạy cảm
 * (mật khẩu, token, số CCCD, nội dung file...) khỏi {@code context}.
 */
@Service
public class AuditService {

    private static final String TRACE_ID_KEY = "traceId";

    /** Các từ khóa tên trường bị cấm xuất hiện trong {@code context} audit (so khớp theo chứa chuỗi, không phân biệt hoa thường). */
    private static final Set<String> BLOCKED_CONTEXT_KEYS = Set.of(
            "password", "passwd", "token", "access_token", "refresh_token",
            "jwt", "secret", "client_secret", "encryption_key", "private_key",
            "file_bytes", "file_content", "asset_payload", "citizen_id",
            "identity_number", "full_identity_number"
    );

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    /** Tạo service với repository lưu audit và {@link ObjectMapper} để tuần tự hóa JSON; đồng hồ cố định UTC. */
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
     *
     * <p>Các bước: kiểm tra event không null; lấy giờ UTC; lấy traceId từ MDC; tuần tự hóa quyền hiện tại và
     * {@code context} đã lọc thành JSON; tạo {@link AuditLog} (hạn lưu = now + 12 tháng) rồi {@code saveAndFlush}.
     *
     * @param event sự kiện cần ghi
     * @throws IllegalArgumentException nếu event null hoặc IP quá 45 ký tự
     * @throws IllegalStateException    nếu traceId trong MDC sai định dạng hoặc không tuần tự hóa được JSON
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

        auditLogRepository.saveAndFlush(log);
    }

    /**
     * Chuẩn hóa trạng thái trước/sau thành JSON object: nếu đã là JSON object thì giữ nguyên, ngược lại bọc thành
     * {@code {"status": state}}.
     *
     * @param state chuỗi trạng thái, có thể null
     * @return chuỗi JSON object hoặc null nếu đầu vào null
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
     * Ghi audit {@code AUTH_LOGIN_FAILED} trong transaction riêng ({@code REQUIRES_NEW}) để bản ghi vẫn được lưu dù
     * transaction đăng nhập bị rollback. Được {@code AuthService} gọi khi đăng nhập sai mật khẩu.
     *
     * @param actorUserId id người dùng bị đăng nhập sai, null nếu không xác định được tài khoản
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
     * Lấy traceId của request hiện tại từ MDC.
     *
     * @return UUID traceId, hoặc null nếu MDC không có giá trị (ví dụ tác vụ nền)
     * @throws IllegalStateException nếu giá trị không phải UUID hợp lệ
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

    /** Trả về tập quyền (ví dụ {@code ROLE_ADMIN}) của người đang đăng nhập; tập rỗng nếu chưa xác thực. */
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

    /** Loại bỏ các khóa nhạy cảm ở cấp ngoài cùng của {@code context}, lọc đệ quy giá trị lồng nhau. */
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

    /**
     * Lọc đệ quy một giá trị: map thì bỏ khóa nhạy cảm, collection thì lọc từng phần tử, {@code byte[]} bị thay bằng
     * {@code [REDACTED]}, các giá trị khác giữ nguyên.
     */
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

    /** Kiểm tra tên khóa (chuẩn hóa chữ thường, {@code -} thành {@code _}) có chứa từ khóa nằm trong danh sách cấm hay không. */
    private boolean isSensitiveKey(String key) {
        String normalized = key.toLowerCase().replace("-", "_");
        return BLOCKED_CONTEXT_KEYS.stream().anyMatch(normalized::contains);
    }

    /** Tuần tự hóa danh sách quyền thành JSON cho cột {@code actor_roles}. */
    private String serializeRoles(Collection<String> roles) {
        return serialize(roles);
    }

    /** Tuần tự hóa {@code context} đã lọc thành JSON cho cột {@code details}. */
    private String serializeContext(Map<String, Object> context) {
        return serialize(context);
    }

    /** Tuần tự hóa đối tượng bất kỳ sang JSON; ném {@link IllegalStateException} nếu thất bại. */
    private String serialize(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot serialize audit data", exception);
        }
    }

    /**
     * Chuẩn hóa địa chỉ IP: chuỗi rỗng thành null; dài quá 45 ký tự (độ dài tối đa của IPv6) thì ném
     * {@link IllegalArgumentException}.
     */
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