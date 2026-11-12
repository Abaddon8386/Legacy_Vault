package com.legacyvault.common.security;


import java.io.IOException;
import java.util.List;
import java.util.UUID;

import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.legacyvault.auth.JwtService;


import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Filter xác thực Bearer JWT, chạy mỗi request một lần, đặt trước {@code UsernamePasswordAuthenticationFilter}
 * (xem {@link SecurityConfig}).
 *
 * <p>Với mỗi request có header {@code Authorization: Bearer ...}: kiểm tra chữ ký/hạn token qua
 * {@code JwtService}; tìm user theo subject (UUID công khai) trong bảng {@code users}; so khớp claim
 * {@code authVersion} với {@code users.auth_version}, và yêu cầu tài khoản {@code ACTIVE} chưa xóa; nạp quyền
 * (role) từ bảng user_roles ở DB trên MỌI request (đổi role có hiệu lực ngay); tạo {@link CustomUserPrincipal}
 * và đặt Authentication vào SecurityContext. Token sai thì trả 401 qua {@link ApiAuthenticationEntryPoint}.
 * Không có Bearer token thì để Spring Security quyết định endpoint có công khai không.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    /** Dịch vụ phân tích và kiểm tra chữ ký/hạn của JWT. */
    private final JwtService jwtService;
    /** Tra cứu người dùng theo UUID công khai (bảng {@code users}). */
    private final UserRepository userRepository;
    /** Nạp danh sách role của người dùng từ DB cho mỗi request. */
    private final UserRoleRepository userRoleRepository;
    /** Ghi phản hồi 401 JSON khi token bị từ chối. */
    private final ApiAuthenticationEntryPoint authenticationEntryPoint;

    /** Nhận các thành phần phụ thuộc: JwtService, hai repository người dùng/role và entry point 401. */
    public JwtAuthenticationFilter(
            JwtService jwtService,
            UserRepository userRepository,
            UserRoleRepository userRoleRepository,
            ApiAuthenticationEntryPoint authenticationEntryPoint) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.authenticationEntryPoint = authenticationEntryPoint;
    }

    /**
     * Xử lý một request: bỏ qua hai endpoint khôi phục mật khẩu (POST {@code /api/v1/auth/password-recovery/requests}
     * và {@code /reset}, chỉ xác thực bằng thông tin riêng của luồng đó, không dùng JWT cũ trong tab); nếu không có
     * Bearer token thì cho đi tiếp; ngược lại xác thực token như mô tả ở {@link JwtAuthenticationFilter}.
     * Token rỗng, sai, hết hạn, sai {@code authVersion}, user bị khóa/xóa hoặc không tồn tại đều bị từ chối 401.
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        // Recovery authenticates only its purpose-bound credential, never a stale tab JWT.
        String path=request.getRequestURI().substring(request.getContextPath().length());
        if ("POST".equals(request.getMethod()) && (path.equals("/api/v1/auth/password-recovery/requests")
                || path.equals("/api/v1/auth/password-recovery/reset"))) {
            filterChain.doFilter(request, response); return;
        }
        String authorization = request.getHeader("Authorization");

        // Không có Bearer token: để Spring Security quyết định endpoint có public không.
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authorization.substring(7).trim();

        if (token.isEmpty()) {
            reject(request, response);
            return;
        }

        try {
            Claims claims = jwtService.parseAndValidate(token);
            UUID publicUserId = UUID.fromString(claims.getSubject());

            User user = userRepository.findByPublicId(publicUserId).orElseThrow(()
                    -> new InsufficientAuthenticationException("Invalid authentication"));

            Object version = claims.get("authVersion");
            if (!(version instanceof Number number) || number.longValue() != user.getAuthVersion()
                    || number.doubleValue() != number.longValue()
                    || !"ACTIVE".equals(user.getStatus()) || user.getDeletedAt() != null) {
                reject(request, response);
                return;
            }

            List<SimpleGrantedAuthority> authorities =
                    userRoleRepository.findByUserIdWithRole(user.getUserId())
                            .stream()
                            .map(UserRole::getRole)
                            .filter(java.util.Objects::nonNull)
                            .map(role -> role.getRoleCode())
                            .filter(roleCode -> roleCode != null && !roleCode.isBlank())
                            .map(SimpleGrantedAuthority::new)
                            .toList();

            CustomUserPrincipal principal = new CustomUserPrincipal(
                    user.getUserId(),
                    user.getPublicId(),
                    user.getEmail());

            var authentication = new UsernamePasswordAuthenticationToken(
                    principal, null, authorities);

            SecurityContextHolder.getContext().setAuthentication(authentication);

        } catch (JwtException | IllegalArgumentException | InsufficientAuthenticationException ex) {
            SecurityContextHolder.clearContext();
            reject(request, response);
            return;
        }

        filterChain.doFilter(request, response);
    }

    /** Xóa SecurityContext và trả 401 {@code UNAUTHENTICATED} thông qua {@link ApiAuthenticationEntryPoint}. */
    private void reject(HttpServletRequest request, HttpServletResponse response) throws IOException, ServletException {
        SecurityContextHolder.clearContext();
        authenticationEntryPoint.commence(request, response,
                new InsufficientAuthenticationException("Authentication required"));
    }
}
