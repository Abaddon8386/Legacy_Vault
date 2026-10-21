package com.legacyvault.auth;

import com.legacyvault.auth.recovery.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PasswordRecoveryController.class)
@WebContractTestConfig
class PasswordRecoveryControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository roles;
    @MockitoBean RecoveryConfiguration config;
    @MockitoBean RecoveryRateLimiter limits;
    @MockitoBean PasswordRecoveryService service;
    static final String BASE="/api/v1/auth/password-recovery";
    @BeforeEach void ready() {
        when(config.ready()).thenReturn(true);
        when(limits.allow(anyString(),anyString(),anyInt(),anyInt())).thenReturn(true);
    }
    @Test void publicRequestNormalizesEmailAndReturnsOnlyNeutralReceipt() throws Exception {
        mvc.perform(post(BASE+"/requests").header("Authorization","Bearer expired")
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"USER@Example.test\",\"locale\":\"en\",\"redirectUrl\":\"https://evil.test\"}"))
                .andExpect(status().isAccepted()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(content().json("{\"messageKey\":\"auth.recovery.requestAccepted\"}"));
        verify(service).enqueue("user@example.test","en"); verifyNoInteractions(jwt,users,roles);
    }
    @Test void perEmailSuppressionIsIndistinguishableAndDoesNotEnqueue() throws Exception {
        when(limits.allow(eq("email-cooldown"),anyString(),anyInt(),anyInt())).thenReturn(false);
        mvc.perform(post(BASE+"/requests").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"unknown@example.test\"}"))
                .andExpect(status().isAccepted()).andExpect(content().json("{\"messageKey\":\"auth.recovery.requestAccepted\"}"));
        verifyNoInteractions(service);
    }
    @Test void ipThrottleReturnsRetryAfterAndInfrastructureFailsClosed() throws Exception {
        when(limits.allow(eq("request-ip"),anyString(),anyInt(),anyInt())).thenReturn(false);
        mvc.perform(post(BASE+"/requests").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"user@example.test\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","900"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        when(limits.allow(eq("request-ip"),anyString(),anyInt(),anyInt())).thenThrow(new IllegalStateException("private detail"));
        var response=mvc.perform(post(BASE+"/requests").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"user@example.test\"}"))
                .andExpect(status().isServiceUnavailable()).andReturn().getResponse();
        assertFalse(response.getContentAsString().contains("private detail")); verifyNoInteractions(service);
    }
    @Test void validatesWithoutEchoingPasswordOrCredentialAndDoesNotMutate() throws Exception {
        for(String body:java.util.List.of("{}","{\"credential\":\"secret-marker\",\"password\":\"short\"}",
                "{\"credential\":\"secret-marker\",\"password\":\""+"á".repeat(37)+"\"}")) {
            var r=mvc.perform(post(BASE+"/reset").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andReturn().getResponse();
            assertFalse(r.getContentAsString().contains("secret-marker")); assertFalse(r.getContentAsString().contains("short"));
        }
        mvc.perform(post(BASE+"/requests").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"bad\",\"locale\":\"fr\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service,limits);
    }
    @Test void resetUsesSharedLocalizedEnvelopeAndEmptySuccessWithoutIssuingLogin() throws Exception {
        doThrow(new BusinessException(ErrorCode.RECOVERY_INVALID)).when(service).reset("secret-marker","Valid-password-123");
        String body="{\"credential\":\"secret-marker\",\"password\":\"Valid-password-123\"}";
        for(String lang:java.util.List.of("vi","en")) {
            var r=mvc.perform(post(BASE+"/reset").header("Accept-Language",lang).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("RECOVERY_INVALID"))
                    .andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse();
            assertFalse(r.getContentAsString().contains("secret-marker"));
            assertTrue(r.getContentAsString().contains(lang.equals("en")?"The recovery link":"Liên kết khôi phục"));
        }
        doNothing().when(service).reset(anyString(),anyString());
        mvc.perform(post(BASE+"/reset").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        verifyNoInteractions(jwt,users,roles);
    }
}
