package com.legacyvault.verification;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.legacyvault.asset.dto.CreateAssetRequest;
import com.legacyvault.asset.service.AssetService;
import com.legacyvault.auth.JwtService;

/**
 * PS-111 (D-API-40) on a real SQL Server: PATCH Asset re-verifies the login password inside the API, records failures
 * through the REQUIRES_NEW audit, and keeps the 404 -> 409 -> 403/429 order.
 */
class AssetUpdateReauthSqlServerTest extends HandoverCompletionSqlSupport {
	private static final String PASSWORD = "Owner-Reauth-Pass-1";

	record Owner(long id, UUID publicId, String email, String token, UUID vaultId, UUID assetId) { }

	private MockMvc mvc() {
		return MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
	}

	private Owner owner(String vaultStatus) {
		UUID pub = UUID.randomUUID();
		String email = pub + "@example.test";
		long id = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id VALUES(?,'Reauth Owner',?,?,'ACTIVE')",
				Long.class, pub.toString(), email, new BCryptPasswordEncoder().encode(PASSWORD));
		jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'", id);
		UUID vault = UUID.fromString(jdbc.queryForObject("INSERT dbo.vaults(owner_user_id,vault_name,status) OUTPUT inserted.public_id VALUES(?,'Reauth vault','ACTIVE')",
				String.class, id));
		UUID asset = context.getBean(AssetService.class)
				.createAsset(vault, id, new CreateAssetRequest("Original", "TEXT", null, "secret-v1")).id();
		if (!"ACTIVE".equals(vaultStatus)) jdbc.update("UPDATE dbo.vaults SET status=? WHERE public_id=?", vaultStatus, vault.toString());
		String token = context.getBean(JwtService.class).generateAccessToken(pub, email, List.of("ROLE_VAULT_OWNER"));
		return new Owner(id, pub, email, token, vault, asset);
	}

	private org.springframework.mock.web.MockHttpServletResponse patchAsset(Owner caller, Owner target, String body) throws Exception {
		return mvc().perform(patch("/api/v1/vaults/{v}/assets/{a}", target.vaultId(), target.assetId())
				.header("Authorization", "Bearer " + caller.token()).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse();
	}

	private String name(Owner o) {
		return jdbc.queryForObject("SELECT title FROM dbo.assets WHERE public_id=?", String.class, o.assetId().toString());
	}

	private int audit(Owner o, String action) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE actor_user_id=? AND action=?", Integer.class, o.id(), action);
	}

	@Test
	void correctPasswordUpdatesAndAuditsOnce_payloadReencrypted() throws Exception {
		Owner o = owner("ACTIVE");
		var ok = patchAsset(o, o, "{\"name\":\"Renamed\",\"payload\":\"secret-v2\",\"password\":\"" + PASSWORD + "\"}");
		assertEquals(200, ok.getStatus(), ok.getContentAsString());
		assertEquals("Renamed", name(o));
		assertEquals(1, audit(o, "ASSET_UPDATED"));
		assertEquals(0, audit(o, "REAUTH_FAILED"));
		assertFalse(ok.getContentAsString().contains(PASSWORD));
		var reveal = mvc().perform(post("/api/v1/vaults/{v}/assets/{a}/reveal", o.vaultId(), o.assetId())
				.header("Authorization", "Bearer " + o.token()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"" + PASSWORD + "\"}")).andReturn().getResponse();
		assertEquals(200, reveal.getStatus());
		assertTrue(reveal.getContentAsString().contains("secret-v2"));
	}

	@Test
	void wrongPasswordIsRejected_changesNothing_andFailureAuditSurvivesRollback() throws Exception {
		Owner o = owner("ACTIVE");
		var response = assertTimeoutPreemptively(Duration.ofSeconds(20),
				() -> patchAsset(o, o, "{\"name\":\"Hacked\",\"password\":\"wrong-password\"}"));
		assertEquals(403, response.getStatus());
		assertTrue(response.getContentAsString().contains("REAUTH_FAILED"));
		assertFalse(response.getContentAsString().contains("wrong-password"));
		assertEquals("Original", name(o));
		assertEquals(1, audit(o, "REAUTH_FAILED"));
		assertEquals(0, audit(o, "ASSET_UPDATED"));
	}

	@Test
	void sharedAttemptLimitBlocksEvenTheCorrectPassword() throws Exception {
		Owner o = owner("ACTIVE");
		for (int i = 0; i < 5; i++) assertEquals(403, patchAsset(o, o, "{\"name\":\"x\",\"password\":\"wrong-" + i + "\"}").getStatus());
		var blocked = patchAsset(o, o, "{\"name\":\"Renamed\",\"password\":\"" + PASSWORD + "\"}");
		assertEquals(429, blocked.getStatus());
		assertEquals("Original", name(o));
		// the limit is shared with reveal (same audit counter)
		var reveal = mvc().perform(post("/api/v1/vaults/{v}/assets/{a}/reveal", o.vaultId(), o.assetId())
				.header("Authorization", "Bearer " + o.token()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"" + PASSWORD + "\"}")).andReturn().getResponse();
		assertEquals(429, reveal.getStatus());
	}

	@Test
	void missingOrBlankPasswordIs400_andNotCountedAsFailure() throws Exception {
		Owner o = owner("ACTIVE");
		assertEquals(400, patchAsset(o, o, "{\"name\":\"x\"}").getStatus());
		assertEquals(400, patchAsset(o, o, "{\"name\":\"x\",\"password\":\"\"}").getStatus());
		assertEquals("Original", name(o));
		assertEquals(0, audit(o, "REAUTH_FAILED"));
	}

	@Test
	void strangerGets404BeforeAnyPasswordCheck_frozenVaultGets409BeforePasswordCheck() throws Exception {
		Owner victim = owner("ACTIVE");
		Owner stranger = owner("ACTIVE");
		var notFound = patchAsset(stranger, victim, "{\"name\":\"x\",\"password\":\"wrong-password\"}");
		assertEquals(404, notFound.getStatus());
		assertEquals(0, audit(stranger, "REAUTH_FAILED"));
		assertEquals(0, audit(victim, "REAUTH_FAILED"));

		Owner frozen = owner("GRACE_PERIOD");
		var conflict = patchAsset(frozen, frozen, "{\"name\":\"x\",\"password\":\"wrong-password\"}");
		assertEquals(409, conflict.getStatus());
		assertTrue(conflict.getContentAsString().contains("VAULT_NOT_EDITABLE"));
		assertEquals(0, audit(frozen, "REAUTH_FAILED"));
	}
}
