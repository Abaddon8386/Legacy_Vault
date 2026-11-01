package com.legacyvault.verification.group;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** PS-122: role mapping and response headers of the read endpoints; the data itself is proven on SQL Server. */
@WebMvcTest(controllers = GroupHandoverReadController.class)
@WebContractTestConfig
class GroupHandoverReadControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository roles;
    @MockitoBean GroupHandoverReadService reads;
    @MockitoBean GroupHandoverService group;

    private static final String LIST = "/api/v1/legal-verifications/group-handover/reopen-requests";
    private static final String STATUS = "/api/v1/beneficiary-handover-status";
    private final String history = "/api/v1/staff/verification-cases/" + UUID.randomUUID() + "/handover-sessions/" + UUID.randomUUID()
            + "/group-handover/events";

    private static org.springframework.test.web.servlet.request.RequestPostProcessor as(String role) {
        return authentication(authenticated(new CustomUserPrincipal(7L, UUID.randomUUID(), "x@test.local"), null,
                createAuthorityList("ROLE_" + role)));
    }

    @Test
    void anonymousCannotReadAnything() throws Exception {
        mvc.perform(get(LIST)).andExpect(status().isUnauthorized());
        mvc.perform(get(STATUS)).andExpect(status().isUnauthorized());
        mvc.perform(get(history)).andExpect(status().isUnauthorized());
        verifyNoInteractions(reads, group);
    }

    @Test
    void onlyLegalMayListPendingRequests() throws Exception {
        for (String role : List.of("STAFF_EXECUTOR", "ADMIN", "BENEFICIARY", "VAULT_OWNER")) {
            mvc.perform(get(LIST).with(as(role))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(reads);
        when(reads.pendingForLegal(any(), any(), any(), eq(0), eq(20))).thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0));
        mvc.perform(get(LIST).with(as("LEGAL_VERIFIER"))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void onlyABeneficiaryMayReadTheirOwnStatusAndTheAccountComesFromThePrincipal() throws Exception {
        for (String role : List.of("STAFF_EXECUTOR", "LEGAL_VERIFIER", "ADMIN")) {
            mvc.perform(get(STATUS).with(as(role))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(reads);
        var subject = UUID.randomUUID();
        when(reads.beneficiaryStatus(any())).thenReturn(new GroupHandoverReadService.BeneficiaryStatus(subject, List.of()));
        // A caller-supplied account id is ignored: there is no such parameter.
        mvc.perform(get(STATUS + "?userId=1&accountId=" + UUID.randomUUID()).with(as("BENEFICIARY"))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.subjectId").value(subject.toString()));
        verify(reads).beneficiaryStatus(any());
    }

    @Test
    void historyIsStaffOrLegalOnlyWithTheRightFlag() throws Exception {
        for (String role : List.of("BENEFICIARY", "ADMIN", "LEGAL_VERIFIER")) {
            mvc.perform(get(history).with(as(role))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(group);
        when(group.history(any(), any(), any(), eq(false), eq(0), eq(20))).thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0));
        mvc.perform(get(history).with(as("STAFF_EXECUTOR"))).andExpect(status().isOk());
        String legalHistory = history.replace("/staff/", "/legal-verifications/");
        when(group.history(any(), any(), any(), eq(true), eq(0), eq(20))).thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0));
        mvc.perform(get(legalHistory).with(as("LEGAL_VERIFIER"))).andExpect(status().isOk());
        mvc.perform(get(legalHistory).with(as("STAFF_EXECUTOR"))).andExpect(status().isForbidden());
    }
}
