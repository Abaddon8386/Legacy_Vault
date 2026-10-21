package com.legacyvault.beneficiary;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

@WebMvcTest(CounterIdentityAttestationController.class)
@WebContractTestConfig
class CounterIdentityAttestationControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository roles;
    @MockitoBean CounterIdentityAttestationService service;

    private final UUID caseId = UUID.randomUUID();
    private final UUID beneficiaryId = UUID.randomUUID();
    private final UUID attestationId = UUID.randomUUID();
    private final String path = "/api/v1/staff/verification-cases/" + caseId + "/beneficiaries/"
            + beneficiaryId + "/identity-attestations";

    @Test
    void staffCanRecordAttestationWithoutSubmittingIdentityResult() throws Exception {
        when(service.attest(eq(caseId), eq(beneficiaryId), any())).thenReturn(new CounterIdentityAttestationDtos.Response(
                attestationId, caseId, beneficiaryId, UUID.randomUUID(), Instant.parse("2026-10-21T00:00:00Z")));
        mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"evidenceReference\":\"COUNTER-17\",\"confirmedEmail\":\"recipient@example.com\",\"result\":\"MATCH\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.attestationId").value(attestationId.toString()))
                .andExpect(jsonPath("$.recordedAt").value("2026-10-21T00:00:00Z"))
                .andExpect(jsonPath("$.result").doesNotExist())
                .andExpect(jsonPath("$.evidenceReference").doesNotExist());
        verify(service).attest(eq(caseId), eq(beneficiaryId), any());
    }

    @Test
    void requiresStaffAuthenticationAndValidReference() throws Exception {
        for (String role : List.of("VAULT_OWNER", "LEGAL_VERIFIER", "BENEFICIARY", "ADMIN")) {
            mvc.perform(post(path).with(user("other").roles(role)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"evidenceReference\":\"REF-1\"}"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{\"evidenceReference\":\"REF-1\"}"))
                .andExpect(status().isUnauthorized());
        for (String body : List.of("{}", "{\"evidenceReference\":\"  \"}",
                "{\"evidenceReference\":\"" + "x".repeat(201) + "\"}",
                "{\"evidenceReference\":\"REF-1\",\"confirmedEmail\":\"not-an-email\"}",
                "{\"evidenceReference\":\"REF-1\",\"confirmedEmail\":\"" + "x".repeat(245) + "@example.com\"}")) {
            mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR"))
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }
}
