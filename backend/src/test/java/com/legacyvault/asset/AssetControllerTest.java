package com.legacyvault.asset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.legacyvault.asset.controller.AssetController;
import com.legacyvault.asset.dto.AssetResponse;
import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.dto.UpdateAssetRequest;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

/** PS-15: hợp đồng HTTP của POST/GET /vaults/{vaultId}/assets. */
@WebMvcTest(controllers = AssetController.class)
@WebContractTestConfig
@ExtendWith(OutputCaptureExtension.class)
class AssetControllerTest {

	private static final CustomUserPrincipal OWNER = new CustomUserPrincipal(1L, UUID.randomUUID(), "user@example.com");
	private static final UUID VAULT_ID = UUID.fromString("9c1f0b6e-1d2a-4b3c-8d4e-5f6a7b8c9d0e");
	private static final UUID ASSET_ID = UUID.fromString("1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");
	private static final String SECRET = "bi-mat-khong-duoc-lo-ra";
	private static final AssetResponse ASSET = new AssetResponse(ASSET_ID, VAULT_ID, "Mật khẩu email dự phòng",
			AssetType.CREDENTIAL, "Ghi chú", true, Instant.parse("2026-10-08T10:00:00Z"),
			Instant.parse("2026-10-08T10:00:00Z"));

	@Autowired
	private MockMvc mockMvc;

	// JwtAuthenticationFilter (PS-11) nằm trong SecurityConfig nên @WebMvcTest cần các bean nó phụ thuộc.
	@MockitoBean
	private JwtService jwtService;

	@MockitoBean
	private UserRepository userRepository;

	@MockitoBean
	private UserRoleRepository userRoleRepository;

	@MockitoBean
	private AssetService assetService;

	private static RequestPostProcessor owner() {
		return as(OWNER, "VAULT_OWNER");
	}

	private static RequestPostProcessor as(CustomUserPrincipal currentUser, String role) {
		return authentication(new UsernamePasswordAuthenticationToken(currentUser, null,
				List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private static String body(String name, String assetType, String payload) {
		return """
				{"name":%s,"assetType":%s,"description":"Ghi chú","payload":%s}"""
				.formatted(json(name), json(assetType), json(payload));
	}

	private static String json(String value) {
		return value == null ? "null" : "\"" + value + "\"";
	}

	// ---------- POST: thành công ----------

	@Test
	void create_returns201WithLocationAndNoPayload(CapturedOutput output) throws Exception {
		when(assetService.createAsset(eq(VAULT_ID), eq(OWNER.userId()), any())).thenReturn(ASSET);

		MvcResult result = mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner())
				.contentType(MediaType.APPLICATION_JSON).content(body("Mật khẩu email dự phòng", "CREDENTIAL", SECRET)))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", "/api/v1/vaults/" + VAULT_ID + "/assets/" + ASSET_ID))
				.andExpect(jsonPath("$.id").value(ASSET_ID.toString()))
				.andExpect(jsonPath("$.vaultId").value(VAULT_ID.toString()))
				.andExpect(jsonPath("$.assetType").value("CREDENTIAL"))
				.andExpect(jsonPath("$.hasPayload").value(true))
				.andExpect(jsonPath("$.payload").doesNotExist())
				.andReturn();

		assertThat(result.getResponse().getContentAsString()).doesNotContain(SECRET, "encrypted", "ownerUserId");
		assertThat(output.getAll()).doesNotContain(SECRET);
	}

	@Test
	void create_ignoresServerOwnedFieldsFromClient() throws Exception {
		when(assetService.createAsset(eq(VAULT_ID), eq(OWNER.userId()), any())).thenReturn(ASSET);

		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name":"Ghi chú","assetType":"TEXT","payload":"x",
						 "vaultId":"00000000-0000-0000-0000-000000000000","ownerId":999,"status":"UNLOCKED"}"""))
				.andExpect(status().isCreated());

		ArgumentCaptor<CreateAssetRequest> request = ArgumentCaptor.forClass(CreateAssetRequest.class);
		verify(assetService).createAsset(eq(VAULT_ID), eq(OWNER.userId()), request.capture());
		assertThat(request.getValue().name()).isEqualTo("Ghi chú");
		assertThat(request.getValue().toString()).doesNotContain("x]").contains("payload=***");
	}

	// ---------- POST: validation ----------

	@Test
	void create_blankName_missingPayload_returns400WithFieldErrors() throws Exception {
		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner())
				.contentType(MediaType.APPLICATION_JSON).content(body("", "TEXT", null)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.errors[?(@.field=='name')].code").value("NOT_BLANK"))
				.andExpect(jsonPath("$.errors[?(@.field=='payload')].code").value("NOT_BLANK"));
		verifyNoInteractions(assetService);
	}

	@Test
	void create_unknownOrFileType_returns400OnAssetType() throws Exception {
		for (String type : List.of("XYZ", "FILE", "DOCUMENT", "text")) {
			mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner())
					.header("Accept-Language", "en")
					.contentType(MediaType.APPLICATION_JSON).content(body("Ghi chú", type, SECRET)))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
					.andExpect(jsonPath("$.errors[?(@.field=='assetType')].messageKey").value("validation.assetType"))
					.andExpect(jsonPath("$.errors[?(@.field=='assetType')].message")
							.value("Invalid asset type (only TEXT or CREDENTIAL)."));
		}
		verifyNoInteractions(assetService);
	}

	@Test
	void create_nameTooLong_returns400() throws Exception {
		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner())
				.contentType(MediaType.APPLICATION_JSON).content(body("a".repeat(151), "TEXT", SECRET)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[?(@.field=='name')].code").value("SIZE"));
	}

	@Test
	void create_payloadOver64KbInUtf8Bytes_returns400() throws Exception {
		// 32 769 ký tự "ệ" (3 byte UTF-8) = 98 307 byte > 65 536, dù số ký tự < 65 536.
		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner())
				.contentType(MediaType.APPLICATION_JSON).content(body("Ghi chú", "TEXT", "ệ".repeat(32_769))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[?(@.field=='payload')].code").value("PAYLOAD_SIZE"))
				.andExpect(jsonPath("$.errors[?(@.field=='payload')].messageKey").value("validation.PayloadSize"));
		verifyNoInteractions(assetService);
	}

	@Test
	void create_payloadExactly64Kb_isAccepted() throws Exception {
		when(assetService.createAsset(eq(VAULT_ID), eq(OWNER.userId()), any())).thenReturn(ASSET);

		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner())
				.contentType(MediaType.APPLICATION_JSON).content(body("Ghi chú", "TEXT", "a".repeat(65_536))))
				.andExpect(status().isCreated());
	}

	// ---------- POST: quyền, ownership, trạng thái ----------

	@Test
	void create_withoutLogin_returns401_wrongRole_returns403() throws Exception {
		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID)
				.contentType(MediaType.APPLICATION_JSON).content(body("Ghi chú", "TEXT", SECRET)))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(as(OWNER, "STAFF_EXECUTOR"))
				.contentType(MediaType.APPLICATION_JSON).content(body("Ghi chú", "TEXT", SECRET)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
		verifyNoInteractions(assetService);
	}

	@Test
	void create_onOtherUsersVault_returns404() throws Exception {
		CustomUserPrincipal stranger = new CustomUserPrincipal(2L, UUID.randomUUID(), "user@example.com");
		when(assetService.createAsset(eq(VAULT_ID), eq(2L), any()))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(as(stranger, "VAULT_OWNER"))
				.contentType(MediaType.APPLICATION_JSON).content(body("Ghi chú", "TEXT", SECRET)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
	}

	@Test
	void create_onFrozenVault_returns409() throws Exception {
		when(assetService.createAsset(eq(VAULT_ID), eq(OWNER.userId()), any()))
				.thenThrow(new BusinessException(ErrorCode.VAULT_NOT_EDITABLE));

		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner())
				.contentType(MediaType.APPLICATION_JSON).content(body("Ghi chú", "TEXT", SECRET)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("VAULT_NOT_EDITABLE"))
				.andExpect(jsonPath("$.messageKey").value("error.vault.notEditable"));
	}

	@Test
	void create_malformedVaultId_returns400() throws Exception {
		mockMvc.perform(post("/api/v1/vaults/{vaultId}/assets", "abc").with(owner())
				.contentType(MediaType.APPLICATION_JSON).content(body("Ghi chú", "TEXT", SECRET)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
	}

	// ---------- GET danh sách ----------

	@Test
	void list_returnsPageEnvelopeWithoutPayload() throws Exception {
		when(assetService.listAssets(VAULT_ID, OWNER.userId(), 0, 20))
				.thenReturn(new PageResponse<>(List.of(ASSET), 0, 20, 1, 1));

		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets", VAULT_ID).with(owner()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(ASSET_ID.toString()))
				.andExpect(jsonPath("$.content[0].hasPayload").value(true))
				.andExpect(jsonPath("$.content[0].payload").doesNotExist())
				.andExpect(jsonPath("$.totalElements").value(1));
	}

	@Test
	void list_onOtherUsersVault_returns404_andBadPaging_returns400() throws Exception {
		when(assetService.listAssets(VAULT_ID, 2L, 0, 20))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets", VAULT_ID)
				.with(as(new CustomUserPrincipal(2L, UUID.randomUUID(), "user@example.com"), "VAULT_OWNER")))
				.andExpect(status().isNotFound());
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets", VAULT_ID).param("size", "0").with(owner()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
	}

	@Test
	void list_withoutLogin_returns401() throws Exception {
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets", VAULT_ID))
				.andExpect(status().isUnauthorized());
		verifyNoInteractions(assetService);
	}

	// ---------- PS-16: GET chi tiết ----------

	@Test
	void get_returnsAssetWithoutPayload() throws Exception {
		when(assetService.getAsset(VAULT_ID, ASSET_ID, OWNER.userId())).thenReturn(ASSET);

		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets/{assetId}", VAULT_ID, ASSET_ID).with(owner()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(ASSET_ID.toString()))
				.andExpect(jsonPath("$.hasPayload").value(true))
				.andExpect(jsonPath("$.payload").doesNotExist());
	}

	@Test
	void get_otherUsers404_wrongRole403_noLogin401_badId400() throws Exception {
		when(assetService.getAsset(VAULT_ID, ASSET_ID, 2L))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets/{assetId}", VAULT_ID, ASSET_ID)
				.with(as(new CustomUserPrincipal(2L, UUID.randomUUID(), "user@example.com"), "VAULT_OWNER")))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets/{assetId}", VAULT_ID, ASSET_ID)
				.with(as(OWNER, "ADMIN")))
				.andExpect(status().isForbidden());
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets/{assetId}", VAULT_ID, ASSET_ID))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/assets/{assetId}", VAULT_ID, "not-a-uuid").with(owner()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
	}

	// ---------- PS-16: PATCH ----------

	private ResultActions patchAsset(String json, RequestPostProcessor who) throws Exception {
		return mockMvc.perform(patch("/api/v1/vaults/{vaultId}/assets/{assetId}", VAULT_ID, ASSET_ID).with(who)
				.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	@Test
	void patch_updatesAndIgnoresImmutableFields(CapturedOutput output) throws Exception {
		when(assetService.updateAsset(eq(VAULT_ID), eq(ASSET_ID), eq(OWNER.userId()), any())).thenReturn(ASSET);

		patchAsset("""
				{"description":"Mô tả mới","payload":"%s","assetType":"TEXT","vaultId":"%s","id":"%s"}"""
				.formatted(SECRET, UUID.randomUUID(), UUID.randomUUID()), owner())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.assetType").value("CREDENTIAL"))
				.andExpect(jsonPath("$.payload").doesNotExist());

		ArgumentCaptor<UpdateAssetRequest> request = ArgumentCaptor.forClass(UpdateAssetRequest.class);
		verify(assetService).updateAsset(eq(VAULT_ID), eq(ASSET_ID), eq(OWNER.userId()), request.capture());
		assertThat(request.getValue().name()).isNull();
		assertThat(request.getValue().description()).isEqualTo("Mô tả mới");
		assertThat(request.getValue().toString()).doesNotContain(SECRET);
		assertThat(output.getAll()).doesNotContain(SECRET);
	}

	@Test
	void patch_emptyBodyOrOnlyIgnoredFields_returns400() throws Exception {
		for (String json : List.of("{}", "{\"assetType\":\"TEXT\"}", "{\"name\":null}")) {
			patchAsset(json, owner())
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
					.andExpect(jsonPath("$.errors[0].messageKey").value("validation.atLeastOneField"));
		}
		verifyNoInteractions(assetService);
	}

	@Test
	void patch_blankNameOrPayload_orTooLong_returns400() throws Exception {
		patchAsset("{\"name\":\"   \",\"payload\":\"\"}", owner())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[?(@.field=='name')].code").value("NULL_OR_NOT_BLANK"))
				.andExpect(jsonPath("$.errors[?(@.field=='payload')].code").value("NULL_OR_NOT_BLANK"));
		patchAsset("{\"description\":\"%s\"}".formatted("a".repeat(1001)), owner())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[?(@.field=='description')].code").value("SIZE"));
		patchAsset("{\"payload\":\"%s\"}".formatted("a".repeat(65_537)), owner())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[?(@.field=='payload')].code").value("PAYLOAD_SIZE"));
		verifyNoInteractions(assetService);
	}

	@Test
	void patch_frozenVault409_otherUsers404_wrongRole403_noLogin401() throws Exception {
		when(assetService.updateAsset(eq(VAULT_ID), eq(ASSET_ID), eq(OWNER.userId()), any()))
				.thenThrow(new BusinessException(ErrorCode.VAULT_NOT_EDITABLE));
		when(assetService.updateAsset(eq(VAULT_ID), eq(ASSET_ID), eq(2L), any()))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		patchAsset("{\"name\":\"x\"}", owner())
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("VAULT_NOT_EDITABLE"));
		patchAsset("{\"name\":\"x\"}", as(new CustomUserPrincipal(2L, UUID.randomUUID(), "user@example.com"), "VAULT_OWNER"))
				.andExpect(status().isNotFound());
		patchAsset("{\"name\":\"x\"}", as(OWNER, "BENEFICIARY"))
				.andExpect(status().isForbidden());
		mockMvc.perform(patch("/api/v1/vaults/{vaultId}/assets/{assetId}", VAULT_ID, ASSET_ID)
				.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}"))
				.andExpect(status().isUnauthorized());
	}
}
