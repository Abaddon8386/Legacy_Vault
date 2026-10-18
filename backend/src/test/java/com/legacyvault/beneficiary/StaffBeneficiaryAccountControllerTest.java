package com.legacyvault.beneficiary;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

/** PS-62 / PS-63: HTTP contract of /staff/beneficiaries/{id}/account-link and /account. */
@WebMvcTest(StaffBeneficiaryAccountController.class)
@WebContractTestConfig
class StaffBeneficiaryAccountControllerTest {

	@Autowired MockMvc mvc;
	@MockitoBean JwtService jwt;
	@MockitoBean UserRepository users;
	@MockitoBean UserRoleRepository roles;
	@MockitoBean BeneficiaryAccountService service;

	final UUID id = UUID.randomUUID();
	final UUID accountId = UUID.randomUUID();
	final String linkPath = "/api/v1/staff/beneficiaries/" + id + "/account-link";
	final String createPath = "/api/v1/staff/beneficiaries/" + id + "/account";
	final String linkBody = "{\"accountEmail\":\"benef@example.com\"}";
	final String createBody = "{\"email\":\"new@example.com\",\"password\":\"S3cret-pass\",\"phone\":\"0912345678\"}";

	private BeneficiaryAccountDtos.Response response() {
		return new BeneficiaryAccountDtos.Response(id, accountId, "ACCOUNT_CREATED", "VERIFIED_AT_COUNTER");
	}

	@Test
	void staffLinksExistingAccountWith200() throws Exception {
		when(service.link(eq(id), any())).thenReturn(response());

		mvc.perform(post(linkPath).with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(linkBody))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.beneficiaryId").value(id.toString()))
				.andExpect(jsonPath("$.accountId").value(accountId.toString()))
				.andExpect(jsonPath("$.accountStatus").value("ACCOUNT_CREATED"))
				.andExpect(jsonPath("$.password").doesNotExist())
				.andExpect(jsonPath("$.email").doesNotExist());
	}

	@Test
	void staffCreatesAccountWith201AndLocation() throws Exception {
		when(service.create(eq(id), any())).thenReturn(response());

		mvc.perform(post(createPath).with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(createBody))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", createPath))
				.andExpect(jsonPath("$.accountId").value(accountId.toString()))
				.andExpect(jsonPath("$.password").doesNotExist());
	}

	@Test
	void onlyStaffExecutorMayCallAndAnonymousIsRejected() throws Exception {
		for (String role : List.of("VAULT_OWNER", "LEGAL_VERIFIER", "BENEFICIARY", "ADMIN")) {
			mvc.perform(post(linkPath).with(user("other").roles(role))
					.contentType(MediaType.APPLICATION_JSON).content(linkBody)).andExpect(status().isForbidden());
			mvc.perform(post(createPath).with(user("other").roles(role))
					.contentType(MediaType.APPLICATION_JSON).content(createBody)).andExpect(status().isForbidden());
		}
		mvc.perform(post(linkPath).contentType(MediaType.APPLICATION_JSON).content(linkBody))
				.andExpect(status().isUnauthorized());
		mvc.perform(post(createPath).contentType(MediaType.APPLICATION_JSON).content(createBody))
				.andExpect(status().isUnauthorized());
		verifyNoInteractions(service);
	}

	@Test
	void invalidBodiesNeverReachTheService() throws Exception {
		for (String body : List.of("{}", "{\"accountEmail\":\"\"}", "{\"accountEmail\":\"not-an-email\"}",
				"{\"accountEmail\":\"" + "a".repeat(250) + "@x.com\"}")) {
			mvc.perform(post(linkPath).with(user("staff").roles("STAFF_EXECUTOR"))
					.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
		}
		for (String body : List.of("{}",
				createBody.replace("new@example.com", "bad"),
				createBody.replace("S3cret-pass", "short"),
				createBody.replace("S3cret-pass", "x".repeat(73)),
				createBody.replace("\"password\":\"S3cret-pass\",", ""),
				createBody.replace("0912345678", "abc"))) {
			mvc.perform(post(createPath).with(user("staff").roles("STAFF_EXECUTOR"))
					.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
		}
		verifyNoInteractions(service);
	}

	@Test
	void businessErrorsUseTheSharedEnvelope() throws Exception {
		when(service.link(eq(id), any()))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
				.thenThrow(new BusinessException(ErrorCode.BENEFICIARY_IDENTITY_NOT_VERIFIED))
				.thenThrow(new BusinessException(ErrorCode.BENEFICIARY_ACCOUNT_ALREADY_LINKED))
				.thenThrow(new BusinessException(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE));
		when(service.create(eq(id), any())).thenThrow(new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS));

		mvc.perform(post(linkPath).with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(linkBody))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
		mvc.perform(post(linkPath).with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(linkBody))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BENEFICIARY_IDENTITY_NOT_VERIFIED"));
		mvc.perform(post(linkPath).with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(linkBody))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BENEFICIARY_ACCOUNT_ALREADY_LINKED"));
		mvc.perform(post(linkPath).with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(linkBody))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BENEFICIARY_ACCOUNT_INELIGIBLE"));
		mvc.perform(post(createPath).with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(createBody))
				.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
	}

	@Test
	void malformedBeneficiaryIdIsABadRequest() throws Exception {
		mvc.perform(post("/api/v1/staff/beneficiaries/not-a-uuid/account-link")
				.with(user("staff").roles("STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(linkBody)).andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}
}
