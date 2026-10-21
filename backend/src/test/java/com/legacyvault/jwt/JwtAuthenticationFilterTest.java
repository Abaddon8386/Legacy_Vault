package com.legacyvault.jwt;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.ApiAuthenticationEntryPoint;
import com.legacyvault.common.security.JwtAuthenticationFilter;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class JwtAuthenticationFilterTest {

    private final JwtService jwtService = mock(JwtService.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final UserRoleRepository userRoleRepository =
            mock(UserRoleRepository.class);
    private final ApiAuthenticationEntryPoint entryPoint =
            mock(ApiAuthenticationEntryPoint.class);

    private final JwtAuthenticationFilter filter =
            new JwtAuthenticationFilter(
                    jwtService,
                    userRepository,
                    userRoleRepository,
                    entryPoint
            );

    @AfterEach
    void cleanSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void doFilterInternal_shouldCreateRoleVaultOwnerAuthority()
            throws Exception {

        UUID publicId = UUID.randomUUID();

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer valid-token");

        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        Claims claims = mock(Claims.class);
        when(jwtService.parseAndValidate("valid-token")).thenReturn(claims);
        when(claims.getSubject()).thenReturn(publicId.toString());
        when(claims.get("authVersion")).thenReturn(0L);

        User user = mock(User.class);
        when(userRepository.findByPublicId(publicId))
                .thenReturn(Optional.of(user));
        when(user.getUserId()).thenReturn(10L);
        when(user.getPublicId()).thenReturn(publicId);
        when(user.getEmail()).thenReturn("owner@example.com");
        when(user.getStatus()).thenReturn("ACTIVE");
        when(user.getDeletedAt()).thenReturn(null);

        Role role = mock(Role.class);
        when(role.getRoleCode()).thenReturn("ROLE_VAULT_OWNER");

        UserRole userRole = mock(UserRole.class);
        when(userRole.getRole()).thenReturn(role);

        when(userRoleRepository.findByUserIdWithRole(10L))
                .thenReturn(List.of(userRole));

        filter.doFilter(request, response, chain);

        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();

        assertNotNull(authentication);
        assertTrue(authentication.isAuthenticated());
        assertTrue(authentication.getAuthorities().contains(
                new SimpleGrantedAuthority("ROLE_VAULT_OWNER")
        ));
        assertFalse(authentication.getAuthorities().contains(
                new SimpleGrantedAuthority("VAULT_OWNER")
        ));

        verify(chain).doFilter(request, response);
    }
}
