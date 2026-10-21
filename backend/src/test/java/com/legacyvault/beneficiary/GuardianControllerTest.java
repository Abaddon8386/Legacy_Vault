package com.legacyvault.beneficiary;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(GuardianController.class)
@WebContractTestConfig
class GuardianControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean GuardianService service;
    @MockitoBean com.legacyvault.auth.JwtService jwtService;
    @MockitoBean com.legacyvault.user.repository.UserRepository users;
    @MockitoBean com.legacyvault.user.repository.UserRoleRepository roles;
    String path="/api/v1/vaults/"+UUID.randomUUID()+"/beneficiaries/"+UUID.randomUUID()+"/guardian";
    private org.springframework.test.web.servlet.request.RequestPostProcessor role(String role) {
        return authentication(new UsernamePasswordAuthenticationToken(new CustomUserPrincipal(1L,UUID.randomUUID(),"fixture@example.test"),
                null,List.of(new SimpleGrantedAuthority(role))));
    }
    @Test void unauthenticatedAndStaffCannotRead() throws Exception {
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(get(path).with(role("ROLE_STAFF_EXECUTOR"))).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
    @Test void ownerReadAndInvalidWrites() throws Exception {
        mvc.perform(get(path).with(role("ROLE_VAULT_OWNER"))).andExpect(status().isOk());
        mvc.perform(put(path).with(role("ROLE_VAULT_OWNER")).contentType("application/json")
                .content("{\"expectedRevision\":0,\"fullName\":\"Name\",\"relationship\":\"Parent\",\"email\":\"not-email\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(path+"/revoke").with(role("ROLE_VAULT_OWNER")).contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get(path+"/history?size=101").with(role("ROLE_VAULT_OWNER"))).andExpect(status().isBadRequest());
        verify(service).read(any(),any()); verifyNoMoreInteractions(service);
    }
}
