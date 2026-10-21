package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.auth.JwtService;

/**
 * PS-92 (D-API-42) on a real SQL Server with the DEFAULT configuration (no quota flag passed): BASIC limits are enforced,
 * wills occupy asset slots, concurrent creates cannot exceed the limit, and Owners already over the limit stay usable.
 */
class QuotaDefaultEnforcementSqlServerTest extends HandoverCompletionSqlSupport {
	private static final String PASSWORD = "Quota-Owner-Pass-1";
	private static final byte[] PDF = "%PDF-1.4\nQuota will fixture\n%%EOF".getBytes(StandardCharsets.UTF_8);
	private static final ObjectMapper JSON = new ObjectMapper();

	record Owner(long id, UUID vaultPublicId, String token) { }

	private MockMvc mvc() {
		return MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
	}

	private Owner owner() {
		UUID pub = UUID.randomUUID();
		String email = pub + "@example.test";
		long id = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Quota Owner',?,?,'ACTIVE')",
				Long.class, pub.toString(), email, new BCryptPasswordEncoder().encode(PASSWORD));
		jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'", id);
		UUID vault = UUID.fromString(jdbc.queryForObject("INSERT dbo.vaults(owner_user_id,vault_name,status) OUTPUT inserted.public_id VALUES(?,'Quota vault','ACTIVE')",
				String.class, id));
		return new Owner(id, vault, context.getBean(JwtService.class).generateAccessToken(pub, email, List.of("ROLE_VAULT_OWNER")));
	}

	private int createAsset(Owner o, String name) throws Exception {
		return mvc().perform(post("/api/v1/vaults/{v}/assets", o.vaultPublicId()).header("Authorization", "Bearer " + o.token())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"" + name + "\",\"assetType\":\"TEXT\",\"payload\":\"secret\"}")).andReturn().getResponse().getStatus();
	}

	private String createAssetBody(Owner o, String name) throws Exception {
		return mvc().perform(post("/api/v1/vaults/{v}/assets", o.vaultPublicId()).header("Authorization", "Bearer " + o.token())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"" + name + "\",\"assetType\":\"TEXT\",\"payload\":\"secret\"}")).andReturn().getResponse().getContentAsString();
	}

	private org.springframework.mock.web.MockHttpServletResponse uploadWill(Owner o) throws Exception {
		return mvc().perform(multipart("/api/v1/vaults/{v}/wills", o.vaultPublicId())
				.file(new MockMultipartFile("file", "will.pdf", "application/pdf", PDF))
				.header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
	}

	private JsonNode usage(Owner o) throws Exception {
		var response = mvc().perform(get("/api/v1/subscriptions/me").header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return JSON.readTree(response.getContentAsString());
	}

	private int assetRows(Owner o) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.assets a JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.owner_user_id=?", Integer.class, o.id());
	}

	@Test
	void sixthAssetIsRejectedByDefault_andTheUsageEndpointExplainsTheCount() throws Exception {
		Owner o = owner();
		for (int i = 1; i <= 5; i++) assertEquals(201, createAsset(o, "Asset " + i), "asset " + i);
		var sixth = mvc().perform(post("/api/v1/vaults/{v}/assets", o.vaultPublicId()).header("Authorization", "Bearer " + o.token())
				.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Asset 6\",\"assetType\":\"TEXT\",\"payload\":\"x\"}")).andReturn().getResponse();
		assertEquals(409, sixth.getStatus());
		assertTrue(sixth.getContentAsString().contains("ASSET_QUOTA_EXCEEDED"));
		assertEquals(5, assetRows(o));
		JsonNode usage = usage(o).get("usage");
		assertEquals(5, usage.get("assetCount").asInt());
		assertEquals(0, usage.get("willCount").asInt());
		assertEquals(5, usage.get("assetOnlyCount").asInt());
		assertFalse(usage(o).get("overQuota").get("assets").asBoolean());
	}

	@Test
	void aWillOccupiesOneAssetSlot_butNewVersionsOfTheSameWillDoNot() throws Exception {
		Owner o = owner();
		var will = uploadWill(o);
		assertEquals(201, will.getStatus(), will.getContentAsString());
		String willId = JSON.readTree(will.getContentAsString()).get("id").asText();
		for (int i = 1; i <= 4; i++) assertEquals(201, createAsset(o, "Asset " + i));
		assertEquals(409, createAsset(o, "Asset 5"), "4 assets + 1 will already fill the 5 slots");
		assertEquals(409, uploadWill(o).getStatus(), "a second will needs a sixth slot");

		var version = mvc().perform(multipart("/api/v1/vaults/{v}/wills/{w}/versions", o.vaultPublicId(), willId)
				.file(new MockMultipartFile("file", "will-v2.pdf", "application/pdf", PDF))
				.header("Authorization", "Bearer " + o.token())).andReturn().getResponse();
		assertEquals(201, version.getStatus(), "a new version adds bytes, not a slot");

		JsonNode usage = usage(o).get("usage");
		assertEquals(5, usage.get("assetCount").asInt());
		assertEquals(1, usage.get("willCount").asInt());
		assertEquals(4, usage.get("assetOnlyCount").asInt());
	}

	@Test
	void concurrentCreatesCanNeverExceedTheLimit() throws Exception {
		Owner o = owner();
		int threads = 12;
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		for (int i = 0; i < threads; i++) {
			final int n = i;
			Callable<Integer> task = () -> { start.await(); return createAsset(o, "Race " + n); };
			results.add(pool.submit(task));
		}
		start.countDown();
		int created = 0, rejected = 0;
		for (Future<Integer> f : results) {
			int status = f.get(60, java.util.concurrent.TimeUnit.SECONDS);
			if (status == 201) created++; else if (status == 409) rejected++;
		}
		pool.shutdownNow();
		assertEquals(5, created);
		assertEquals(threads - 5, rejected);
		assertEquals(5, assetRows(o));
	}

	@Test
	void ownersAlreadyOverTheLimitCanStillReadAndEditWithoutGrowth_butCannotGrow() throws Exception {
		Owner o = owner();
		for (int i = 1; i <= 7; i++) {
			jdbc.update("INSERT dbo.assets(vault_id,asset_type,title) SELECT vault_id,'TEXT',? FROM dbo.vaults WHERE owner_user_id=?", "Legacy " + i, o.id());
		}
		JsonNode current = usage(o);
		assertEquals(7, current.get("usage").get("assetCount").asInt());
		assertTrue(current.get("overQuota").get("assets").asBoolean());
		assertEquals(409, createAsset(o, "One more"));
		assertEquals(409, uploadWill(o).getStatus());

		String assetId = jdbc.queryForObject("SELECT TOP 1 CAST(a.public_id AS NVARCHAR(36)) FROM dbo.assets a JOIN dbo.vaults v ON v.vault_id=a.vault_id WHERE v.owner_user_id=? ORDER BY a.asset_id", String.class, o.id());
		var rename = mvc().perform(patch("/api/v1/vaults/{v}/assets/{a}", o.vaultPublicId(), assetId).header("Authorization", "Bearer " + o.token())
				.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Renamed\",\"password\":\"" + PASSWORD + "\"}")).andReturn().getResponse();
		assertEquals(200, rename.getStatus(), "editing without growth stays allowed for an over-quota Owner");
		assertEquals(7, assetRows(o));
	}
}
