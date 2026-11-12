package com.legacyvault.trustee;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

/** HTTP contract of GET /staff/verification-cases/{caseId}/contacts. */
@WebMvcTest(CaseContactController.class)
@WebContractTestConfig
class CaseContactControllerTest {

	@Autowired MockMvc mvc;
	@MockitoBean JwtService jwt;
	@MockitoBean UserRepository users;
	@MockitoBean UserRoleRepository roles;
	@MockitoBean CaseContactService service;

	final UUID caseId = UUID.randomUUID();
	final UUID personId = UUID.randomUUID();
	final String url = "/api/v1/staff/verification-cases/" + caseId + "/contacts";

	@Test
	void staffReadsTheContactsWithNoStore() throws Exception {
		when(service.list(eq(caseId))).thenReturn(new CaseContactDtos.Response(caseId, List.of(
				new CaseContactDtos.Person("TRUSTEE", personId, "Duong Van Tam", "Em trai chu kho", "0903456789",
						"tam@example.com", true, List.of()))));

		mvc.perform(get(url).with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.caseId").value(caseId.toString()))
				.andExpect(jsonPath("$.people[0].kind").value("TRUSTEE"))
				.andExpect(jsonPath("$.people[0].phone").value("0903456789"))
				.andExpect(jsonPath("$.people[0].canRecord").value(true));
	}

	@Test
	void onlyStaffMayReadAndOthersNeverReachTheService() throws Exception {
		mvc.perform(get(url).with(user("owner").roles("OWNER"))).andExpect(status().isForbidden());
		mvc.perform(get(url)).andExpect(status().isUnauthorized());
		verifyNoInteractions(service);
	}

	@Test
	void aCaseOfAnotherStaffIsNotFound() throws Exception {
		when(service.list(eq(caseId))).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		mvc.perform(get(url).with(user("staff").roles("STAFF_EXECUTOR"))).andExpect(status().isNotFound());
	}
}
