package com.legacyvault.verification;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.*;
import com.legacyvault.verification.controller.CourtDecisionController;
import com.legacyvault.verification.dto.CourtDecisionResponse;
import com.legacyvault.verification.service.CourtDecisionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CourtDecisionController.class)
@WebContractTestConfig
class CourtDecisionControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository roles;
    @MockitoBean CourtDecisionService service;
    private static final UUID CASE = UUID.randomUUID();
    private static final String URL = "/api/v1/legal-verifications/verification-cases/" + CASE + "/basis-dossier/court-decisions";
    private static final CustomUserPrincipal LEGAL = new CustomUserPrincipal(1L, UUID.randomUUID(), "legal@example.test");
    private static org.springframework.test.web.servlet.request.RequestPostProcessor as(String role) {
        return authentication(new UsernamePasswordAuthenticationToken(LEGAL, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    @Test void legalReceives201AndServerActor() throws Exception {
        when(service.record(any(), any(), any())).thenReturn(new CourtDecisionResponse(UUID.randomUUID(), CASE,
                1, "a".repeat(64), "VALID", "Legal assessment", LEGAL.publicId(), Instant.parse("2026-10-17T01:00:00Z")));
        mvc.perform(post(URL).with(as("LEGAL_VERIFIER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":1,\"result\":\"VALID\",\"reason\":\"Legal assessment\"}"))
                .andExpect(status().isCreated()).andExpect(header().string("Location", URL))
                .andExpect(jsonPath("$.reviewedBy").value(LEGAL.publicId().toString()));
    }

    @Test void staffOwnerAndAnonymousCannotReviewOrRead() throws Exception {
        mvc.perform(get(URL)).andExpect(status().isUnauthorized());
        for (String role : List.of("STAFF_EXECUTOR", "VAULT_OWNER")) {
            mvc.perform(get(URL).with(as(role))).andExpect(status().isForbidden());
            mvc.perform(post(URL).with(as(role)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":1,\"result\":\"VALID\",\"reason\":\"Assessment\"}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }

    @Test void invalidVersionMissingReasonAndUnknownResultAreRejected() throws Exception {
        for (String body : List.of("{\"version\":0,\"result\":\"VALID\",\"reason\":\"Assessment\"}",
                "{\"version\":1,\"result\":\"VALID\",\"reason\":\" \"}",
                "{\"version\":1,\"result\":\"AUTO_APPROVED\",\"reason\":\"Assessment\"}"))
            mvc.perform(post(URL).with(as("LEGAL_VERIFIER")).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
