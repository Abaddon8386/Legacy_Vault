package com.legacyvault.beneficiary;

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
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

@WebMvcTest(StaffAssetCatalogController.class)
@WebContractTestConfig
class StaffAssetCatalogControllerTest {
	@Autowired MockMvc mvc;
	@MockitoBean JwtService jwt;
	@MockitoBean UserRepository users;
	@MockitoBean UserRoleRepository roles;
	@MockitoBean StaffAssetCatalogService service;

	private final UUID caseId = UUID.randomUUID();
	private String path() { return "/api/v1/staff/verification-cases/" + caseId + "/assets"; }

	@Test
	void staffReadsEmptyCatalogWithNoStoreAtTheDocumentedRoute() throws Exception {
		when(service.list(eq(caseId), eq(0), eq(20))).thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0));
		mvc.perform(get(path()).with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.content").isEmpty())
				.andExpect(jsonPath("$.totalElements").value(0));
	}

	@Test
	void onlyStaffRoleCanCallCatalog() throws Exception {
		for (String role : List.of("VAULT_OWNER", "LEGAL_VERIFIER", "BENEFICIARY", "ADMIN")) {
			mvc.perform(get(path()).with(user("x").roles(role))).andExpect(status().isForbidden());
		}
		mvc.perform(get(path())).andExpect(status().isUnauthorized());
		verifyNoInteractions(service);
	}

	@Test
	void paginationAndPathParametersAreValidated() throws Exception {
		mvc.perform(get(path() + "?page=-1").with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isBadRequest());
		mvc.perform(get(path() + "?size=101").with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/staff/verification-cases/not-a-uuid/assets")
					.with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}
}
