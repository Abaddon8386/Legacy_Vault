package com.legacyvault.verification;
import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.*;
import com.legacyvault.verification.controller.BeneficiaryReconciliationController;
import com.legacyvault.verification.service.BeneficiaryReconciliationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.http.MediaType;
import java.util.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.Mockito.*;
@WebMvcTest(BeneficiaryReconciliationController.class)
@WebContractTestConfig
class BeneficiaryReconciliationControllerTest {
 @Autowired MockMvc mvc;
 @MockitoBean JwtService jwt;
 @MockitoBean UserRepository users;
 @MockitoBean UserRoleRepository roles;
 @MockitoBean BeneficiaryReconciliationService service;
 @MockitoBean com.legacyvault.verification.service.SignedReceiptService receipts;
 static final UUID CASE=UUID.randomUUID(),SESSION=UUID.randomUUID(),RECIPIENT=UUID.randomUUID();
 static final String BASE="/api/v1/staff/verification-cases/"+CASE+"/handover-sessions/"+SESSION;
 static org.springframework.test.web.servlet.request.RequestPostProcessor as(String role){
  return authentication(new UsernamePasswordAuthenticationToken(
   new CustomUserPrincipal(1L,UUID.randomUUID(),"staff@example.test"),null,
   List.of(new SimpleGrantedAuthority("ROLE_"+role))));
 }
 @Test void authenticationAndRoleRequiredOnBothRoutes()throws Exception{
  mvc.perform(get(BASE+"/beneficiary-confirmations")).andExpect(status().isUnauthorized());
  mvc.perform(post(BASE+"/beneficiaries/"+RECIPIENT+"/confirmation").contentType(MediaType.APPLICATION_JSON)
   .content("{\"receiptReference\":\"REF\"}")).andExpect(status().isUnauthorized());
  for(String role:List.of("VAULT_OWNER","BENEFICIARY","LEGAL_VERIFIER")){
   mvc.perform(get(BASE+"/beneficiary-confirmations").with(as(role))).andExpect(status().isForbidden());
   mvc.perform(multipart(BASE+"/beneficiaries/"+RECIPIENT+"/confirmation").file(new org.springframework.mock.web.MockMultipartFile("file","signed.pdf","application/pdf","%PDF-1.4".getBytes())).param("attested","true").with(as(role))
).andExpect(status().isForbidden());
  }
  verifyNoInteractions(service);
 }
 @Test void invalidReferenceNeverReachesUseCase()throws Exception{
  for(String body:List.of("{}","{\"receiptReference\":\"   \"}","{\"receiptReference\":\""+"x".repeat(201)+"\"}")){
   mvc.perform(post(BASE+"/beneficiaries/"+RECIPIENT+"/confirmation").with(as("STAFF_EXECUTOR"))
    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnsupportedMediaType());
  }
  verifyNoInteractions(service);
 }
 @Test void staffCanReadPendingCollection()throws Exception{
  when(service.list(eq(CASE),eq(SESSION),any())).thenReturn(List.of());
  mvc.perform(get(BASE+"/beneficiary-confirmations").with(as("STAFF_EXECUTOR")))
   .andExpect(status().isOk()).andExpect(content().json("[]"));
 }
}
