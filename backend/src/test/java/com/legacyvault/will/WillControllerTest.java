package com.legacyvault.will;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.will.controller.WillController;
import com.legacyvault.will.dto.WillResponse;
import com.legacyvault.will.dto.WillVersionResponse;
import com.legacyvault.will.service.WillFileDownload;
import com.legacyvault.will.service.WillService;

/** PS-17/PS-18: hợp đồng HTTP của /vaults/{vaultId}/wills (multipart, mã lỗi, không trả nội dung file). */
@WebMvcTest(controllers = WillController.class)
@WebContractTestConfig
class WillControllerTest {

	private static final CustomUserPrincipal OWNER = new CustomUserPrincipal(1L, UUID.randomUUID(), "user@example.com");
	private static final UUID VAULT_ID = UUID.fromString("9c1f0b6e-1d2a-4b3c-8d4e-5f6a7b8c9d0e");
	private static final UUID WILL_ID = UUID.fromString("5d6e7f80-1a2b-4c3d-8e9f-0a1b2c3d4e5f");
	private static final String SHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
	private static final byte[] PDF = "%PDF-1.7\nnoi dung bi mat".getBytes(StandardCharsets.US_ASCII);
	private static final WillVersionResponse V1 = new WillVersionResponse(1, "di-chuc.pdf", "application/pdf",
			482_113, SHA, Instant.parse("2026-10-08T10:00:00Z"));
	private static final WillResponse WILL = new WillResponse(WILL_ID, VAULT_ID, "UPLOADED", V1,
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
	private WillService willService;

	private static RequestPostProcessor as(CustomUserPrincipal user, String role) {
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	private static RequestPostProcessor owner() {
		return as(OWNER, "VAULT_OWNER");
	}

	private static MockMultipartFile pdfPart() {
		return new MockMultipartFile("file", "di-chuc.pdf", "application/pdf", PDF);
	}

	// ---------- PS-17: POST /wills ----------

	@Test
	void upload_returns201WithLocation_statusUploaded_andNoFileContent() throws Exception {
		when(willService.uploadWill(eq(VAULT_ID), eq(OWNER.userId()), any(), eq("Bản scan"))).thenReturn(WILL);

		MvcResult result = mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills", VAULT_ID)
				.file(pdfPart()).param("note", "Bản scan").with(owner()))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", "/api/v1/vaults/" + VAULT_ID + "/wills/" + WILL_ID))
				.andExpect(jsonPath("$.id").value(WILL_ID.toString()))
				.andExpect(jsonPath("$.status").value("UPLOADED"))
				.andExpect(jsonPath("$.currentVersion.version").value(1))
				.andExpect(jsonPath("$.currentVersion.sha256").value(SHA))
				.andExpect(jsonPath("$.currentVersion.sizeBytes").value(482_113))
				.andExpect(jsonPath("$.currentVersion.uploadedAt").value("2026-10-08T10:00:00Z"))
				.andReturn();

		assertThat(result.getResponse().getContentAsString())
				.doesNotContain("noi dung bi mat", "LEGAL_APPROVED", "encrypted");
		ArgumentCaptor<MultipartFile> file = ArgumentCaptor.forClass(MultipartFile.class);
		verify(willService).uploadWill(eq(VAULT_ID), eq(OWNER.userId()), file.capture(), eq("Bản scan"));
		assertThat(file.getValue().getBytes()).isEqualTo(PDF);
	}

	@Test
	void upload_withoutNote_passesNull() throws Exception {
		when(willService.uploadWill(eq(VAULT_ID), eq(OWNER.userId()), any(), isNull())).thenReturn(WILL);

		mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills", VAULT_ID).file(pdfPart()).with(owner()))
				.andExpect(status().isCreated());
	}

	@Test
	void upload_noteOver500_returns400() throws Exception {
		mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills", VAULT_ID).file(pdfPart())
				.param("note", "a".repeat(501)).with(owner()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		verifyNoInteractions(willService);
	}

	@Test
	void upload_serviceErrors_mapToContractCodes() throws Exception {
		for (ErrorCode code : List.of(ErrorCode.VALIDATION_FAILED, ErrorCode.PAYLOAD_TOO_LARGE,
				ErrorCode.UNSUPPORTED_MEDIA_TYPE, ErrorCode.VAULT_NOT_EDITABLE, ErrorCode.RESOURCE_NOT_FOUND)) {
			when(willService.uploadWill(eq(VAULT_ID), eq(OWNER.userId()), any(), any()))
					.thenThrow(new BusinessException(code));

			mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills", VAULT_ID).file(pdfPart()).with(owner()))
					.andExpect(status().is(code.status()))
					.andExpect(jsonPath("$.code").value(code.name()));
		}
	}

	@Test
	void upload_withoutLogin_401_wrongRole_403() throws Exception {
		mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills", VAULT_ID).file(pdfPart()))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills", VAULT_ID).file(pdfPart())
				.with(as(OWNER, "LEGAL_VERIFIER")))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
		verifyNoInteractions(willService);
	}

	@Test
	void upload_asJson_isRejectedAs415() throws Exception {
		mockMvc.perform(post("/api/v1/vaults/{vaultId}/wills", VAULT_ID).with(owner())
				.contentType("application/json").content("{}"))
				.andExpect(status().isUnsupportedMediaType())
				.andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
	}

	// ---------- PS-18: POST /wills/{willId}/versions ----------

	@Test
	void addVersion_returns201WithNewVersion() throws Exception {
		WillResponse v2 = new WillResponse(WILL_ID, VAULT_ID, "UPLOADED", new WillVersionResponse(2, "v2.pdf",
				"application/pdf", 10, "a".repeat(64), Instant.parse("2026-10-09T10:00:00Z")),
				Instant.parse("2026-10-08T10:00:00Z"));
		when(willService.addVersion(eq(VAULT_ID), eq(WILL_ID), eq(OWNER.userId()), any())).thenReturn(v2);

		mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills/{willId}/versions", VAULT_ID, WILL_ID)
				.file(pdfPart()).with(owner()))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", "/api/v1/vaults/" + VAULT_ID + "/wills/" + WILL_ID))
				.andExpect(jsonPath("$.currentVersion.version").value(2))
				.andExpect(jsonPath("$.status").value("UPLOADED"));
	}

	@Test
	void addVersion_otherUsersWill_404_frozenVault_409() throws Exception {
		when(willService.addVersion(eq(VAULT_ID), eq(WILL_ID), eq(2L), any()))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		when(willService.addVersion(eq(VAULT_ID), eq(WILL_ID), eq(OWNER.userId()), any()))
				.thenThrow(new BusinessException(ErrorCode.VAULT_NOT_EDITABLE));

		mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills/{willId}/versions", VAULT_ID, WILL_ID)
				.file(pdfPart()).with(as(new CustomUserPrincipal(2L, UUID.randomUUID(), "user@example.com"), "VAULT_OWNER")))
				.andExpect(status().isNotFound());
		mockMvc.perform(multipart("/api/v1/vaults/{vaultId}/wills/{willId}/versions", VAULT_ID, WILL_ID)
				.file(pdfPart()).with(owner()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("VAULT_NOT_EDITABLE"));
	}

	// ---------- đọc ----------

	@Test
	void list_get_versions_returnMetadataOnly() throws Exception {
		when(willService.listWills(VAULT_ID, OWNER.userId(), 0, 20))
				.thenReturn(new PageResponse<>(List.of(WILL), 0, 20, 1, 1));
		when(willService.getWill(VAULT_ID, WILL_ID, OWNER.userId())).thenReturn(WILL);
		when(willService.listVersions(VAULT_ID, WILL_ID, OWNER.userId())).thenReturn(List.of(
				new WillVersionResponse(2, "v2.pdf", "application/pdf", 10, "b".repeat(64),
						Instant.parse("2026-10-09T10:00:00Z")),
				V1));

		mockMvc.perform(get("/api/v1/vaults/{vaultId}/wills", VAULT_ID).with(owner()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(WILL_ID.toString()))
				.andExpect(jsonPath("$.totalElements").value(1));
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/wills/{willId}", VAULT_ID, WILL_ID).with(owner()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.currentVersion.sha256").value(SHA));
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/wills/{willId}/versions", VAULT_ID, WILL_ID).with(owner()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].version").value(2))
				.andExpect(jsonPath("$[1].version").value(1))
				.andExpect(jsonPath("$[1].sha256").value(SHA));
	}

	@Test
	void reads_otherUsers404_noLogin401_badId400() throws Exception {
		when(willService.getWill(VAULT_ID, WILL_ID, 2L)).thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		mockMvc.perform(get("/api/v1/vaults/{vaultId}/wills/{willId}", VAULT_ID, WILL_ID)
				.with(as(new CustomUserPrincipal(2L, UUID.randomUUID(), "user@example.com"), "VAULT_OWNER")))
				.andExpect(status().isNotFound());
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/wills", VAULT_ID))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(get("/api/v1/vaults/{vaultId}/wills/{willId}/versions", VAULT_ID, "x").with(owner()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
	}

	// ---------- D-API-33: POST .../versions/{version}/download ----------

	private static String pw(String value) {
		return "{\"password\":\"" + value + "\"}";
	}

	private ResultActions download(int version, String body, RequestPostProcessor who) throws Exception {
		return mockMvc.perform(post("/api/v1/vaults/{vaultId}/wills/{willId}/versions/{version}/download", VAULT_ID,
				WILL_ID, version).with(who).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	@Test
	void download_returnsBytesAsAttachment_noStore_nosniff() throws Exception {
		when(willService.openVersion(VAULT_ID, WILL_ID, 1, OWNER.userId(), "MatKhau@123"))
				.thenReturn(new WillFileDownload(PDF, "application/pdf", "di chúc.pdf", SHA));

		MvcResult result = download(1, pw("MatKhau@123"), owner())
				.andExpect(status().isOk())
				.andExpect(header().string("Content-Type", "application/pdf"))
				.andExpect(header().string("X-Content-Type-Options", "nosniff"))
				.andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
				.andExpect(header().string("Content-Length", String.valueOf(PDF.length)))
				.andReturn();

		assertThat(result.getResponse().getContentAsByteArray()).isEqualTo(PDF);
		assertThat(result.getResponse().getHeader("Content-Disposition")).startsWith("attachment")
				.contains("filename*=UTF-8");
	}

	@Test
	void download_badBody_orBadVersion_returns400_withoutCallingService() throws Exception {
		download(1, "{}", owner()).andExpect(status().isBadRequest());
		download(1, pw("a".repeat(73)), owner()).andExpect(status().isBadRequest());
		download(0, pw("x"), owner()).andExpect(status().isBadRequest());
		verifyNoInteractions(willService);
	}

	@Test
	void download_mapsWrongPassword403_lockout429_frozen409_otherUsers404_wrongRole403_noLogin401() throws Exception {
		when(willService.openVersion(eq(VAULT_ID), eq(WILL_ID), eq(1), eq(OWNER.userId()), eq("sai")))
				.thenThrow(new BusinessException(ErrorCode.REAUTH_FAILED));
		when(willService.openVersion(eq(VAULT_ID), eq(WILL_ID), eq(1), eq(OWNER.userId()), eq("khoa")))
				.thenThrow(new BusinessException(ErrorCode.TOO_MANY_ATTEMPTS));
		when(willService.openVersion(eq(VAULT_ID), eq(WILL_ID), eq(1), eq(OWNER.userId()), eq("dong-bang")))
				.thenThrow(new BusinessException(ErrorCode.VAULT_NOT_EDITABLE));
		when(willService.openVersion(eq(VAULT_ID), eq(WILL_ID), eq(1), eq(2L), any()))
				.thenThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		download(1, pw("sai"), owner()).andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("REAUTH_FAILED"));
		download(1, pw("khoa"), owner()).andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
		download(1, pw("dong-bang"), owner()).andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("VAULT_NOT_EDITABLE"));
		download(1, pw("x"), as(new CustomUserPrincipal(2L, UUID.randomUUID(), "user@example.com"), "VAULT_OWNER"))
				.andExpect(status().isNotFound());
		download(1, pw("x"), as(OWNER, "BENEFICIARY")).andExpect(status().isForbidden());
		mockMvc.perform(post("/api/v1/vaults/{vaultId}/wills/{willId}/versions/{version}/download", VAULT_ID, WILL_ID, 1)
				.contentType(MediaType.APPLICATION_JSON).content(pw("x")))
				.andExpect(status().isUnauthorized());
	}
}
