package com.legacyvault.verification;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.verification.controller.HandoverSessionController;
import com.legacyvault.verification.dto.HandoverSessionResponse;
import com.legacyvault.verification.dto.HandoverSessionStatusRequest;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.service.HandoverSessionService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = HandoverSessionController.class)
@WebContractTestConfig
class HandoverSessionControllerTest {
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID SESSION_ID = UUID.randomUUID();
    private static final CustomUserPrincipal STAFF = new CustomUserPrincipal(33L, UUID.randomUUID(), "staff@example.test");
    private static final String URL = "/api/v1/staff/verification-cases/{caseId}/handover-sessions";

    @Autowired private MockMvc mvc;
    @MockitoBean private JwtService jwtService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private UserRoleRepository userRoleRepository;
    @MockitoBean private HandoverSessionService service;

    private RequestPostProcessor as(String role) {
        return authentication(authenticated(STAFF, null, createAuthorityList("ROLE_" + role)));
    }

    @Test
    void assignedStaffCanOpenSession() throws Exception {
        when(service.open(eq(CASE_ID), any())).thenReturn(response(HandoverSessionStatus.OPEN));

        mvc.perform(post(URL, CASE_ID).with(as("STAFF_EXECUTOR")))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", URL.replace("{caseId}", CASE_ID.toString()) + "/" + SESSION_ID))
                .andExpect(jsonPath("$.status").value("OPEN"));
        verify(service).open(eq(CASE_ID), any());
    }

    @Test
    void assignedStaffCanFilterHistoryAndUpdateStatus() throws Exception {
        when(service.list(CASE_ID, HandoverSessionStatus.OPEN, STAFF)).thenReturn(List.of(response(HandoverSessionStatus.OPEN)));
        mvc.perform(get(URL, CASE_ID).queryParam("status", "OPEN").with(as("STAFF_EXECUTOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("OPEN"));

        when(service.updateStatus(eq(CASE_ID), eq(SESSION_ID), any(HandoverSessionStatusRequest.class), any()))
                .thenReturn(response(HandoverSessionStatus.CANCELLED));
        mvc.perform(patch(URL + "/{sessionId}/status", CASE_ID, SESSION_ID)
                        .with(as("STAFF_EXECUTOR")).contentType("application/json")
                        .content("{\"status\":\"CANCELLED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        verify(service).updateStatus(eq(CASE_ID), eq(SESSION_ID), any(HandoverSessionStatusRequest.class), any());

        mvc.perform(patch(URL + "/{sessionId}/status", CASE_ID, SESSION_ID)
                        .with(as("STAFF_EXECUTOR")).contentType("application/json")
                        .content("{\"status\":\"COMPLETED\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nonStaffAndAnonymousRequestsAreRejected() throws Exception {
        mvc.perform(post(URL, CASE_ID).with(as("LEGAL_VERIFIER"))).andExpect(status().isForbidden());
        mvc.perform(post(URL, CASE_ID)).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void invalidStatusRequestIsRejectedByValidation() throws Exception {
        mvc.perform(patch(URL + "/{sessionId}/status", CASE_ID, SESSION_ID)
                        .with(as("STAFF_EXECUTOR")).contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    private HandoverSessionResponse response(HandoverSessionStatus status) {
        return new HandoverSessionResponse(SESSION_ID, CASE_ID, UUID.randomUUID(), STAFF.publicId(), status,
                LocalDateTime.parse("2026-10-18T10:00:00"),
                status == HandoverSessionStatus.OPEN ? null : LocalDateTime.parse("2026-10-18T11:00:00"));
    }
}
