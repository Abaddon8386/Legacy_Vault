package com.legacyvault.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.system.SystemController;

/** CORS chỉ cho origin dev được khai báo; origin lạ không nhận header Access-Control-Allow-Origin. */
@WebMvcTest(controllers = SystemController.class)
@WebContractTestConfig
@TestPropertySource(properties = "legacyvault.cors.allowed-origins=http://localhost:5173")
class CorsTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void allowedDevOrigin_getsCorsHeader() throws Exception {
		mockMvc.perform(get("/api/v1/system/ping").header("Origin", "http://localhost:5173"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
	}

	@Test
	void preflightFromAllowedOrigin_isAccepted() throws Exception {
		mockMvc.perform(options("/api/v1/vaults")
				.header("Origin", "http://localhost:5173")
				.header("Access-Control-Request-Method", "POST")
				.header("Access-Control-Request-Headers", "authorization,content-type"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
	}

	@Test
	void unknownOrigin_isRejected() throws Exception {
		mockMvc.perform(get("/api/v1/system/ping").header("Origin", "http://evil.example"))
				.andExpect(status().isForbidden())
				.andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
	}
}
