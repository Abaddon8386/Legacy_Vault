package com.legacyvault.verification;
import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.*;
import com.legacyvault.verification.controller.*;
import com.legacyvault.verification.service.*;
import com.legacyvault.common.error.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.Mockito.*;
@WebMvcTest({AssetCompletionController.class,BeneficiaryCompletionController.class,HandoverCompletionController.class,
 HandoverCloseController.class,HandoverArchiveController.class})
@WebContractTestConfig
class HandoverCompletionControllersTest {
 @Autowired MockMvc mvc;
 @MockitoBean JwtService jwt;
 @MockitoBean UserRepository users;
 @MockitoBean UserRoleRepository roles;
 @MockitoBean AssetCompletionService assets;
 @MockitoBean BeneficiaryCompletionService beneficiaries;
 @MockitoBean HandoverCompletionService completion;
 @MockitoBean HandoverCloseService close;
 @MockitoBean HandoverArchiveService archive;
 static final UUID CASE=UUID.randomUUID(),SESSION=UUID.randomUUID();
 static final String BASE="/api/v1/staff/verification-cases/"+CASE+"/handover-sessions/"+SESSION;
 static org.springframework.test.web.servlet.request.RequestPostProcessor as(String role){
  return authentication(new UsernamePasswordAuthenticationToken(
   new CustomUserPrincipal(1L,UUID.randomUUID(),"staff@example.test"),null,
   List.of(new SimpleGrantedAuthority("ROLE_"+role))));
 }
 @Test void everyCompletionReadRequiresStaff()throws Exception{
  for(String route:List.of("/asset-completion","/beneficiary-completion","/completion-progress")){
   mvc.perform(get(BASE+route)).andExpect(status().isUnauthorized());
   for(String role:List.of("VAULT_OWNER","BENEFICIARY","LEGAL_VERIFIER"))
    mvc.perform(get(BASE+route).with(as(role))).andExpect(status().isForbidden());
  }
  verifyNoInteractions(assets,beneficiaries,completion);
 }
 @Test void terminalWritesRequireStaffAndNeverReachServiceForWrongRole()throws Exception{
  for(String route:List.of("/close","/archive")){
   mvc.perform(post(BASE+route)).andExpect(status().isUnauthorized());
   for(String role:List.of("VAULT_OWNER","BENEFICIARY","LEGAL_VERIFIER"))
    mvc.perform(post(BASE+route).with(as(role))).andExpect(status().isForbidden());
  }
  verifyNoInteractions(close,archive);
 }
 @Test void pendingAndWrongOwnershipUseTypedErrors()throws Exception{
  when(close.close(eq(CASE),eq(SESSION),any())).thenThrow(new BusinessException(ErrorCode.HANDOVER_COMPLETION_PENDING));
  mvc.perform(post(BASE+"/close").with(as("STAFF_EXECUTOR"))).andExpect(status().isConflict())
   .andExpect(jsonPath("$.code").value("HANDOVER_COMPLETION_PENDING"));
  when(archive.archive(eq(CASE),eq(SESSION),any())).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
  mvc.perform(post(BASE+"/archive").with(as("STAFF_EXECUTOR"))).andExpect(status().isNotFound());
 }
 @Test void archiveSqlErrorsAreClassifiedByNumericCodeNotMessage()throws Exception{
  when(archive.archive(eq(CASE),eq(SESSION),any())).thenThrow(
   new org.springframework.dao.DataIntegrityViolationException("irrelevant",
    new java.sql.SQLException("not used for classification","S0001",51300)));
  mvc.perform(post(BASE+"/archive").with(as("STAFF_EXECUTOR"))).andExpect(status().isConflict())
   .andExpect(jsonPath("$.code").value("VAULT_NOT_EDITABLE"));
 }
}
