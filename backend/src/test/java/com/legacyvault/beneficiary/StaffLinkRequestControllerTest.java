package com.legacyvault.beneficiary;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

/** BE-01: authorization, validation and the retired legacy routes. */
@WebMvcTest(controllers = { StaffLinkRequestController.class, StaffBeneficiaryAccountController.class })
@WebContractTestConfig
class StaffLinkRequestControllerTest {

	@Autowired MockMvc mvc;
	@MockitoBean JwtService jwt;
	@MockitoBean UserRepository users;
	@MockitoBean UserRoleRepository roles;
	@MockitoBean StaffLinkRequestService linkRequests;
	@MockitoBean StaffAccountProvisioningService provisioning;
	@MockitoBean BeneficiaryAccountService legacyService;

	final UUID caseId = UUID.randomUUID();
	final UUID requestId = UUID.randomUUID();
	final UUID beneficiaryId = UUID.randomUUID();
	final String base = "/api/v1/staff/verification-cases/" + caseId;

	@Test
	void legacyEmailLinkAndCreateAndLinkRoutesAreRetiredByDefault() throws Exception {
		mvc.perform(post("/api/v1/staff/beneficiaries/" + beneficiaryId + "/account-link")
				.with(user("staff").roles("STAFF_EXECUTOR")).contentType(MediaType.APPLICATION_JSON)
				.content("{\"accountEmail\":\"benef@example.com\"}"))
				.andExpect(status().isGone()).andExpect(jsonPath("$.code").value("BENEFICIARY_LEGACY_LINK_DISABLED"));
		mvc.perform(post("/api/v1/staff/beneficiaries/" + beneficiaryId + "/account")
				.with(user("staff").roles("STAFF_EXECUTOR")).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"new@example.com\",\"password\":\"S3cret-pass\"}"))
				.andExpect(status().isGone());
		verifyNoInteractions(legacyService);
	}

	@Test
	void onlyStaffExecutorCanUseTheCounterRoutes() throws Exception {
		for (String role : List.of("VAULT_OWNER", "BENEFICIARY", "LEGAL_VERIFIER", "ADMIN")) {
			mvc.perform(get(base + "/link-requests").with(user("u").roles(role))).andExpect(status().isForbidden());
			mvc.perform(post(base + "/link-requests/" + requestId + "/approve").with(user("u").roles(role))
					.contentType(MediaType.APPLICATION_JSON).content("{\"beneficiaryId\":\"" + beneficiaryId + "\"}"))
					.andExpect(status().isForbidden());
			mvc.perform(post(base + "/link-requests/" + requestId + "/reject").with(user("u").roles(role)))
					.andExpect(status().isForbidden());
		}
		verifyNoInteractions(linkRequests, provisioning);
	}

	@Test
	void approveTakesOnlyTheRecipientFromTheBodyAndIgnoresAnyAccountHint() throws Exception {
		mvc.perform(post(base + "/link-requests/" + requestId + "/approve").with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"beneficiaryId\":\"" + beneficiaryId + "\",\"accountId\":\"" + UUID.randomUUID()
						+ "\",\"email\":\"attacker@example.com\"}"))
				.andExpect(status().isOk());

		verify(linkRequests).approve(eq(caseId), eq(requestId), eq(beneficiaryId));
	}

	@Test
	void approveRequiresARecipient() throws Exception {
		mvc.perform(post(base + "/link-requests/" + requestId + "/approve").with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
		verifyNoInteractions(linkRequests);
	}

	@Test
	void createAccountValidatesBodyAndReturns201() throws Exception {
		for (String body : List.of("{}", "{\"email\":\"bad\",\"fullName\":\"A\",\"password\":\"Counter-pass1\"}",
				"{\"email\":\"a@b.com\",\"fullName\":\"A\",\"password\":\"short\"}",
				"{\"email\":\"a@b.com\",\"password\":\"Counter-pass1\"}")) {
			mvc.perform(post(base + "/accounts").with(user("staff").roles("STAFF_EXECUTOR"))
					.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
		}
		verifyNoInteractions(provisioning);

		when(provisioning.createUnlinked(eq(caseId), any()))
				.thenReturn(new BeneficiaryLinkRequestDtos.CreatedAccount(UUID.randomUUID(), "UNLINKED"));
		mvc.perform(post(base + "/accounts").with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"a@b.com\",\"fullName\":\"A\",\"password\":\"Counter-pass1\"}"))
				.andExpect(status().isCreated()).andExpect(jsonPath("$.linkStatus").value("UNLINKED"));
	}
}
