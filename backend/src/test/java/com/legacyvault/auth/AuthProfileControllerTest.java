package com.legacyvault.auth;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;

@WebMvcTest(AuthController.class)
@WebContractTestConfig
class AuthProfileControllerTest {
	@Autowired MockMvc mvc;
	@MockitoBean AuthService authService;
	@MockitoBean GoogleAuthService googleAuthService;
	@MockitoBean JwtService jwtService;
	@MockitoBean UserRepository users;
	@MockitoBean UserRoleRepository roles;

	@Test
	void patchAcceptsCredentialFieldsOnlyWithReauthenticationProof() throws Exception {
		mvc.perform(patch("/api/v1/auth/me").with(user("owner"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"new@example.test\",\"currentPassword\":\"CurrentPass123\"}"))
			.andExpect(status().isOk());
		mvc.perform(patch("/api/v1/auth/me").with(user("owner"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"NewPassword123\",\"currentPassword\":\"CurrentPass123\"}"))
			.andExpect(status().isOk());
		verify(authService, org.mockito.Mockito.times(2)).updateCurrentUser(any(), any());
	}

	@Test
	void patchRejectsUnknownAndInternalFieldsWithMalformedRequestContract() throws Exception {
		for (String body : new String[] {
				"{\"id\":\"00000000-0000-0000-0000-000000000001\"}",
				"{\"roles\":[\"ADMIN\"]}",
				"{\"authVersion\":99}",
				"{\"password_login_enabled\":true}",
				"{\"phoneNumber\":\"0900000000\",\"unexpected\":true}",
				"{\"email\":"}) {
			mvc.perform(patch("/api/v1/auth/me").with(user("owner"))
					.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
		}
		verifyNoInteractions(authService);
	}

	@Test
	void patchReturnsValidationContractForMalformedEmail() throws Exception {
		mvc.perform(patch("/api/v1/auth/me").with(user("owner"))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"not-an-email\",\"currentPassword\":\"CurrentPass123\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors").isArray());
		verifyNoInteractions(authService);
	}
}
