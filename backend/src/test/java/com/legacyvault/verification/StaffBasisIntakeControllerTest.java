package com.legacyvault.verification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.mock.web.MockMultipartFile;
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
import com.legacyvault.verification.controller.StaffBasisIntakeController;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.BasisForwardService;
import com.legacyvault.verification.service.BasisIntakeService;

/** PS-41: hợp đồng HTTP của /staff/verification-cases/{caseId}/basis-dossier (multipart: metadata + file). */
@WebMvcTest(controllers = StaffBasisIntakeController.class)
@WebContractTestConfig
class StaffBasisIntakeControllerTest {

    private static final CustomUserPrincipal STAFF = new CustomUserPrincipal(10L, UUID.randomUUID(), "staff@example.com");
    private static final UUID CASE_ID = UUID.fromString("6f1a4c2d-0000-4000-8000-000000000001");
    private static final String URL = "/api/v1/staff/verification-cases/{caseId}/basis-dossier";
    private static final BasisDossierResponse DOSSIER = new BasisDossierResponse(UUID.randomUUID(), CASE_ID,
            "NOTARIAL", "LEGAL_BASIS_PROVIDED", "NONE", null, UUID.randomUUID(), Instant.parse("2026-10-04T10:00:00Z"),
            Instant.parse("2026-10-04T10:00:00Z"), List.of(), 1);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtService jwtService;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private UserRoleRepository userRoleRepository;

    @MockitoBean
    private BasisIntakeService intake;

    @MockitoBean
    private BasisDossierViewService views;

    @MockitoBean
    private BasisForwardService forwardService;

    private static RequestPostProcessor as(String role) {
        return authentication(new UsernamePasswordAuthenticationToken(STAFF, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static RequestPostProcessor staff() {
        return as("STAFF_EXECUTOR");
    }

    private static String metadata(String type, String number) {
        return "{\"legalBasisType\":\"" + type + "\",\"issuingAuthority\":\"Phòng công chứng số 1\","
                + "\"documentNumber\":\"" + number + "\",\"issueDate\":\"2026-09-20\"}";
    }

    private ResultActions receive(String metadataJson, boolean withFile, RequestPostProcessor who) throws Exception {
        var request = multipart(URL + "/versions", CASE_ID).with(who);
        if (metadataJson != null) {
            request.file(new MockMultipartFile("metadata", "", "application/json",
                    metadataJson.getBytes(StandardCharsets.UTF_8)));
        }
        if (withFile) {
            request.file(new MockMultipartFile("file", "van-ban.pdf", "application/pdf",
                    "%PDF-1.7".getBytes(StandardCharsets.US_ASCII)));
        }
        return mockMvc.perform(request);
    }

    @Test
    void receive_returns201WithLocation_forStaff() throws Exception {
        when(intake.intake(eq(CASE_ID), any(), any(), any())).thenReturn(DOSSIER);

        receive(metadata("NOTARIAL_PARTITION", "045/2026"), true, staff())
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/v1/staff/verification-cases/" + CASE_ID + "/basis-dossier"))
                .andExpect(jsonPath("$.status").value("LEGAL_BASIS_PROVIDED"))
                .andExpect(jsonPath("$.routeReason").doesNotExist());
    }

    @Test
    void receive_invalidMetadata_returns400_withoutCallingService() throws Exception {
        receive(metadata("PASSPORT", "1"), true, staff()).andExpect(status().isBadRequest());
        receive(metadata("NOTARIAL_PARTITION", "   "), true, staff()).andExpect(status().isBadRequest());
        receive("{}", true, staff()).andExpect(status().isBadRequest());
        receive(metadata("NOTARIAL_PARTITION", "1").replace("2026-09-20", "2999-01-01"), true, staff())
                .andExpect(status().isBadRequest());
        verifyNoInteractions(intake);
    }

    @Test
    void receive_missingMetadataPart_returns400_notServerError() throws Exception {
        when(intake.intake(eq(CASE_ID), any(), isNull(), any()))
                .thenThrow(new BusinessException(ErrorCode.VALIDATION_FAILED));

        receive(null, true, staff()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void receive_mapsErrors_andRoles() throws Exception {
        when(intake.intake(eq(CASE_ID), any(), any(), any()))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .thenThrow(new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE))
                .thenThrow(new BusinessException(ErrorCode.UNSUPPORTED_MEDIA_TYPE))
                .thenThrow(new BusinessException(ErrorCode.PAYLOAD_TOO_LARGE))
                .thenThrow(new BusinessException(ErrorCode.VALIDATION_FAILED));
        String meta = metadata("NOTARIAL_PARTITION", "045/2026");

        receive(meta, true, staff()).andExpect(status().isNotFound());
        receive(meta, true, staff()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BASIS_DOSSIER_INVALID_STATE"));
        receive(meta, true, staff()).andExpect(status().isUnsupportedMediaType());
        receive(meta, true, staff()).andExpect(status().isPayloadTooLarge());
        receive(meta, false, staff()).andExpect(status().isBadRequest());
        receive(meta, true, as("LEGAL_VERIFIER")).andExpect(status().isForbidden());
        receive(meta, true, as("VAULT_OWNER")).andExpect(status().isForbidden());
        mockMvc.perform(multipart(URL + "/versions", CASE_ID)
                .file(new MockMultipartFile("metadata", "", "application/json", meta.getBytes(StandardCharsets.UTF_8))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void get_returnsDossier_forStaffOnly() throws Exception {
        when(views.forStaff(eq(CASE_ID), any())).thenReturn(DOSSIER);

        mockMvc.perform(get(URL, CASE_ID).with(staff())).andExpect(status().isOk())
                .andExpect(jsonPath("$.route").value("NOTARIAL"));
        mockMvc.perform(get(URL, CASE_ID).with(as("LEGAL_VERIFIER"))).andExpect(status().isForbidden());
        mockMvc.perform(get(URL, CASE_ID)).andExpect(status().isUnauthorized());
    }

    @Test
    void forward_returns200_forStaffOnly() throws Exception {
        when(forwardService.forward(eq(CASE_ID), eq(2), any())).thenReturn(DOSSIER);

        mockMvc.perform(post(URL + "/versions/{version}/forward", CASE_ID, 2).with(staff()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.route").value("NOTARIAL"));
        mockMvc.perform(post(URL + "/versions/{version}/forward", CASE_ID, 2).with(as("LEGAL_VERIFIER")))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(URL + "/versions/{version}/forward", CASE_ID, 2)).andExpect(status().isUnauthorized());
    }

    @Test
    void forward_mapsErrors_andRejectsVersionBelowOne() throws Exception {
        when(forwardService.forward(eq(CASE_ID), eq(1), any()))
                .thenThrow(new BusinessException(ErrorCode.BASIS_VERSION_STALE))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        mockMvc.perform(post(URL + "/versions/{version}/forward", CASE_ID, 1).with(staff()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BASIS_VERSION_STALE"));
        mockMvc.perform(post(URL + "/versions/{version}/forward", CASE_ID, 1).with(staff()))
                .andExpect(status().isNotFound());
        mockMvc.perform(post(URL + "/versions/{version}/forward", CASE_ID, 0).with(staff()))
                .andExpect(status().isBadRequest());
    }
}
