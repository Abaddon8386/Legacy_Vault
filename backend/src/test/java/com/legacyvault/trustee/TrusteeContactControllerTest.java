package com.legacyvault.trustee;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(TrusteeContactController.class)
@WebContractTestConfig
class TrusteeContactControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository roles;
    @MockitoBean TrusteeContactService service;
    final UUID id = UUID.randomUUID();
    final String path = "/api/v1/staff/trustees/" + id + "/contact-outcomes";
    final String valid = "{\"channel\":\"PHONE\",\"outcome\":\"CONTACTED\",\"fallbackStatus\":\"NOT_REQUIRED\"}";

    @Test void staffCanAppendAndReadHistory() throws Exception {
        UUID recordId = UUID.randomUUID();
        when(service.record(eq(id), any())).thenReturn(new TrusteeContactDtos.RecordResponse(recordId, id,
                TrusteeContactDtos.Channel.PHONE, TrusteeContactDtos.Outcome.CONTACTED,
                TrusteeContactDtos.FallbackStatus.NOT_REQUIRED, null, "2026-10-17T00:00:00Z"));
        when(service.history(id)).thenReturn(List.of());
        mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR"))
                .contentType(MediaType.APPLICATION_JSON).content(valid)).andExpect(status().isCreated())
                .andExpect(header().string("Location", path + "/" + recordId));
        mvc.perform(get(path).with(user("staff").roles("STAFF_EXECUTOR")))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @Test void bothMethodsEnforceRoleAndAuthentication() throws Exception {
        for (String role : List.of("VAULT_OWNER", "LEGAL_VERIFIER")) {
            mvc.perform(post(path).with(user("other").roles(role)).contentType(MediaType.APPLICATION_JSON)
                    .content(valid)).andExpect(status().isForbidden());
            mvc.perform(get(path).with(user("other").roles(role))).andExpect(status().isForbidden());
        }
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(valid)).andExpect(status().isUnauthorized());
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test void invalidFieldsNeverReachService() throws Exception {
        for (String body : List.of("{}", valid.replace("PHONE", "BAD"), valid.replace("CONTACTED", "BAD"),
                valid.replace("NOT_REQUIRED", "BAD"), valid.replace("}", ",\"note\":\"" + "x".repeat(501) + "\"}"),
                valid.replace("\"channel\":\"PHONE\",", ""), valid.replace("\"outcome\":\"CONTACTED\",", ""))) {
            mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR"))
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test void hiddenTargetHasShared404EnvelopeAndMatchingTrace() throws Exception {
        when(service.record(eq(id), any())).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        when(service.history(id)).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        String trace = UUID.randomUUID().toString();
        var response = mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR")).header("X-Trace-Id", trace)
                .contentType(MediaType.APPLICATION_JSON).content(valid)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
                .andExpect(jsonPath("$.traceId").isNotEmpty()).andExpect(header().exists("X-Trace-Id"))
                .andReturn().getResponse();
        org.junit.jupiter.api.Assertions.assertTrue(response.getContentAsString()
                .contains(response.getHeader("X-Trace-Id")));
        mvc.perform(get(path).with(user("staff").roles("STAFF_EXECUTOR")))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }
}
