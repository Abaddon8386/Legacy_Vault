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
import java.time.LocalDate;
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
import com.legacyvault.verification.controller.StaffDeathDocumentController;
import com.legacyvault.verification.dto.DeathDocumentRecordResponse;
import com.legacyvault.verification.service.DeathDocumentIntakeService;

/** PS-38: hợp đồng HTTP của /staff/verification-cases/{caseId}/death-documents (quyền, validation, mã lỗi). */
@WebMvcTest(controllers = StaffDeathDocumentController.class)
@WebContractTestConfig
class StaffDeathDocumentControllerTest {

    private static final CustomUserPrincipal STAFF = new CustomUserPrincipal(10L, UUID.randomUUID(), "staff@example.com");
    private static final UUID CASE_ID = UUID.fromString("6f1a4c2d-0000-4000-8000-000000000001");
    private static final UUID RECORD_ID = UUID.fromString("7a2b5d3e-0000-4000-8000-000000000002");
    private static final DeathDocumentRecordResponse RECORD = new DeathDocumentRecordResponse(RECORD_ID, CASE_ID,
            "DEATH_CERTIFICATE", "UBND Phường Bến Nghé", "123/2026", LocalDate.of(2026, 9, 30), STAFF.publicId(),
            Instant.parse("2026-10-02T09:30:00Z"), "BB-01", null);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtService jwtService;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private UserRoleRepository userRoleRepository;

    @MockitoBean
    private DeathDocumentIntakeService service;

    private static RequestPostProcessor as(CustomUserPrincipal user, String role) {
        return authentication(new UsernamePasswordAuthenticationToken(user, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static RequestPostProcessor staff() {
        return as(STAFF, "STAFF_EXECUTOR");
    }

    private static String body(String type, String authority, String number, String date) {
        return "{\"documentType\":\"" + type + "\",\"issuingAuthority\":\"" + authority
                + "\",\"documentNumber\":\"" + number + "\",\"issuedDate\":\"" + date + "\"}";
    }

    private static String validBody() {
        return body("DEATH_CERTIFICATE", "UBND Phường Bến Nghé", "123/2026", "2026-09-30");
    }

    private ResultActions record(String json, RequestPostProcessor who) throws Exception {
        return mockMvc.perform(post("/api/v1/staff/verification-cases/{caseId}/death-documents", CASE_ID).with(who)
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void record_returns201WithLocation_andIgnoresServerOwnedFields() throws Exception {
        when(service.record(eq(CASE_ID), any(), any())).thenReturn(RECORD);

        record("{\"documentType\":\"DEATH_CERTIFICATE\",\"issuingAuthority\":\"UBND\",\"documentNumber\":\"1\","
                + "\"issuedDate\":\"2026-09-30\",\"receivedBy\":\"x\",\"receivedAt\":\"2020-01-01T00:00:00Z\"}", staff())
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/staff/verification-cases/" + CASE_ID + "/death-documents/" + RECORD_ID))
                .andExpect(jsonPath("$.id").value(RECORD_ID.toString()))
                .andExpect(jsonPath("$.caseId").value(CASE_ID.toString()))
                .andExpect(jsonPath("$.documentType").value("DEATH_CERTIFICATE"))
                .andExpect(jsonPath("$.issuedDate").value("2026-09-30"))
                .andExpect(jsonPath("$.receivedBy").value(STAFF.publicId().toString()));
    }

    @Test
    void record_invalidBody_returns400_withFieldErrors_andDoesNotCallService() throws Exception {
        record("{}", staff()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[?(@.field=='documentType')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='issuingAuthority')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='documentNumber')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='issuedDate')]").exists());
        record(body("PASSPORT", "UBND", "1", "2026-09-30"), staff()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='documentType')]").exists());
        record(body("DEATH_CERTIFICATE", "UBND", "1", "2999-01-01"), staff()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='issuedDate')]").exists());
        record(body("DEATH_CERTIFICATE", "a".repeat(256), "1", "2026-09-30"), staff())
                .andExpect(status().isBadRequest());
        record(body("DEATH_CERTIFICATE", "UBND", "   ", "2026-09-30"), staff()).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void record_mapsNotFound404_notOpen409_wrongRole403_noLogin401() throws Exception {
        when(service.record(eq(CASE_ID), any(), any()))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .thenThrow(new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN));

        record(validBody(), staff()).andExpect(status().isNotFound());
        record(validBody(), staff()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERIFICATION_CASE_NOT_OPEN"));
        record(validBody(), as(STAFF, "LEGAL_VERIFIER")).andExpect(status().isForbidden());
        record(validBody(), as(STAFF, "VAULT_OWNER")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/staff/verification-cases/{caseId}/death-documents", CASE_ID)
                .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void list_and_get_returnRecords_forStaffOnly() throws Exception {
        when(service.list(eq(CASE_ID), any())).thenReturn(List.of(RECORD));
        when(service.get(eq(CASE_ID), eq(RECORD_ID), any())).thenReturn(RECORD);

        mockMvc.perform(get("/api/v1/staff/verification-cases/{caseId}/death-documents", CASE_ID).with(staff()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(RECORD_ID.toString()));
        mockMvc.perform(get("/api/v1/staff/verification-cases/{caseId}/death-documents/{id}", CASE_ID, RECORD_ID)
                .with(staff()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documentNumber").value("123/2026"));
        mockMvc.perform(get("/api/v1/staff/verification-cases/{caseId}/death-documents", CASE_ID)
                .with(as(STAFF, "VAULT_OWNER")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/staff/verification-cases/{caseId}/death-documents", "not-a-uuid").with(staff()))
                .andExpect(status().isBadRequest());
    }
}
