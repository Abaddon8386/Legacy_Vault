package com.legacyvault.verification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.verification.controller.LegalWillComparisonController;
import com.legacyvault.verification.dto.WillComparisonOverviewResponse;
import com.legacyvault.verification.dto.WillComparisonResponse;
import com.legacyvault.verification.service.WillComparisonService;

/** PS-40: hợp đồng HTTP của /legal-verifications/verification-cases/{caseId}/will-comparisons. */
@WebMvcTest(controllers = LegalWillComparisonController.class)
@WebContractTestConfig
class LegalWillComparisonControllerTest {

    private static final CustomUserPrincipal LEGAL = new CustomUserPrincipal(20L, UUID.randomUUID(), "legal@example.com");
    private static final UUID CASE_ID = UUID.fromString("6f1a4c2d-0000-4000-8000-000000000001");
    private static final UUID INTAKE_ID = UUID.fromString("8b3c6e4f-0000-4000-8000-000000000003");
    private static final UUID WILL_ID = UUID.fromString("5d6e7f80-0000-4000-8000-000000000005");
    private static final String HASH = "a".repeat(64);
    private static final String URL = "/api/v1/legal-verifications/verification-cases/{caseId}/will-comparisons";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtService jwtService;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private UserRoleRepository userRoleRepository;

    @MockitoBean
    private WillComparisonService service;

    private static RequestPostProcessor as(String role) {
        return authentication(new UsernamePasswordAuthenticationToken(LEGAL, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static RequestPostProcessor legal() {
        return as("LEGAL_VERIFIER");
    }

    private static String body(String result, String reason) {
        String r = reason == null ? "" : ",\"reason\":\"" + reason + "\"";
        return "{\"originalWillIntakeId\":\"" + INTAKE_ID + "\",\"willId\":\"" + WILL_ID
                + "\",\"version\":2,\"result\":\"" + result + "\"" + r + "}";
    }

    private ResultActions record(String json, RequestPostProcessor who) throws Exception {
        return mockMvc.perform(post(URL, CASE_ID).with(who).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void record_returns201WithLocation_andIgnoresServerOwnedFields() throws Exception {
        when(service.record(eq(CASE_ID), any(), any())).thenReturn(new WillComparisonResponse(UUID.randomUUID(),
                CASE_ID, INTAKE_ID, WILL_ID, 2, HASH, "MISMATCH", LEGAL.publicId(), "khác",
                Instant.parse("2026-10-04T10:00:00Z")));

        record("{\"originalWillIntakeId\":\"" + INTAKE_ID + "\",\"willId\":\"" + WILL_ID + "\",\"version\":2,"
                + "\"result\":\"MISMATCH\",\"reason\":\"khác\",\"sha256\":\"x\",\"checkedBy\":\"y\"}", legal())
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/legal-verifications/verification-cases/" + CASE_ID + "/will-comparisons"))
                .andExpect(jsonPath("$.result").value("MISMATCH"))
                .andExpect(jsonPath("$.sha256").value(HASH))
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.comparedAt").value("2026-10-04T10:00:00Z"))
                .andExpect(jsonPath("$.checkedBy").value(LEGAL.publicId().toString()));
    }

    @Test
    void record_invalidBody_returns400_withoutCallingService() throws Exception {
        record("{}", legal()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[?(@.field=='originalWillIntakeId')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='willId')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='version')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='result')]").exists());
        record(body("MAYBE", null), legal()).andExpect(status().isBadRequest());
        record(body("MATCH", "a".repeat(1001)), legal()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='reason')]").exists());
        record(body("MATCH", null).replace("\"version\":2", "\"version\":0"), legal())
                .andExpect(status().isBadRequest());
        record(body("MATCH", null).replace(WILL_ID.toString(), "khong-phai-uuid"), legal())
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void record_mapsNotFound404_conflict409_wrongRole403_noLogin401() throws Exception {
        when(service.record(eq(CASE_ID), any(), any()))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .thenThrow(new BusinessException(ErrorCode.LEGAL_VERIFICATION_INVALID_STATE))
                .thenThrow(new BusinessException(ErrorCode.VALIDATION_FAILED));

        record(body("MATCH", null), legal()).andExpect(status().isNotFound());
        record(body("MATCH", null), legal()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LEGAL_VERIFICATION_INVALID_STATE"));
        record(body("MISMATCH", "x"), legal()).andExpect(status().isBadRequest());
        record(body("MATCH", null), as("STAFF_EXECUTOR")).andExpect(status().isForbidden());
        record(body("MATCH", null), as("VAULT_OWNER")).andExpect(status().isForbidden());
        mockMvc.perform(post(URL, CASE_ID).contentType(MediaType.APPLICATION_JSON).content(body("MATCH", null)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void overview_returnsData_forLegalOnly() throws Exception {
        when(service.overview(CASE_ID)).thenReturn(new WillComparisonOverviewResponse(CASE_ID, "DOCUMENT_VERIFICATION",
                true, "MISMATCH", List.of(), List.of(), List.of()));

        mockMvc.perform(get(URL, CASE_ID).with(legal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approvalBlocked").value(true))
                .andExpect(jsonPath("$.latestResult").value("MISMATCH"))
                .andExpect(jsonPath("$.vaultStatus").value("DOCUMENT_VERIFICATION"));
        mockMvc.perform(get(URL, CASE_ID).with(as("STAFF_EXECUTOR"))).andExpect(status().isForbidden());
        mockMvc.perform(get(URL, CASE_ID).with(as("VAULT_OWNER"))).andExpect(status().isForbidden());
        mockMvc.perform(get(URL, CASE_ID)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(URL, "not-a-uuid").with(legal())).andExpect(status().isBadRequest());
    }
}
