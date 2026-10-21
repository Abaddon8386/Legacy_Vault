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
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

/** PS-88: HTTP contract of GET /staff/verification-cases/{caseId}/beneficiaries. */
@WebMvcTest(StaffCaseBeneficiaryController.class)
@WebContractTestConfig
class StaffCaseBeneficiaryControllerTest {

	@Autowired MockMvc mvc;
	@MockitoBean JwtService jwt;
	@MockitoBean UserRepository users;
	@MockitoBean UserRoleRepository roles;
	@MockitoBean CounterBeneficiaryService service;

	final UUID caseId = UUID.randomUUID();
	final UUID beneficiaryId = UUID.randomUUID();
	final String base = "/api/v1/staff/verification-cases/" + caseId + "/beneficiaries";

	private CounterBeneficiaryDtos.Item item() {
		return new CounterBeneficiaryDtos.Item(beneficiaryId, caseId, "Nguyen Van A", "Con", "VERIFIED_AT_COUNTER",
				"NOT_CREATED", false, new CounterBeneficiaryDtos.InvitationSummary("NOT_ISSUED", null, 0),
				new CounterBeneficiaryDtos.CounterAttestationSummary(false, null, false),
				CounterBeneficiaryDtos.STEP_AWAITING_ACCOUNT_DECISION, new CounterBeneficiaryDtos.Actions(true, true, true, false));
	}

	@Test
	void staffReadsTheListWithNoStoreAndNoContactData() throws Exception {
		when(service.list(eq(caseId))).thenReturn(List.of(item()));

		mvc.perform(get(base).with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$[0].beneficiaryId").value(beneficiaryId.toString()))
				.andExpect(jsonPath("$[0].counterStep").value("AWAITING_ACCOUNT_DECISION"))
				.andExpect(jsonPath("$[0].invitation.state").value("NOT_ISSUED"))
				.andExpect(jsonPath("$[0].actions.canHandOverWithoutAccount").value(true))
				.andExpect(jsonPath("$[0].email").doesNotExist())
				.andExpect(jsonPath("$[0].phone").doesNotExist())
				.andExpect(jsonPath("$[0].code").doesNotExist());
	}

	@Test
	void staffReadsOneBeneficiary() throws Exception {
		when(service.get(eq(caseId), eq(beneficiaryId))).thenReturn(item());

		mvc.perform(get(base + "/" + beneficiaryId).with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.fullName").value("Nguyen Van A"));
	}

	@Test
	void otherRolesAreForbiddenAndAnonymousIsRejected() throws Exception {
		for (String role : List.of("VAULT_OWNER", "LEGAL_VERIFIER", "BENEFICIARY", "ADMIN")) {
			mvc.perform(get(base).with(user("x").roles(role))).andExpect(status().isForbidden());
			mvc.perform(get(base + "/" + beneficiaryId).with(user("x").roles(role))).andExpect(status().isForbidden());
		}
		mvc.perform(get(base)).andExpect(status().isUnauthorized());
		mvc.perform(get(base + "/" + beneficiaryId)).andExpect(status().isUnauthorized());
		verifyNoInteractions(service);
	}

	@Test
	void notFoundUsesTheSharedEnvelope() throws Exception {
		when(service.list(eq(caseId))).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		when(service.get(eq(caseId), eq(beneficiaryId))).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		mvc.perform(get(base).with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
		mvc.perform(get(base + "/" + beneficiaryId).with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
	}

	@Test
	void malformedIdsAreBadRequests() throws Exception {
		mvc.perform(get("/api/v1/staff/verification-cases/not-a-uuid/beneficiaries").with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isBadRequest());
		mvc.perform(get(base + "/not-a-uuid").with(user("staff").roles("STAFF_EXECUTOR")))
				.andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}
}
