package com.legacyvault.beneficiary;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

@WebMvcTest(StaffInvitationEmailController.class)
@WebContractTestConfig
class StaffInvitationEmailControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository userRoles;
    @MockitoBean StaffInvitationEmailService service;

    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID BENEFICIARY_ID = UUID.randomUUID();
    private static final String PATH = "/api/v1/staff/verification-cases/" + CASE_ID
            + "/beneficiaries/" + BENEFICIARY_ID + "/invitation-email";

    @Test
    void assignedStaffEndpointOnlyAcceptsGenerationAndReturnsQueuedNotSent() throws Exception {
        when(service.request(CASE_ID, BENEFICIARY_ID, 1)).thenReturn(new InvitationEmailDtos.Queued(
                UUID.randomUUID(), UUID.randomUUID(), 2, "QUEUED", "DISABLED"));

        mvc.perform(post(PATH).with(user("staff").roles("STAFF_EXECUTOR"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedGeneration\":1}"))
                .andExpect(status().isAccepted()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.queueStatus").value("QUEUED"))
                .andExpect(jsonPath("$.transportStatus").value("DISABLED"))
                .andExpect(jsonPath("$.code").doesNotExist()).andExpect(jsonPath("$.email").doesNotExist());
        verify(service).request(CASE_ID, BENEFICIARY_ID, 1);
    }

    @Test
    void otherRolesAndAnonymousCannotRequestInvitationEmail() throws Exception {
        mvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content("{\"expectedGeneration\":1}"))
                .andExpect(status().isUnauthorized());
        for (String role : java.util.List.of("VAULT_OWNER", "BENEFICIARY", "LEGAL_VERIFIER", "ADMIN")) {
            mvc.perform(post(PATH).with(user("other").roles(role)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"expectedGeneration\":1}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }
}
