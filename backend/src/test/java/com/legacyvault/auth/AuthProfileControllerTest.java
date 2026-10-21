package com.legacyvault.auth;

import static org.mockito.Mockito.verifyNoInteractions;
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
	void patchRejectsEmailAndPasswordBeforeCallingTheProfileService() throws Exception {
		for (String body : new String[] {
				"{\"email\":\"attacker@example.test\"}",
				"{\"password\":\"AttackerPass123\"}",
				"{\"fullName\":\"Allowed Name\",\"email\":\"attacker@example.test\"}",
				"{\"fullName\":\"Allowed Name\",\"password\":\"AttackerPass123\"}"}) {
			mvc.perform(patch("/api/v1/auth/me").with(user("owner"))
					.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
		}
		verifyNoInteractions(authService);
	}
}
