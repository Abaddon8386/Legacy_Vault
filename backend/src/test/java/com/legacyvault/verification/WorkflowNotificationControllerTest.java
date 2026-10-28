package com.legacyvault.verification;
import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.verification.controller.WorkflowNotificationController;
import com.legacyvault.verification.service.WorkflowNotificationService;
import com.legacyvault.common.error.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@WebMvcTest(controllers=WorkflowNotificationController.class)
@WebContractTestConfig
class WorkflowNotificationControllerTest {
 @Autowired MockMvc mvc;
 @MockitoBean JwtService jwtService;
 @MockitoBean UserRepository users;
 @MockitoBean UserRoleRepository roles;
 @MockitoBean WorkflowNotificationService service;
 private final UUID id=UUID.randomUUID();
 private RequestPostProcessor as(String role){return authentication(new UsernamePasswordAuthenticationToken(new CustomUserPrincipal(20L,id,"test@example.test"),null,List.of(new SimpleGrantedAuthority("ROLE_"+role))));}
 @Test void authenticatedWorkspaceAndNoStore() throws Exception {
  for(String workspace:List.of("LEGAL","STAFF")){
   String role=workspace.equals("LEGAL")?"LEGAL_VERIFIER":"STAFF_EXECUTOR";
   when(service.list(20L,workspace)).thenReturn(List.of(new WorkflowNotificationService.Item(id,id,"HS-2026-000001","LEGAL_BASIS_REVIEW_REQUIRED","Cần bản đầy đủ",Instant.parse("2026-10-28T00:00:00Z"),false)));
   mvc.perform(get("/api/v1/workflow-notifications").param("workspace",workspace).with(as(role))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$[0].reason").value("Cần bản đầy đủ"));
   mvc.perform(put("/api/v1/workflow-notifications/{id}/read",id).param("workspace",workspace).with(as(role))).andExpect(status().isOk()).andExpect(jsonPath("$.read").value(true));
   verify(service).read(20L,workspace,id);
  }
 }
 @Test void wrongRolesAndCrossWorkspaceCannotReadOrAcknowledge() throws Exception {
  for(String workspace:List.of("LEGAL","STAFF"))for(String role:List.of("ADMIN","BENEFICIARY","VAULT_OWNER",workspace.equals("LEGAL")?"STAFF_EXECUTOR":"LEGAL_VERIFIER")){
   mvc.perform(get("/api/v1/workflow-notifications").param("workspace",workspace).with(as(role))).andExpect(status().isForbidden());
   mvc.perform(put("/api/v1/workflow-notifications/{id}/read",id).param("workspace",workspace).with(as(role))).andExpect(status().isForbidden());
  }
  verifyNoInteractions(service);
 }
 @Test void anonymousCannotRead() throws Exception {mvc.perform(get("/api/v1/workflow-notifications").param("workspace","LEGAL")).andExpect(status().isUnauthorized());verifyNoInteractions(service);}
 @Test void scopedMissingNotificationCannotBeAcknowledged() throws Exception {
  doThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND)).when(service).read(20L,"STAFF",id);
  mvc.perform(put("/api/v1/workflow-notifications/{id}/read",id).param("workspace","STAFF").with(as("STAFF_EXECUTOR"))).andExpect(status().isNotFound());
 }
}
