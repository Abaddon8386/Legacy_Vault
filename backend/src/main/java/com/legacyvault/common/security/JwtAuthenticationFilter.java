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
 * Filter xác thực Bearer JWT, chạy trước UsernamePasswordAuthenticationFilter.
 *
 * <p>Quy trình: bỏ qua hai endpoint khôi phục mật khẩu; không có Bearer thì cho đi tiếp (SecurityConfig quyết định endpoint có công khai không);
 * có token thì kiểm tra chữ ký/hạn, tải user theo subject, so khớp {@code authVersion} với {@code users.auth_version},
 * yêu cầu user ACTIVE và chưa xóa, rồi nạp role từ DB ở mỗi request nên đổi role hoặc khóa tài khoản có hiệu lực ngay.
 * Mọi lỗi xác thực đều trả 401 qua {@link ApiAuthenticationEntryPoint}.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final ApiAuthenticationEntryPoint authenticationEntryPoint;

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

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        // Hai endpoint khôi phục mật khẩu tự xác thực bằng credential riêng; bỏ qua JWT để một token cũ còn trong tab không làm request bị từ chối.
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

            // authVersion trong token phải khớp đúng DB: đổi/đặt lại mật khẩu hoặc khóa tài khoản làm tăng giá trị này và vô hiệu mọi token cũ.
            // Cũng từ chối tài khoản không ACTIVE hoặc đã xóa mềm.
            Object version = claims.get("authVersion");
            if (!(version instanceof Number number) || number.longValue() != user.getAuthVersion()
                    || number.doubleValue() != number.longValue()
                    || !"ACTIVE".equals(user.getStatus()) || user.getDeletedAt() != null) {
                reject(request, response);
                return;
            }

            // Role luôn đọc từ DB ở mỗi request (không tin claim trong token) nên đổi role áp dụng ngay.
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

    /**
     * Xóa SecurityContext và trả 401 qua {@link ApiAuthenticationEntryPoint}.
     */
    private void reject(HttpServletRequest request, HttpServletResponse response) throws IOException, ServletException {
        SecurityContextHolder.clearContext();
        authenticationEntryPoint.commence(request, response,
                new InsufficientAuthenticationException("Authentication required"));
    }
}
