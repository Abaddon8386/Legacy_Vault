package com.legacyvault.verification;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.verification.controller.LegalBasisDossierController;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.LegalBasisReviewResponse;
import com.legacyvault.verification.dto.LegalApprovalResponse;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.BasisReclassificationService;
import com.legacyvault.verification.service.LegalBasisReviewService;
import com.legacyvault.verification.service.LegalApprovalService;
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

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = LegalBasisDossierController.class)
@WebContractTestConfig
class LegalBasisDossierControllerTest {

    private static final CustomUserPrincipal LEGAL =
            new CustomUserPrincipal(20L, UUID.randomUUID(), "legal@example.com");

    private static final UUID CASE_ID =
            UUID.fromString("6f1a4c2d-0000-4000-8000-000000000001");

    private static final UUID DOSSIER_ID =
            UUID.fromString("7a2b5d3e-0000-4000-8000-000000000001");

    private static final String URL =
            "/api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier";

    private static final BasisDossierResponse DOSSIER =
            new BasisDossierResponse(
                    UUID.randomUUID(),
                    CASE_ID,
                    "NOTARIAL",
                    "DRAFT",
                    "NONE",
                    "Không tranh chấp",
                    LEGAL.publicId(),
                    Instant.parse("2026-10-04T10:00:00Z"),
                    Instant.parse("2026-10-04T10:00:00Z"),
                    List.of(),
                    1);

    private static final LegalBasisReviewResponse REVIEW_RESPONSE =
            new LegalBasisReviewResponse(
                    DOSSIER_ID,
                    "FRESH",
                    false,
                    "REVIEW_COMPLETED",
                    "Đã kiểm tra hồ sơ",
                    1,
                    "a".repeat(64),
                    "NONE",
                    "b".repeat(64),
                    LocalDateTime.parse("2026-10-17T10:00:00"));

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtService jwtService;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private UserRoleRepository userRoleRepository;

    @MockitoBean
    private BasisClassificationService classification;

    @MockitoBean
    private BasisReclassificationService reclassification;

    @MockitoBean
    private BasisDossierViewService views;

    @MockitoBean
    private LegalBasisReviewService legalBasisReviewService;

    @MockitoBean
    private LegalApprovalService legalApprovalService;

    private static RequestPostProcessor as(String role) {
        return authentication(
                new UsernamePasswordAuthenticationToken(
                        LEGAL,
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static RequestPostProcessor legal() {
        return as("LEGAL_VERIFIER");
    }

    private ResultActions classify(String json, RequestPostProcessor who)
            throws Exception {
        return mockMvc.perform(
                post(URL, CASE_ID)
                        .with(who)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json));
    }

    private ResultActions review(
            String suffix,
            String json,
            RequestPostProcessor who
    ) throws Exception {
        return mockMvc.perform(
                post(URL + suffix, CASE_ID)
                        .with(who)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json));
    }

    @Test
    void classify_returns201WithLocation_forLegal() throws Exception {
        when(classification.classify(eq(CASE_ID), any(), any()))
                .thenReturn(DOSSIER);

        classify(
                "{\"route\":\"NOTARIAL\",\"routeReason\":\"Không tranh chấp\"}",
                legal())
                .andExpect(status().isCreated())
                .andExpect(header().string(
                        "Location",
                        "/api/v1/legal-verifications/verification-cases/"
                                + CASE_ID + "/basis-dossier"))
                .andExpect(jsonPath("$.route").value("NOTARIAL"))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.createdAt")
                        .value("2026-10-04T10:00:00Z"));
    }

    @Test
    void decision_isLegalOnlyAndUsesAuthenticatedPrincipal() throws Exception {
        String body = "{\"decision\":\"APPROVE\",\"reason\":\"Reviewed\",\"versionNo\":1,\"sha256Hash\":\""
                + "a".repeat(64) + "\",\"allocationHash\":\"" + "b".repeat(64) + "\"}";
        when(legalApprovalService.decide(eq(CASE_ID), any(), any())).thenReturn(
                new LegalApprovalResponse(DOSSIER_ID, "LEGAL_APPROVED", 1, "a".repeat(64),
                        "b".repeat(64), LEGAL.publicId(), LocalDateTime.parse("2026-10-18T10:00:00")));

        review("/decision", body, legal())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("LEGAL_APPROVED"));
        review("/decision", body, as("STAFF_EXECUTOR"))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(URL + "/decision", CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        verify(legalApprovalService).decide(eq(CASE_ID), any(), any());
    }

    @Test
    void decision_requiresRejectionReasonAndValidSnapshotFields() throws Exception {
        String prefix = "{\"decision\":\"REJECT\",\"versionNo\":1,\"sha256Hash\":\""
                + "a".repeat(64) + "\",\"allocationHash\":\"" + "b".repeat(64) + "\"}";
        review("/decision", prefix, legal()).andExpect(status().isBadRequest());
        review("/decision", "{\"decision\":\"APPROVE\",\"versionNo\":0}", legal())
                .andExpect(status().isBadRequest());
        verifyNoInteractions(legalApprovalService);
    }

    @Test
    void classify_invalidBody_returns400_withoutCallingService()
            throws Exception {
        classify("{}", legal())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='route')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='routeReason')]").exists());

        classify(
                "{\"route\":\"UNDETERMINED\",\"routeReason\":\"x\"}",
                legal())
                .andExpect(status().isBadRequest());

        classify(
                "{\"route\":\"COURT\",\"routeReason\":\"   \"}",
                legal())
                .andExpect(status().isBadRequest());

        classify(
                "{\"route\":\"COURT\",\"routeReason\":\""
                        + "a".repeat(1001) + "\"}",
                legal())
                .andExpect(status().isBadRequest());

        verifyNoInteractions(classification);
    }

    @Test
    void classify_mapsErrors_andRoles() throws Exception {
        when(classification.classify(eq(CASE_ID), any(), any()))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .thenThrow(new BusinessException(ErrorCode.WILL_NOT_VERIFIED))
                .thenThrow(new BusinessException(
                        ErrorCode.BASIS_DOSSIER_ALREADY_EXISTS))
                .thenThrow(new BusinessException(
                        ErrorCode.BASIS_DOSSIER_INVALID_STATE));

        String body =
                "{\"route\":\"NOTARIAL\",\"routeReason\":\"x\"}";

        classify(body, legal()).andExpect(status().isNotFound());

        classify(body, legal())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WILL_NOT_VERIFIED"));

        classify(body, legal())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("BASIS_DOSSIER_ALREADY_EXISTS"));

        classify(body, legal())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("BASIS_DOSSIER_INVALID_STATE"));

        classify(body, as("STAFF_EXECUTOR"))
                .andExpect(status().isForbidden());

        classify(body, as("VAULT_OWNER"))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        post(URL, CASE_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void get_returnsDossier_forLegalOnly() throws Exception {
        when(views.forLegal(CASE_ID)).thenReturn(DOSSIER);

        mockMvc.perform(get(URL, CASE_ID).with(legal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.routeReason")
                        .value("Không tranh chấp"));

        mockMvc.perform(get(URL, CASE_ID).with(as("STAFF_EXECUTOR")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get(URL, CASE_ID))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get(URL, "not-a-uuid").with(legal()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void reclassify_returns200_forLegalOnly() throws Exception {
        when(reclassification.reclassify(eq(CASE_ID), any(), any()))
                .thenReturn(DOSSIER);

        String body =
                "{\"route\":\"COURT\",\"routeReason\":\"Đã đủ chứng cứ\"}";

        mockMvc.perform(
                        post(URL + "/reclassification", CASE_ID)
                                .with(legal())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.route").value("NOTARIAL"));

        mockMvc.perform(
                        post(URL + "/reclassification", CASE_ID)
                                .with(as("STAFF_EXECUTOR"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        post(URL + "/reclassification", CASE_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reclassify_invalidBodyIs400_andErrorsAreMapped()
            throws Exception {
        mockMvc.perform(
                        post(URL + "/reclassification", CASE_ID)
                                .with(legal())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(reclassification);

        when(reclassification.reclassify(eq(CASE_ID), any(), any()))
                .thenThrow(new BusinessException(
                        ErrorCode.BASIS_DOSSIER_INVALID_STATE))
                .thenThrow(new BusinessException(
                        ErrorCode.VALIDATION_FAILED));

        String body =
                "{\"route\":\"NOTARIAL\",\"routeReason\":\"x\"}";

        mockMvc.perform(
                        post(URL + "/reclassification", CASE_ID)
                                .with(legal())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isConflict());

        mockMvc.perform(
                        post(URL + "/reclassification", CASE_ID)
                                .with(legal())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"route\":\"ON_HOLD\",\"routeReason\":\"x\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void review_returns200_andCallsServiceWithPrincipalUserId()
            throws Exception {
        when(legalBasisReviewService.recordCompletedReviewByCasePublicId(
                eq(CASE_ID), eq(20L), any(com.legacyvault.verification.dto.CompleteLegalBasisReviewRequest.class)))
                .thenReturn(REVIEW_RESPONSE);

        review(
                "/review",
                reviewBody("Đã kiểm tra hồ sơ"),
                legal())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dossierId").value(DOSSIER_ID.toString()))
                .andExpect(jsonPath("$.reviewStatus").value("FRESH"))
                .andExpect(jsonPath("$.reasonCode").value("REVIEW_COMPLETED"));

        verify(legalBasisReviewService)
                .recordCompletedReviewByCasePublicId(
                        eq(CASE_ID), eq(20L), any(com.legacyvault.verification.dto.CompleteLegalBasisReviewRequest.class));
    }

    @Test
    void review_rejectsInvalidBody_andDoesNotCallService()
            throws Exception {
        review("/review", "{}", legal())
                .andExpect(status().isBadRequest());

        review("/review", "{\"reason\":\"   \"}", legal())
                .andExpect(status().isBadRequest());

        review(
                "/review",
                "{\"reason\":\"" + "x".repeat(1001) + "\"}",
                legal())
                .andExpect(status().isBadRequest());

        verifyNoInteractions(legalBasisReviewService);
    }

    @Test
    void review_enforcesRoleAndAuthentication() throws Exception {
        String body = reviewBody("Đã kiểm tra hồ sơ");

        review("/review", body, as("STAFF_EXECUTOR"))
                .andExpect(status().isForbidden());

        review("/review", body, as("VAULT_OWNER"))
                .andExpect(status().isForbidden());

        review("/review", body, legal())
                .andExpect(status().isOk());

        mockMvc.perform(
                        post(URL + "/review", CASE_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void review_mapsNotFoundAndConflictErrors() throws Exception {
        when(legalBasisReviewService.recordCompletedReviewByCasePublicId(
                eq(CASE_ID), eq(20L), any(com.legacyvault.verification.dto.CompleteLegalBasisReviewRequest.class)))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .thenThrow(new BusinessException(
                        ErrorCode.BASIS_DOSSIER_INVALID_STATE));

        review("/review", reviewBody("reason"), legal())
                .andExpect(status().isNotFound());

        review("/review", reviewBody("reason"), legal())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("BASIS_DOSSIER_INVALID_STATE"));
    }

    @Test
    void requestSupplementation_returns200_andCallsService()
            throws Exception {
        LegalBasisReviewResponse response =
                new LegalBasisReviewResponse(
                        DOSSIER_ID,
                        "REVIEW_REQUIRED",
                        true,
                        "LEGAL_REQUESTED_SUPPLEMENTATION",
                        "Cần bổ sung bản gốc",
                        1,
                        "a".repeat(64),
                        "NONE",
                        "b".repeat(64),
                        LocalDateTime.parse("2026-10-17T10:00:00"));

        when(legalBasisReviewService.requestSupplementationByCasePublicId(
                eq(CASE_ID), eq(20L), eq("Cần bổ sung bản gốc")))
                .thenReturn(response);

        review(
                "/request-supplementation",
                "{\"reason\":\"Cần bổ sung bản gốc\"}",
                legal())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviewStatus")
                        .value("REVIEW_REQUIRED"))
                .andExpect(jsonPath("$.reviewRequired").value(true))
                .andExpect(jsonPath("$.reasonCode")
                        .value("LEGAL_REQUESTED_SUPPLEMENTATION"));

        verify(legalBasisReviewService)
                .requestSupplementationByCasePublicId(
                        CASE_ID, 20L, "Cần bổ sung bản gốc");
    }

    @Test
    void requestSupplementation_rejectsInvalidBody()
            throws Exception {
        review("/request-supplementation", "{}", legal())
                .andExpect(status().isBadRequest());

        review(
                "/request-supplementation",
                "{\"reason\":\"   \"}",
                legal())
                .andExpect(status().isBadRequest());

        review(
                "/request-supplementation",
                "{\"reason\":\"" + "x".repeat(1001) + "\"}",
                legal())
                .andExpect(status().isBadRequest());

        verifyNoInteractions(legalBasisReviewService);
    }

    @Test
    void requestSupplementation_enforcesRoleAndAuthentication()
            throws Exception {
        String body = "{\"reason\":\"Cần bổ sung\"}";

        review("/request-supplementation", body, as("STAFF_EXECUTOR"))
                .andExpect(status().isForbidden());

        review("/request-supplementation", body, as("VAULT_OWNER"))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        post(URL + "/request-supplementation", CASE_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void requestSupplementation_mapsNotFoundAndConflictErrors()
            throws Exception {
        when(legalBasisReviewService.requestSupplementationByCasePublicId(
                eq(CASE_ID), eq(20L), eq("reason")))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .thenThrow(new BusinessException(
                        ErrorCode.BASIS_DOSSIER_INVALID_STATE));

        review(
                "/request-supplementation",
                "{\"reason\":\"reason\"}",
                legal())
                .andExpect(status().isNotFound());

        review(
                "/request-supplementation",
                "{\"reason\":\"reason\"}",
                legal())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("BASIS_DOSSIER_INVALID_STATE"));
    }
    private static String reviewBody(String reason) {
        return "{\"reason\":\""+reason+"\",\"versionNo\":1,\"sha256Hash\":\""+"a".repeat(64)+"\",\"allocationHash\":\""+"b".repeat(64)+"\",\"disputeStatus\":\"DISPUTED\"}";
    }

}
