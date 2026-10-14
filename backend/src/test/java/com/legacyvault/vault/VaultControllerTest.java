package com.legacyvault.vault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.controller.VaultController;
import com.legacyvault.vault.dto.VaultResponse;
import com.legacyvault.vault.service.VaultService;

/** PS-14: hợp đồng HTTP của GET /vaults/{id} và GET /vaults (quyền, ownership, lỗi, hình dạng JSON). */
@WebMvcTest(controllers = VaultController.class)
@WebContractTestConfig
class VaultControllerTest {

	private static final CustomUserPrincipal OWNER = new CustomUserPrincipal(1L, UUID.randomUUID(),
			"owner@example.com");
	private static final UUID VAULT_ID = UUID.fromString("9c1f0b6e-1d2a-4b3c-8d4e-5f6a7b8c9d0e");
	private static final VaultResponse VAULT = new VaultResponse(VAULT_ID, "Kho di sản gia đình",
			"Tài sản số của gia đình", "ACTIVE", Instant.parse("2026-10-08T10:00:00Z"),
			Instant.parse("2026-10-08T11:00:00Z"));

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private VaultService vaultService;

	// JwtAuthenticationFilter (PS-11) nằm trong SecurityConfig nên @WebMvcTest cần các bean nó phụ thuộc.
	@MockitoBean
	private JwtService jwtService;

	@MockitoBean
	private UserRepository userRepository;

	@MockitoBean
	private UserRoleRepository userRoleRepository;

	private static RequestPostProcessor as(CustomUserPrincipal principal, String role) {
		return authentication(new UsernamePasswordAuthenticationToken(principal, null,
				List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	// ---------- GET /vaults/{vaultId} ----------

	@Test
	void owner_getsOwnVault() throws Exception {
		when(vaultService.getVault(VAULT_ID, OWNER)).thenReturn(VAULT);

		MvcResult result = mockMvc.perform(get("/api/v1/vaults/{id}", VAULT_ID).with(as(OWNER, "VAULT_OWNER")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(VAULT_ID.toString()))
				.andExpect(jsonPath("$.name").value("Kho di sản gia đình"))
				.andExpect(jsonPath("$.status").value("ACTIVE"))
				.andExpect(jsonPath("$.createdAt").value("2026-10-08T10:00:00Z"))
				.andExpect(jsonPath("$.updatedAt").value("2026-10-08T11:00:00Z"))
				.andReturn();

		// Không lộ khóa nội bộ hay chủ sở hữu (D-API-08).
		assertThat(result.getResponse().getContentAsString()).doesNotContain("ownerUserId", "vaultId", "ownerId");
	}

	@Test
	void otherUsersVault_returns404SameAsMissing() throws Exception {
		CustomUserPrincipal stranger = new CustomUserPrincipal(2L, UUID.randomUUID(), "stranger@example.com");
		when(vaultService.getVault(VAULT_ID, stranger))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		mockMvc.perform(get("/api/v1/vaults/{id}", VAULT_ID).with(as(stranger, "VAULT_OWNER")))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
	}

	@Test
	void ownerIdFromRequestIsIgnored_serviceGetsPrincipal() throws Exception {
		when(vaultService.getVault(VAULT_ID, OWNER)).thenReturn(VAULT);

		mockMvc.perform(get("/api/v1/vaults/{id}", VAULT_ID).param("ownerId", "999")
				.with(as(OWNER, "VAULT_OWNER")))
				.andExpect(status().isOk());

		verify(vaultService).getVault(VAULT_ID, OWNER);
	}

	@Test
	void malformedVaultId_returns400() throws Exception {
		mockMvc.perform(get("/api/v1/vaults/{id}", "not-a-uuid").with(as(OWNER, "VAULT_OWNER")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
	}

	@Test
	void withoutLogin_returns401() throws Exception {
		mockMvc.perform(get("/api/v1/vaults/{id}", VAULT_ID))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
		verifyNoInteractions(vaultService);
	}

	@Test
	void wrongRole_returns403() throws Exception {
		mockMvc.perform(get("/api/v1/vaults/{id}", VAULT_ID).with(as(OWNER, "STAFF_EXECUTOR")))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
		verifyNoInteractions(vaultService);
	}

	// ---------- GET /vaults ----------

	@Test
	void list_returnsPageEnvelopeOfOwnVaults() throws Exception {
		when(vaultService.listVaults(OWNER, 0, 20)).thenReturn(new PageResponse<>(List.of(VAULT), 0, 20, 1, 1));

		mockMvc.perform(get("/api/v1/vaults").with(as(OWNER, "VAULT_OWNER")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(VAULT_ID.toString()))
				.andExpect(jsonPath("$.page").value(0))
				.andExpect(jsonPath("$.size").value(20))
				.andExpect(jsonPath("$.totalElements").value(1))
				.andExpect(jsonPath("$.totalPages").value(1));
	}

	@Test
	void list_passesPagingParams() throws Exception {
		when(vaultService.listVaults(eq(OWNER), anyInt(), anyInt()))
				.thenReturn(new PageResponse<>(List.of(), 2, 50, 0, 0));

		mockMvc.perform(get("/api/v1/vaults").param("page", "2").param("size", "50")
				.with(as(OWNER, "VAULT_OWNER")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content").isEmpty());

		verify(vaultService).listVaults(OWNER, 2, 50);
	}

	@Test
	void list_badPaging_returns400() throws Exception {
		mockMvc.perform(get("/api/v1/vaults").param("size", "101").with(as(OWNER, "VAULT_OWNER")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		mockMvc.perform(get("/api/v1/vaults").param("page", "-1").with(as(OWNER, "VAULT_OWNER")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		verifyNoInteractions(vaultService);
	}

	@Test
	void list_withoutLogin_401_wrongRole_403() throws Exception {
		mockMvc.perform(get("/api/v1/vaults")).andExpect(status().isUnauthorized());
		mockMvc.perform(get("/api/v1/vaults").with(as(OWNER, "LEGAL_VERIFIER"))).andExpect(status().isForbidden());
		verify(vaultService, never()).listVaults(any(), anyInt(), anyInt());
	}
}
