package com.legacyvault.verification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.verification.controller.HandoverDeliveryController;
import com.legacyvault.verification.dto.EligibleHandoverAssetResponse;
import com.legacyvault.verification.dto.HandoverItemResponse;
import com.legacyvault.verification.service.HandoverDeliveryService;

/** PS-64 / PS-65: HTTP contract of eligible-assets and deliveries. */
@WebMvcTest(controllers = HandoverDeliveryController.class)
@WebContractTestConfig
class HandoverDeliveryControllerTest {

    private static final CustomUserPrincipal STAFF = new CustomUserPrincipal(7L, UUID.randomUUID(), "staff@example.com");
    private static final UUID CASE_ID = UUID.fromString("6f1a4c2d-0000-4000-8000-000000000001");
    private static final UUID SESSION_ID = UUID.fromString("6f1a4c2d-0000-4000-8000-000000000002");
    private static final UUID RECIPIENT = UUID.fromString("6f1a4c2d-0000-4000-8000-000000000003");
    private static final UUID ASSET = UUID.fromString("6f1a4c2d-0000-4000-8000-000000000004");
    private static final String BASE = "/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}";

    @Autowired private MockMvc mvc;
    @MockitoBean private JwtService jwt;
    @MockitoBean private UserRepository users;
    @MockitoBean private UserRoleRepository roles;
    @MockitoBean private HandoverDeliveryService service;

    private static RequestPostProcessor as(String role) {
        return authentication(new UsernamePasswordAuthenticationToken(STAFF, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static String body(UUID recipient, String assets) {
        return "{\"recipientId\":" + (recipient == null ? "null" : "\"" + recipient + "\"") + ",\"assetIds\":" + assets + "}";
    }

    @Test
    void eligibleAssetsReturnsScopeForStaff() throws Exception {
        when(service.eligibleAssets(eq(CASE_ID), eq(SESSION_ID), eq(RECIPIENT), any())).thenReturn(
                List.of(new EligibleHandoverAssetResponse(ASSET, RECIPIENT, "note", "ELIGIBLE")));
        when(service.eligibleAssets(eq(CASE_ID), eq(SESSION_ID), isNull(), any())).thenReturn(List.of());

        mvc.perform(get(BASE + "/eligible-assets", CASE_ID, SESSION_ID).param("recipientId", RECIPIENT.toString())
                        .with(as("STAFF_EXECUTOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].assetId").value(ASSET.toString()))
                .andExpect(jsonPath("$[0].deliveryStatus").value("ELIGIBLE"));
        mvc.perform(get(BASE + "/eligible-assets", CASE_ID, SESSION_ID).with(as("STAFF_EXECUTOR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void deliverReturns201WithLocation() throws Exception {
        when(service.deliver(eq(CASE_ID), eq(SESSION_ID), any(), any())).thenReturn(List.of(new HandoverItemResponse(
                UUID.randomUUID(), SESSION_ID, ASSET, RECIPIENT, "DELIVERED", LocalDateTime.of(2026, 10, 18, 9, 0),
                STAFF.publicId())));

        mvc.perform(post(BASE + "/deliveries", CASE_ID, SESSION_ID).with(as("STAFF_EXECUTOR"))
                        .contentType(MediaType.APPLICATION_JSON).content(body(RECIPIENT, "[\"" + ASSET + "\"]")))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/v1/staff/verification-cases/" + CASE_ID
                        + "/handover-sessions/" + SESSION_ID + "/deliveries"))
                .andExpect(jsonPath("$[0].status").value("DELIVERED"))
                .andExpect(jsonPath("$[0].assetId").value(ASSET.toString()));
    }

    @Test
    void deliveriesListIsReadableByStaff() throws Exception {
        when(service.list(eq(CASE_ID), eq(SESSION_ID), any())).thenReturn(List.of());

        mvc.perform(get(BASE + "/deliveries", CASE_ID, SESSION_ID).with(as("STAFF_EXECUTOR")))
                .andExpect(status().isOk());
    }

    @Test
    void invalidBodiesNeverReachTheService() throws Exception {
        for (String json : List.of("{}", body(null, "[\"" + ASSET + "\"]"), body(RECIPIENT, "[]"),
                body(RECIPIENT, "[null]"), body(RECIPIENT, "[\"not-a-uuid\"]"),
                body(RECIPIENT, "[" + ("\"" + ASSET + "\",").repeat(100) + "\"" + ASSET + "\"]"))) {
            mvc.perform(post(BASE + "/deliveries", CASE_ID, SESSION_ID).with(as("STAFF_EXECUTOR"))
                    .contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test
    void onlyStaffExecutorMayCallAndAnonymousIsRejected() throws Exception {
        for (String role : List.of("VAULT_OWNER", "LEGAL_VERIFIER", "BENEFICIARY", "ADMIN")) {
            mvc.perform(get(BASE + "/eligible-assets", CASE_ID, SESSION_ID).with(as(role)))
                    .andExpect(status().isForbidden());
            mvc.perform(get(BASE + "/deliveries", CASE_ID, SESSION_ID).with(as(role)))
                    .andExpect(status().isForbidden());
            mvc.perform(post(BASE + "/deliveries", CASE_ID, SESSION_ID).with(as(role))
                    .contentType(MediaType.APPLICATION_JSON).content(body(RECIPIENT, "[\"" + ASSET + "\"]")))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(get(BASE + "/eligible-assets", CASE_ID, SESSION_ID)).andExpect(status().isUnauthorized());
        mvc.perform(post(BASE + "/deliveries", CASE_ID, SESSION_ID).contentType(MediaType.APPLICATION_JSON)
                .content(body(RECIPIENT, "[\"" + ASSET + "\"]"))).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void businessErrorsUseTheSharedEnvelope() throws Exception {
        when(service.deliver(eq(CASE_ID), eq(SESSION_ID), any(), any()))
                .thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .thenThrow(new BusinessException(ErrorCode.HANDOVER_VAULT_NOT_UNLOCKED))
                .thenThrow(new BusinessException(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE))
                .thenThrow(new BusinessException(ErrorCode.HANDOVER_ASSET_NOT_ELIGIBLE))
                .thenThrow(new BusinessException(ErrorCode.HANDOVER_ASSET_ALREADY_DELIVERED))
                .thenThrow(new BusinessException(ErrorCode.LEGAL_WORKFLOW_ON_HOLD))
                .thenThrow(new BusinessException(ErrorCode.LEGAL_DECISION_STALE));
        String json = body(RECIPIENT, "[\"" + ASSET + "\"]");
        String[] expected = { null, "HANDOVER_VAULT_NOT_UNLOCKED", "HANDOVER_RECIPIENT_NOT_ELIGIBLE",
                "HANDOVER_ASSET_NOT_ELIGIBLE", "HANDOVER_ASSET_ALREADY_DELIVERED", "LEGAL_WORKFLOW_ON_HOLD",
                "LEGAL_DECISION_STALE" };
        for (String code : expected) {
            var result = mvc.perform(post(BASE + "/deliveries", CASE_ID, SESSION_ID).with(as("STAFF_EXECUTOR"))
                    .contentType(MediaType.APPLICATION_JSON).content(json));
            if (code == null) {
                result.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
            } else {
                result.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(code));
            }
        }
    }

    @Test
    void malformedIdsAreBadRequests() throws Exception {
        mvc.perform(get("/api/v1/staff/verification-cases/not-a-uuid/handover-sessions/" + SESSION_ID
                + "/eligible-assets").with(as("STAFF_EXECUTOR"))).andExpect(status().isBadRequest());
        mvc.perform(get(BASE + "/eligible-assets", CASE_ID, SESSION_ID).param("recipientId", "x")
                .with(as("STAFF_EXECUTOR"))).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
