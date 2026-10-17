
package com.legacyvault.verification;

import com.legacyvault.common.error.ApiErrorFactory;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.security.JwtAuthenticationFilter;
import com.legacyvault.verification.controller.LegalDeathVerificationController;
import com.legacyvault.verification.dto.LegalDeathDecisionRequest;
import com.legacyvault.verification.dto.LegalDeathDecisionResponse;
import com.legacyvault.verification.service.LegalDeathVerificationService;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(
        controllers = LegalDeathVerificationController.class,
        excludeFilters = @ComponentScan.Filter(
                type = FilterType.ASSIGNABLE_TYPE,
                classes = JwtAuthenticationFilter.class
        )
)
@Import(LegalDeathVerificationControllerTest.MethodSecurityTestConfig.class)
class LegalDeathVerificationControllerTest {

    private static final String DECISION_URL =
            "/api/v1/legal-verifications/death-documents/{id}/decision";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private LegalDeathVerificationService service;

    @MockitoBean
    private ApiErrorFactory apiErrorFactory;

    @Test
    void staffCannotDecideDeathDocument() throws Exception {
        mockMvc.perform(post(DECISION_URL, UUID.randomUUID())
                        .with(user("staff").roles("STAFF"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isForbidden());

        verifyNoInteractions(service);
    }

    @Test
    void ownerCannotDecideDeathDocument() throws Exception {
        mockMvc.perform(post(DECISION_URL, UUID.randomUUID())
                        .with(user("owner").roles("OWNER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isForbidden());

        verifyNoInteractions(service);
    }

    @Test
    void unauthenticatedUserCannotDecideDeathDocument() throws Exception {
        mockMvc.perform(post(DECISION_URL, UUID.randomUUID())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(service);
    }

    @Test
    void legalVerifierCanReachDecisionService() throws Exception {
        UUID documentPublicId = UUID.randomUUID();
        UUID casePublicId = UUID.randomUUID();
        UUID actorPublicId = UUID.randomUUID();

        CustomUserPrincipal principal = new CustomUserPrincipal(
                8L,
                actorPublicId,
                "legal@example.com"
        );

        LegalDeathDecisionResponse response = new LegalDeathDecisionResponse(
                documentPublicId,
                casePublicId,
                "APPROVED",
                actorPublicId,
                Instant.now(),
                "Da kiem tra giay to",
                "CLOSED",
                "ACTIVE"
        );

        when(service.decide(
                eq(documentPublicId),
                any(LegalDeathDecisionRequest.class),
                any(CustomUserPrincipal.class)
        )).thenReturn(response);

        mockMvc.perform(post(DECISION_URL, documentPublicId)
                        .with(authentication(
                                new UsernamePasswordAuthenticationToken(
                                        principal,
                                        null,
                                        List.of(new SimpleGrantedAuthority(
                                                "ROLE_LEGAL_VERIFIER"
                                        ))
                                )
                        ))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isOk());

        verify(service).decide(
                eq(documentPublicId),
                any(LegalDeathDecisionRequest.class),
                any(CustomUserPrincipal.class)
        );
    }

    @Test
    void invalidDecisionRequestReturnsBadRequest() throws Exception {
        mockMvc.perform(post(DECISION_URL, UUID.randomUUID())
                        .with(user("legal").roles("LEGAL_VERIFIER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "decision": "INVALID_DECISION",
                                  "reason": "Da kiem tra giay to"
                                }
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    @Test
    void missingReasonReturnsBadRequest() throws Exception {
        mockMvc.perform(post(DECISION_URL, UUID.randomUUID())
                        .with(user("legal").roles("LEGAL_VERIFIER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "decision": "APPROVE"
                                }
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    private String validRequest() {
        return """
                {
                  "decision": "APPROVE",
                  "reason": "Da kiem tra giay to"
                }
                """;
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class MethodSecurityTestConfig {
    }
}
