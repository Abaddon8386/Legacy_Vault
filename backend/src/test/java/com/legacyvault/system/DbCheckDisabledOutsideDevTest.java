package com.legacyvault.system;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import com.legacyvault.common.support.WebContractTestConfig;

/** Không có profile "dev": endpoint chẩn đoán DB không tồn tại (404). */
@WebMvcTest(controllers = SystemController.class)
@WebContractTestConfig
class DbCheckDisabledOutsideDevTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void dbCheck_isNotAvailableWithoutDevProfile() throws Exception {
		mockMvc.perform(get("/api/v1/system/db-check"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
	}
}
