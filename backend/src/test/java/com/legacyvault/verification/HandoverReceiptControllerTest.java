package com.legacyvault.verification;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.verification.controller.HandoverReceiptController;
import com.legacyvault.verification.dto.HandoverReceiptResponse;
import com.legacyvault.verification.service.HandoverReceiptService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated;
import static org.springframework.security.core.authority.AuthorityUtils.createAuthorityList;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = HandoverReceiptController.class)
@WebContractTestConfig
class HandoverReceiptControllerTest {
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID SESSION_ID = UUID.randomUUID();
    private static final UUID RECEIPT_ID = UUID.randomUUID();
    private static final UUID RECIPIENT_ID = UUID.randomUUID();
    private static final UUID ASSET_ID = UUID.randomUUID();
    private static final CustomUserPrincipal STAFF = new CustomUserPrincipal(31L, UUID.randomUUID(), "staff@example.test");
    private static final String URL = "/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts";

    @Autowired private MockMvc mvc;
    @MockitoBean private JwtService jwtService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private UserRoleRepository userRoleRepository;
    @MockitoBean private HandoverReceiptService service;

    private RequestPostProcessor as(String role) {
        return authentication(authenticated(STAFF, null, createAuthorityList("ROLE_" + role)));
    }

    @Test
    void assignedStaffCanCreateAndRetrieveReceiptHistory() throws Exception {
        when(service.create(eq(CASE_ID), eq(SESSION_ID), any(), any())).thenReturn(response());
        mvc.perform(post(URL, CASE_ID, SESSION_ID).with(as("STAFF_EXECUTOR"))
                        .contentType("application/json")
                        .content("{\"recipientId\":\"" + RECIPIENT_ID + "\",\"assetIds\":[\"" + ASSET_ID + "\"]}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", URL.replace("{caseId}", CASE_ID.toString())
                        .replace("{sessionId}", SESSION_ID.toString()) + "/" + RECEIPT_ID))
                .andExpect(jsonPath("$.confirmationType").value("STAFF_ATTESTATION"))
                .andExpect(jsonPath("$.recipientId").value(RECIPIENT_ID.toString()))
                .andExpect(jsonPath("$.recipientName").value("Nguyen Van A"))
                .andExpect(jsonPath("$.assetIds[0]").value(ASSET_ID.toString()));
        verify(service).create(eq(CASE_ID), eq(SESSION_ID), any(), any());

        when(service.list(CASE_ID, SESSION_ID, STAFF)).thenReturn(List.of(response()));
        mvc.perform(get(URL, CASE_ID, SESSION_ID).with(as("STAFF_EXECUTOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].receiptId").value(RECEIPT_ID.toString()))
                .andExpect(jsonPath("$[0].recipientName").value("Nguyen Van A"));
    }

    @Test
    void wrongRoleAndAnonymousCannotCreateReceipt() throws Exception {
        mvc.perform(post(URL, CASE_ID, SESSION_ID).with(as("LEGAL_VERIFIER"))
                        .contentType("application/json")
                        .content("{\"recipientId\":\"" + RECIPIENT_ID + "\",\"assetIds\":[\"" + ASSET_ID + "\"]}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(URL, CASE_ID, SESSION_ID).contentType("application/json")
                        .content("{\"recipientId\":\"" + RECIPIENT_ID + "\",\"assetIds\":[\"" + ASSET_ID + "\"]}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void invalidReceiptRequestIsRejectedByValidation() throws Exception {
        mvc.perform(post(URL, CASE_ID, SESSION_ID).with(as("STAFF_EXECUTOR"))
                        .contentType("application/json").content("{\"recipientId\":null,\"assetIds\":[]}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    private HandoverReceiptResponse response() {
        return new HandoverReceiptResponse(RECEIPT_ID, SESSION_ID, RECIPIENT_ID, "Nguyen Van A", List.of(ASSET_ID), STAFF.publicId(),
                4, "a".repeat(64), "b".repeat(64), "STAFF_ATTESTATION",
                LocalDateTime.parse("2026-10-18T10:00:00"), null);
    }
}
