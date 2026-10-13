package com.legacyvault.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.legacyvault.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.legacyvault.common.support.TestSupportController;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.system.SystemController;

/** Kiểm tra hợp đồng lỗi chung: success / validation / 401 / 403 / lỗi nghiệp vụ / không lộ lỗi nội bộ / vi-en. */
@WebMvcTest(controllers = { SystemController.class, TestSupportController.class })
@WebContractTestConfig
class ErrorContractTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private JwtService jwtService;

	private static final String VALID_BODY = """
			{"name":"Nguyen Van A","email":"user@example.com","password":"ExamplePass123"}""";

	// ---------- success ----------

	@Test
	void ping_isPublicAndReturnsUp() throws Exception {
		mockMvc.perform(get("/api/v1/system/ping"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.service").value("legacyvault-backend"))
				.andExpect(header().exists("X-Trace-Id"));
	}

	@Test
	void validRequest_returns200() throws Exception {
		mockMvc.perform(post("/api/v1/test/validate").with(user("u"))
				.contentType(MediaType.APPLICATION_JSON).content(VALID_BODY))
				.andExpect(status().isOk());
	}

	// ---------- validation ----------

	@Test
	void invalidBody_returns400WithFieldErrors() throws Exception {
		mockMvc.perform(post("/api/v1/test/validate").with(user("u"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name":"","email":"not-an-email","password":"short"}"""))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.status").value(400))
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.messageKey").value("error.validation.failed"))
				.andExpect(jsonPath("$.path").value("/api/v1/test/validate"))
				.andExpect(jsonPath("$.traceId").isNotEmpty())
				.andExpect(jsonPath("$.errors[?(@.field=='name')].code").value("NOT_BLANK"))
				.andExpect(jsonPath("$.errors[?(@.field=='email')].code").value("EMAIL"))
				.andExpect(jsonPath("$.errors[?(@.field=='password')].code").value("SIZE"))
				.andExpect(jsonPath("$.errors[?(@.field=='password')].messageKey").value("validation.Size"));
	}

	@Test
	void malformedJson_returns400() throws Exception {
		mockMvc.perform(post("/api/v1/test/validate").with(user("u"))
				.contentType(MediaType.APPLICATION_JSON).content("{not json"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
	}

	// ---------- 401 / 403 dùng cùng error shape ----------

	@Test
	void privateEndpointWithoutLogin_returns401WithSharedShape() throws Exception {
		mockMvc.perform(get("/api/v1/test/private"))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Content-Type", org.hamcrest.Matchers.containsString("application/json")))
				.andExpect(jsonPath("$.status").value(401))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(jsonPath("$.messageKey").value("error.auth.unauthenticated"))
				.andExpect(jsonPath("$.path").value("/api/v1/test/private"))
				.andExpect(jsonPath("$.traceId").isNotEmpty())
				.andExpect(jsonPath("$.errors").isArray());
	}

	@Test
	void adminEndpointWithUserRole_returns403WithSharedShape() throws Exception {
		mockMvc.perform(get("/api/v1/test/admin").with(user("u").roles("VAULT_OWNER")))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.status").value(403))
				.andExpect(jsonPath("$.code").value("ACCESS_DENIED"))
				.andExpect(jsonPath("$.messageKey").value("error.auth.accessDenied"))
				.andExpect(jsonPath("$.traceId").isNotEmpty());
	}

	@Test
	void adminEndpointWithAdminRole_returns200() throws Exception {
		mockMvc.perform(get("/api/v1/test/admin").with(user("a").roles("ADMIN")))
				.andExpect(status().isOk());
	}

	// ---------- lỗi nghiệp vụ & lỗi bất ngờ ----------

	@Test
	void businessException_mapsToItsErrorCode() throws Exception {
		mockMvc.perform(get("/api/v1/test/business").with(user("u")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
	}

	@Test
	void unexpectedException_returns500WithoutLeakingInternals() throws Exception {
		MvcResult result = mockMvc.perform(get("/api/v1/test/boom").with(user("u")))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
				.andExpect(jsonPath("$.traceId").isNotEmpty())
				.andReturn();

		String body = result.getResponse().getContentAsString().toLowerCase();
		assertThat(body).doesNotContain("select", "secret_table", "hunter2", "illegalstateexception", "at com.");
		// traceId trong body trùng header để tra log.
		String traceHeader = result.getResponse().getHeader("X-Trace-Id");
		assertThat(body).contains(traceHeader);
	}

	@Test
	void unknownPath_returns404WithSharedShape() throws Exception {
		mockMvc.perform(get("/api/v1/does-not-exist").with(user("u")))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
	}

	@Test
	void wrongMethod_returns405WithSharedShape() throws Exception {
		mockMvc.perform(post("/api/v1/system/ping").with(user("u")))
				.andExpect(status().isMethodNotAllowed())
				.andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
	}

	// ---------- i18n vi/en + fallback ----------

	@Test
	void acceptLanguageEn_returnsEnglishMessageButSameCode() throws Exception {
		mockMvc.perform(get("/api/v1/test/private").header("Accept-Language", "en"))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(jsonPath("$.message").value("You must sign in to perform this action."));
	}

	@Test
	void acceptLanguageVi_returnsVietnameseMessage() throws Exception {
		mockMvc.perform(get("/api/v1/test/private").header("Accept-Language", "vi"))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(jsonPath("$.message").value("Bạn cần đăng nhập để thực hiện thao tác này."));
	}

	@Test
	void missingOrUnsupportedLanguage_fallsBackToVietnamese() throws Exception {
		mockMvc.perform(get("/api/v1/test/private"))
				.andExpect(jsonPath("$.message").value("Bạn cần đăng nhập để thực hiện thao tác này."));
		mockMvc.perform(get("/api/v1/test/private").header("Accept-Language", "fr"))
				.andExpect(jsonPath("$.message").value("Bạn cần đăng nhập để thực hiện thao tác này."));
	}

	@Test
	void validationMessagesAreLocalizedToo() throws Exception {
		mockMvc.perform(post("/api/v1/test/validate").with(user("u")).header("Accept-Language", "en")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name":"","email":"user@example.com","password":"ExamplePass123"}"""))
				.andExpect(jsonPath("$.errors[0].message").value("Must not be blank."));
	}
}
