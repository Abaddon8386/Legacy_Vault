package com.legacyvault.verification.group;
import com.legacyvault.auth.JwtService;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated;
import static org.springframework.security.core.authority.AuthorityUtils.createAuthorityList;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
@WebMvcTest(controllers=GroupHandoverController.class)
@WebContractTestConfig
class GroupHandoverControllerTest {
 @Autowired MockMvc mvc;
 @MockitoBean JwtService jwt;
 @MockitoBean UserRepository users;
 @MockitoBean UserRoleRepository roles;
 @MockitoBean GroupHandoverService service;
 String staff="/api/v1/staff/verification-cases/"+UUID.randomUUID()+"/handover-sessions/"+UUID.randomUUID()+"/group-handover/attendance";
 String legal="/api/v1/legal-verifications/verification-cases/"+UUID.randomUUID()+"/handover-sessions/"+UUID.randomUUID()+"/group-handover/reopen-requests/"+UUID.randomUUID()+"/decision";
 org.springframework.test.web.servlet.request.RequestPostProcessor as(String role){
  return authentication(authenticated(new CustomUserPrincipal(7L,UUID.randomUUID(),"x@test.local"),null,createAuthorityList("ROLE_"+role)));
 }
 @Test void anonymousCannotRecordAttendance()throws Exception{
  mvc.perform(post(staff).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(service);
 }
 @Test void adminAndLegalCannotRecordStaffAttendance()throws Exception{
  for(String role:List.of("ADMIN","LEGAL_VERIFIER","BENEFICIARY")){
   mvc.perform(post(staff).with(as(role)).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
  }verifyNoInteractions(service);
 }
 @Test void staffCannotMakeLegalDecision()throws Exception{
  mvc.perform(post(legal).with(as("STAFF_EXECUTOR")).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content("{}")).andExpect(status().isForbidden());verifyNoInteractions(service);
 }
 @Test void staffMaySubmitAttendance()throws Exception{
  mvc.perform(post(staff).with(as("STAFF_EXECUTOR")).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content("{\"expectedRevision\":0,\"presentRecipientIds\":[],\"reason\":\"Missing\"}")).andExpect(status().isOk());
  verify(service).mutate(any(),any(),isNull(),any(),eq("ATTENDANCE"),any(),any(),eq(false));
 }
 @Test void legalMayDecideExistingStaffRequest()throws Exception{
  mvc.perform(post(legal).with(as("LEGAL_VERIFIER")).header("Idempotency-Key",UUID.randomUUID())
    .contentType("application/json").content("{\"expectedRevision\":2,\"decision\":\"APPROVE\",\"reason\":\"All recipients present\"}"))
    .andExpect(status().isOk());
  verify(service).mutate(any(),any(),any(),any(),eq("APPROVE"),any(),any(),eq(true));
 }
 @Test void outOfScopeCaseReturns404()throws Exception{
  when(service.mutate(any(),any(),any(),any(),any(),any(),any(),anyBoolean()))
    .thenThrow(new com.legacyvault.common.error.BusinessException(com.legacyvault.common.error.ErrorCode.RESOURCE_NOT_FOUND));
  mvc.perform(post(staff).with(as("STAFF_EXECUTOR")).header("Idempotency-Key",UUID.randomUUID())
    .contentType("application/json").content("{\"expectedRevision\":0,\"presentRecipientIds\":[],\"reason\":\"Missing\"}"))
    .andExpect(status().isNotFound());
 }}
