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

            if (!"ACTIVE".equals(user.getStatus()) || user.getDeletedAt() != null) {
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

    private void reject(HttpServletRequest request, HttpServletResponse response) throws IOException, ServletException {
        SecurityContextHolder.clearContext();
        authenticationEntryPoint.commence(request, response,
                new InsufficientAuthenticationException("Authentication required"));
    }
}
