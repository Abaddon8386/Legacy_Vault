package com.legacyvault.beneficiary;

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
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(IdentityVerificationController.class)
@WebContractTestConfig
class IdentityVerificationControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository roles;
    @MockitoBean IdentityVerificationService service;
    final UUID id = UUID.randomUUID();
    final String path = "/api/v1/staff/beneficiaries/" + id + "/identity-verifications";
    final String valid = "{\"documentType\":\"CCCD\",\"documentSuffix\":\"1234\",\"result\":\"MATCH\"}";

    @Test void staffCanAppendAndRead() throws Exception {
        UUID recordId = UUID.randomUUID();
        when(service.verify(eq(id), any())).thenReturn(new IdentityVerificationDtos.Response(recordId, id,
                IdentityVerificationDtos.DocumentType.CCCD,null,"1234",IdentityVerificationDtos.Result.MATCH,
                new IdentityVerificationDtos.Verifier(UUID.randomUUID(),"Staff"),"2026-10-17T00:00:00Z"));
        when(service.history(id)).thenReturn(List.of());
        mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR"))
                .contentType(MediaType.APPLICATION_JSON).content(valid)).andExpect(status().isCreated())
                .andExpect(header().string("Location",path+"/"+recordId))
                .andExpect(jsonPath("$.result").value("MATCH"));
        mvc.perform(get(path).with(user("staff").roles("STAFF_EXECUTOR")))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
    }
    @Test void bothMethodsRequireStaffRoleAndAuthentication() throws Exception {
        for (String role : List.of("VAULT_OWNER","LEGAL_VERIFIER")) {
            mvc.perform(post(path).with(user("other").roles(role)).contentType(MediaType.APPLICATION_JSON)
                    .content(valid)).andExpect(status().isForbidden());
            mvc.perform(get(path).with(user("other").roles(role))).andExpect(status().isForbidden());
        }
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(valid)).andExpect(status().isUnauthorized());
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void invalidDtoNeverReachesService() throws Exception {
        for (String body : List.of("{}",valid.replace("CCCD","BAD"),valid.replace("MATCH","BAD"),
                valid.replace("1234","123"),valid.replace("1234","12345"),valid.replace("1234","12-4"),
                valid.replace("\"result\":\"MATCH\"","\"result\":null"),
                valid.replace("\"documentType\":\"CCCD\",",""),
                valid.replace("}",",\"issuingAuthority\":\""+"x".repeat(151)+"\"}"))) {
            mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR"))
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }
    @Test void notFoundUsesSharedEnvelopeAndServerTrace() throws Exception {
        when(service.verify(eq(id),any())).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        when(service.history(id)).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        var response=mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR"))
                .contentType(MediaType.APPLICATION_JSON).content(valid)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
                .andExpect(jsonPath("$.traceId").isNotEmpty()).andReturn().getResponse();
        org.junit.jupiter.api.Assertions.assertTrue(response.getContentAsString().contains(response.getHeader("X-Trace-Id")));
        mvc.perform(get(path).with(user("staff").roles("STAFF_EXECUTOR")))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }
    @Test void notMatchReturnsCreatedWithUnchangedHistoryResult() throws Exception {
        when(service.verify(eq(id),any())).thenReturn(new IdentityVerificationDtos.Response(UUID.randomUUID(), id,
                IdentityVerificationDtos.DocumentType.CCCD, null, "1234", IdentityVerificationDtos.Result.NOT_MATCH,
                new IdentityVerificationDtos.Verifier(UUID.randomUUID(), "Staff"), "2026-10-17T00:00:00Z"));
        mvc.perform(post(path).with(user("staff").roles("STAFF_EXECUTOR"))
                .contentType(MediaType.APPLICATION_JSON).content(valid.replace("MATCH","NOT_MATCH")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.result").value("NOT_MATCH"));
    }
}
