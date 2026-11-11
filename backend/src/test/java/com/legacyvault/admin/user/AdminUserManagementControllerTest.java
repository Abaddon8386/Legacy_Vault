package com.legacyvault.admin.user;

import com.legacyvault.admin.user.controller.AdminUserManagementController;
import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminUserManagementService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminUserManagementController.class)
@WebContractTestConfig
class AdminUserManagementControllerTest {
    private static final String CREATE = """
            {"fullName":"New Staff","email":"new.staff@example.test","phone":"","password":"Str0ng-Pass!","role":"ROLE_STAFF_EXECUTOR"}
            """;

    @Autowired MockMvc mvc;
    @MockitoBean AdminUserManagementService service;
    @MockitoBean com.legacyvault.auth.JwtService jwtService;
    @MockitoBean com.legacyvault.user.repository.UserRepository userRepository;
    @MockitoBean com.legacyvault.user.repository.UserRoleRepository userRoleRepository;

    @Test
    void onlyAdminsMayCreateAccountsOrChangeRoles() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(post("/api/v1/admin/users").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(CREATE))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/admin/users").with(auth("ROLE_STAFF_EXECUTOR")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(CREATE))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/admin/users/" + id + "/role").with(auth("ROLE_LEGAL_VERIFIER")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"STAFF_EXECUTOR\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void adminCreatesAnAccountAndTheResponseNeverEchoesThePassword() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.createUser(eq(1L), any())).thenReturn(new AdminUserResponse(id, "New Staff",
                "new.staff@example.test", List.of("ROLE_STAFF_EXECUTOR"), Instant.parse("2026-11-11T00:00:00Z"), "ACTIVE", "ACTIVE", null));

        mvc.perform(post("/api/v1/admin/users").with(auth("ROLE_ADMIN")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(CREATE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.publicId").value(id.toString()))
                .andExpect(jsonPath("$.roles[0]").value("ROLE_STAFF_EXECUTOR"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void invalidCreateBodiesAreRejectedBeforeReachingTheService() throws Exception {
        for (String body : List.of(
                "{\"fullName\":\"\",\"email\":\"a@example.test\",\"password\":\"Str0ng-Pass!\",\"role\":\"STAFF_EXECUTOR\"}",
                "{\"fullName\":\"A\",\"email\":\"not-an-email\",\"password\":\"Str0ng-Pass!\",\"role\":\"STAFF_EXECUTOR\"}",
                "{\"fullName\":\"A\",\"email\":\"a@example.test\",\"password\":\"short\",\"role\":\"STAFF_EXECUTOR\"}",
                "{\"fullName\":\"A\",\"email\":\"a@example.test\",\"password\":\"Str0ng-Pass!\"}")) {
            mvc.perform(post("/api/v1/admin/users").with(auth("ROLE_ADMIN")).with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test
    void adminChangesARole() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.changeRole(eq(1L), eq(id), any())).thenReturn(new AdminUserResponse(id, "Someone",
                "someone@example.test", List.of("ROLE_LEGAL_VERIFIER"), Instant.parse("2026-11-11T00:00:00Z"), "ACTIVE", "ACTIVE", null));

        mvc.perform(put("/api/v1/admin/users/" + id + "/role").with(auth("ROLE_ADMIN")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"LEGAL_VERIFIER\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles[0]").value("ROLE_LEGAL_VERIFIER"));
        mvc.perform(put("/api/v1/admin/users/not-a-uuid/role").with(auth("ROLE_ADMIN")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"LEGAL_VERIFIER\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void onlyAdminsMayLockAndUnlockAndTheReasonIsOptional() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.setLocked(eq(1L), eq(id), eq(true), any())).thenReturn(new AdminUserResponse(id, "Someone",
                "someone@example.test", List.of("ROLE_LEGAL_VERIFIER"), Instant.parse("2026-11-11T00:00:00Z"), "LOCKED", "LOCKED", null));
        when(service.setLocked(eq(1L), eq(id), eq(false), any())).thenReturn(new AdminUserResponse(id, "Someone",
                "someone@example.test", List.of("ROLE_LEGAL_VERIFIER"), Instant.parse("2026-11-11T00:00:00Z"), "ACTIVE", "ACTIVE", null));

        mvc.perform(post("/api/v1/admin/users/" + id + "/lock").with(auth("ROLE_STAFF_EXECUTOR")).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/users/" + id + "/unlock").with(csrf())).andExpect(status().isUnauthorized());

        mvc.perform(post("/api/v1/admin/users/" + id + "/lock").with(auth("ROLE_ADMIN")).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("LOCKED"));
        mvc.perform(post("/api/v1/admin/users/" + id + "/lock").with(auth("ROLE_ADMIN")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Policy review\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/admin/users/" + id + "/unlock").with(auth("ROLE_ADMIN")).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        mvc.perform(post("/api/v1/admin/users/" + id + "/lock").with(auth("ROLE_ADMIN")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + "x".repeat(256) + "\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/admin/users/not-a-uuid/unlock").with(auth("ROLE_ADMIN")).with(csrf()))
                .andExpect(status().isBadRequest());
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor auth(String authority) {
        var principal = new CustomUserPrincipal(1L, UUID.randomUUID(), "admin@example.test");
        return authentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority(authority))));
    }
}
