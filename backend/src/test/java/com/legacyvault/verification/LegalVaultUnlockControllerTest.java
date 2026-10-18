package com.legacyvault.verification;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.verification.controller.LegalVaultUnlockController;
import com.legacyvault.verification.dto.LegalVaultUnlockResponse;
import com.legacyvault.verification.service.LegalVaultUnlockService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated;
import static org.springframework.security.core.authority.AuthorityUtils.createAuthorityList;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = LegalVaultUnlockController.class)
@WebContractTestConfig
class LegalVaultUnlockControllerTest {
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final CustomUserPrincipal LEGAL =
            new CustomUserPrincipal(25L, UUID.randomUUID(), "legal@example.test");
    private static final String URL = "/api/v1/legal-verifications/verification-cases/{caseId}/unlock";

    @Autowired private MockMvc mvc;
    @MockitoBean private JwtService jwtService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private UserRoleRepository userRoleRepository;
    @MockitoBean private LegalVaultUnlockService service;

    private org.springframework.test.web.servlet.request.RequestPostProcessor as(String role) {
        return authentication(authenticated(LEGAL, null, createAuthorityList("ROLE_" + role)));
    }

    @Test
    void legalRoleCanInvokeUnlockAndGetsStateResponse() throws Exception {
        when(service.unlock(eq(CASE_ID), any())).thenReturn(new LegalVaultUnlockResponse(
                CASE_ID, UUID.randomUUID(), "UNLOCKED", LEGAL.publicId(), Instant.parse("2026-10-18T10:00:00Z")));

        mvc.perform(post(URL, CASE_ID).with(as("LEGAL_VERIFIER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UNLOCKED"))
                .andExpect(jsonPath("$.unlockedBy").value(LEGAL.publicId().toString()));
        verify(service).unlock(eq(CASE_ID), any());
    }

    @Test
    void nonLegalRoleIsForbidden() throws Exception {
        mvc.perform(post(URL, CASE_ID).with(as("STAFF_EXECUTOR")))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void anonymousRequestIsUnauthorized() throws Exception {
        mvc.perform(post(URL, CASE_ID)).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
}
