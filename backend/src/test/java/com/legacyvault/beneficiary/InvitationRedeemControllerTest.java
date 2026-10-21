package com.legacyvault.beneficiary;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

@WebMvcTest(InvitationRedeemController.class)
@WebContractTestConfig
class InvitationRedeemControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository userRoles;
    @MockitoBean InvitationRedeemService service;

    private static final Long ACCOUNT_ID = 91L;
    private static final String CODE = "AbCdEfGhIjKlMnOpQrStVw";
    private static final String PATH = "/api/v1/auth/invitations/redeem";
    private final CustomUserPrincipal principal = new CustomUserPrincipal(ACCOUNT_ID, UUID.randomUUID(), "user@test.invalid");

    @Test
    void authenticatedRequestUsesPrincipalAndReturnsNoStore() throws Exception {
        var linked = new InvitationDtos.Linked(UUID.randomUUID(), principal.publicId(), "ACCOUNT_CREATED");
        when(service.redeem(ACCOUNT_ID, CODE)).thenReturn(linked);
        var auth = new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_BENEFICIARY")));

        mvc.perform(post(PATH).with(authentication(auth)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"" + CODE + "\",\"accountId\":1,\"role\":\"ROLE_ADMIN\",\"email\":\"attacker@test.invalid\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.beneficiaryId").value(linked.beneficiaryId().toString()))
                .andExpect(jsonPath("$.accountId").value(principal.publicId().toString()));
        verify(service).redeem(ACCOUNT_ID, CODE);
    }

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        mvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + CODE + "\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void unverifiedEmailUsesSharedLocalizedConflictError() throws Exception {
        when(service.redeem(ACCOUNT_ID, CODE))
                .thenThrow(new BusinessException(ErrorCode.BENEFICIARY_INVITATION_EMAIL_VERIFICATION_REQUIRED));
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of());

        mvc.perform(post(PATH).with(authentication(auth)).contentType(MediaType.APPLICATION_JSON)
                .header("Accept-Language", "en").content("{\"code\":\"" + CODE + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BENEFICIARY_INVITATION_EMAIL_VERIFICATION_REQUIRED"))
                .andExpect(jsonPath("$.messageKey").value("error.invitation.emailVerificationRequired"));
    }
}
