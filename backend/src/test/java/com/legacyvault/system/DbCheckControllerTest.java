package com.legacyvault.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.legacyvault.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.legacyvault.common.support.WebContractTestConfig;

/** Profile "dev": db-check tồn tại, trả UP/DOWN và không lộ lỗi SQL. */
@WebMvcTest(controllers = DbCheckController.class)
@WebContractTestConfig
@ActiveProfiles("dev")
class DbCheckControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private JdbcTemplate jdbcTemplate;

	@MockitoBean
	private JwtService jwtService;

	@Test
	void dbUp_returnsUp() throws Exception {
		when(jdbcTemplate.queryForObject(eq("SELECT 1"), eq(Integer.class))).thenReturn(1);

		mockMvc.perform(get("/api/v1/system/db-check"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.database").value("UP"));
	}

	@Test
	void dbDown_returnsDownWithoutSqlErrorDetails() throws Exception {
		when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class)))
				.thenThrow(new CannotGetJdbcConnectionException(
						"Login failed for user 'sa' on host DB-SERVER-01 database LegacyVault"));

		MvcResult result = mockMvc.perform(get("/api/v1/system/db-check"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.database").value("DOWN"))
				.andReturn();

		assertThat(result.getResponse().getContentAsString().toLowerCase())
				.doesNotContain("login failed", "'sa'", "db-server", "legacyvault", "exception");
	}
}
