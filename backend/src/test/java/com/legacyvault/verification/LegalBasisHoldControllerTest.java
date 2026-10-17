package com.legacyvault.verification;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.*;
import com.legacyvault.verification.controller.LegalBasisHoldController;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.service.LegalBasisHoldService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(LegalBasisHoldController.class)
@WebContractTestConfig
class LegalBasisHoldControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository roles;
    @MockitoBean LegalBasisHoldService service;
    private static final UUID CASE = UUID.randomUUID();
    private static final String URL = "/api/v1/legal-verifications/verification-cases/" + CASE + "/basis-dossier/hold";
    private static final CustomUserPrincipal LEGAL = new CustomUserPrincipal(1L, UUID.randomUUID(), "legal@example.test");
    private static org.springframework.test.web.servlet.request.RequestPostProcessor as(String role) {
        return authentication(new UsernamePasswordAuthenticationToken(LEGAL, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
    private static final String BODY = "{\"cause\":\"NEW_DISPUTE\",\"reason\":\"Evidence assessed by Legal\"}";

    @Test void legalReceivesHoldAndRequiredNewVersion() throws Exception {
        when(service.hold(any(), any(), any())).thenReturn(new BasisDossierResponse(UUID.randomUUID(), CASE,
                "ON_HOLD", "DRAFT", "DISPUTED", "Evidence assessed by Legal", LEGAL.publicId(),
                Instant.parse("2026-10-17T01:00:00Z"), Instant.parse("2026-10-17T01:00:00Z"), List.of(), 2));
        mvc.perform(post(URL).with(as("LEGAL_VERIFIER")).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.route").value("ON_HOLD"))
                .andExpect(jsonPath("$.requiredVersion").value(2));
    }

    @Test void staffOwnerAndAnonymousCannotPlaceHold() throws Exception {
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());
        for (String role : List.of("STAFF_EXECUTOR", "VAULT_OWNER"))
            mvc.perform(post(URL).with(as(role)).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test void missingCauseBlankReasonAndUnknownCauseAreRejected() throws Exception {
        for (String body : List.of("{\"reason\":\"Evidence\"}", "{\"cause\":\"NEW_DISPUTE\",\"reason\":\" \"}",
                "{\"cause\":\"AUTO_RELEASE\",\"reason\":\"Evidence\"}"))
            mvc.perform(post(URL).with(as("LEGAL_VERIFIER")).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
