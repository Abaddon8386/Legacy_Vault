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
import com.legacyvault.verification.controller.StaffOriginalWillController;
import com.legacyvault.verification.dto.OriginalWillIntakeResponse;
import com.legacyvault.verification.service.OriginalWillIntakeService;

/** PS-39: hợp đồng HTTP của /staff/verification-cases/{caseId}/original-will-intakes. */
@WebMvcTest(controllers = StaffOriginalWillController.class)
@WebContractTestConfig
class StaffOriginalWillControllerTest {

    private static final CustomUserPrincipal STAFF = new CustomUserPrincipal(10L, UUID.randomUUID(), "staff@example.com");
    private static final UUID CASE_ID = UUID.fromString("6f1a4c2d-0000-4000-8000-000000000001");
    private static final UUID INTAKE_ID = UUID.fromString("8b3c6e4f-0000-4000-8000-000000000003");
    private static final OriginalWillIntakeResponse INTAKE = new OriginalWillIntakeResponse(INTAKE_ID, CASE_ID,
            "Nguyễn Văn A", "Con trai", STAFF.publicId(), Instant.parse("2026-10-02T09:30:00Z"), "BB-07", null);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtService jwtService;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private UserRoleRepository userRoleRepository;

    @MockitoBean
    private OriginalWillIntakeService service;

    private static RequestPostProcessor as(CustomUserPrincipal user, String role) {
        return authentication(new UsernamePasswordAuthenticationToken(user, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static RequestPostProcessor staff() {
        return as(STAFF, "STAFF_EXECUTOR");
    }

    private ResultActions record(String json, RequestPostProcessor who) throws Exception {
        return mockMvc.perform(post("/api/v1/staff/verification-cases/{caseId}/original-will-intakes", CASE_ID)
                .with(who).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void record_returns201WithLocation_andIgnoresServerOwnedFields() throws Exception {
        when(service.record(eq(CASE_ID), any(), any())).thenReturn(INTAKE);

        record("{\"deliveredByName\":\"Nguyễn Văn A\",\"deliveredByRelationship\":\"Con trai\","
                + "\"receivedBy\":\"x\",\"receivedAt\":\"2020-01-01T00:00:00Z\"}", staff())
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/staff/verification-cases/" + CASE_ID + "/original-will-intakes/" + INTAKE_ID))
                .andExpect(jsonPath("$.id").value(INTAKE_ID.toString()))
                .andExpect(jsonPath("$.caseId").value(CASE_ID.toString()))
                .andExpect(jsonPath("$.deliveredByName").value("Nguyễn Văn A"))
                .andExpect(jsonPath("$.receivedBy").value(STAFF.publicId().toString()));
    }

    @Test
    void record_invalidBody_returns400_withoutCallingService() throws Exception {
        record("{}", staff()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[?(@.field=='deliveredByName')]").exists());
        record("{\"deliveredByName\":\"   \"}", staff()).andExpect(status().isBadRequest());
        record("{\"deliveredByName\":\"" + "a".repeat(151) + "\"}", staff()).andExpect(status().isBadRequest());
        record("{\"deliveredByName\":\"A\",\"deliveredByRelationship\":\"" + "a".repeat(101) + "\"}", staff())
                .andExpect(status().isBadRequest());
        record("{\"deliveredByName\":\"A\",\"conditionNotes\":\"" + "a".repeat(1001) + "\"}", staff())
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void record_mapsNotFound404_notOpen409_wrongRole403_noLogin401() throws Exception {
        when(service.record(eq(CASE_ID), any(), any()))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .thenThrow(new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN));
        String json = "{\"deliveredByName\":\"A\"}";

        record(json, staff()).andExpect(status().isNotFound());
        record(json, staff()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERIFICATION_CASE_NOT_OPEN"));
        record(json, as(STAFF, "LEGAL_VERIFIER")).andExpect(status().isForbidden());
        record(json, as(STAFF, "VAULT_OWNER")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/staff/verification-cases/{caseId}/original-will-intakes", CASE_ID)
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void list_and_get_returnIntakes_forStaffOnly() throws Exception {
        when(service.list(eq(CASE_ID), any())).thenReturn(List.of(INTAKE));
        when(service.get(eq(CASE_ID), eq(INTAKE_ID), any())).thenReturn(INTAKE);

        mockMvc.perform(get("/api/v1/staff/verification-cases/{caseId}/original-will-intakes", CASE_ID).with(staff()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(INTAKE_ID.toString()));
        mockMvc.perform(get("/api/v1/staff/verification-cases/{caseId}/original-will-intakes/{id}", CASE_ID, INTAKE_ID)
                .with(staff()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.evidenceReference").value("BB-07"));
        mockMvc.perform(get("/api/v1/staff/verification-cases/{caseId}/original-will-intakes", CASE_ID)
                .with(as(STAFF, "VAULT_OWNER")))
                .andExpect(status().isForbidden());
    }
}
