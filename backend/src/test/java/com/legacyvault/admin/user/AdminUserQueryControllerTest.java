package com.legacyvault.admin.user;

import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.controller.AdminUserQueryController;
import com.legacyvault.admin.user.service.AdminUserQueryService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.common.web.PageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AdminUserQueryController.class)
@WebContractTestConfig
class AdminUserQueryControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean AdminUserQueryService service;
    @MockitoBean com.legacyvault.auth.JwtService jwtService;
    @MockitoBean com.legacyvault.user.repository.UserRepository userRepository;
    @MockitoBean com.legacyvault.user.repository.UserRoleRepository userRoleRepository;

    @Test
    void directAccessRequiresAuthenticationAndAdminRole() throws Exception {
        mvc.perform(get("/api/v1/admin/users")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/users").with(auth("ROLE_STAFF_EXECUTOR")))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanReadPageAndResponseContainsOnlyAllowListedFields() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.listUsers(null, null, null, null, 0, 20)).thenReturn(new PageResponse<>(List.of(
                new AdminUserResponse(id, "Admin", "admin@example.test", List.of("ROLE_ADMIN"),
                        Instant.parse("2026-10-20T00:00:00Z"), "ACTIVE", "ACTIVE", null)), 0, 20, 1, 1));

        mvc.perform(get("/api/v1/admin/users").with(auth("ROLE_ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].publicId").value(id.toString()))
                .andExpect(jsonPath("$.content[0].roles[0]").value("ROLE_ADMIN"))
                .andExpect(jsonPath("$.content[0].passwordHash").doesNotExist())
                .andExpect(jsonPath("$.content[0].userId").doesNotExist());
    }

    @Test
    void ownerFiltersAndLockedAccountsAreAcceptedWhileUnknownVaultStatusIsRejected() throws Exception {
        when(service.listUsers(null, "ROLE_VAULT_OWNER", "LOCKED", "IN_PROCESS", 0, 20))
                .thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0));
        mvc.perform(get("/api/v1/admin/users").param("role", "ROLE_VAULT_OWNER")
                        .param("status", "LOCKED").param("vaultStatus", "IN_PROCESS").with(auth("ROLE_ADMIN")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/users").param("vaultStatus", "UNKNOWN").with(auth("ROLE_ADMIN")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void processingFilterAndRoleScopedDetailExposeDisplayStateSeparately() throws Exception {
        UUID id = UUID.randomUUID();
        var actor = new AdminUserResponse(id, "Legal", "legal@example.test", List.of("ROLE_LEGAL_VERIFIER"),
                Instant.parse("2026-10-20T00:00:00Z"), "ACTIVE", "IN_PROCESS", null);
        when(service.listUsers(null, "ROLE_LEGAL_VERIFIER", "IN_PROCESS", null, 0, 20))
                .thenReturn(new PageResponse<>(List.of(actor), 0, 20, 1, 1));
        when(service.getUser(id, "ROLE_LEGAL_VERIFIER")).thenReturn(actor);
        mvc.perform(get("/api/v1/admin/users").param("role", "ROLE_LEGAL_VERIFIER").param("status", "IN_PROCESS")
                        .with(auth("ROLE_ADMIN"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.content[0].accountStatus").value("IN_PROCESS"));
        mvc.perform(get("/api/v1/admin/users/" + id).param("role", "ROLE_LEGAL_VERIFIER").with(auth("ROLE_ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accountStatus").value("IN_PROCESS"));
    }

    @Test
    void invalidStatusAndMalformedPublicIdAreBadRequests() throws Exception {
        mvc.perform(get("/api/v1/admin/users").param("status", "DISABLED").with(auth("ROLE_ADMIN")))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/admin/users/not-a-uuid").with(auth("ROLE_ADMIN")))
                .andExpect(status().isBadRequest());
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor auth(String authority) {
        var principal = new CustomUserPrincipal(1L, UUID.randomUUID(), "admin@example.test");
        return authentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority(authority))));
    }
}
