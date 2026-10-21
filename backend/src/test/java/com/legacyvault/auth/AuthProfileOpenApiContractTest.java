package com.legacyvault.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

class AuthProfileOpenApiContractTest {
	@Test
	void profilePatchContractOnlyAllowsNameAndPhoneAndDocumentsRejectedCredentialFields() throws Exception {
		Path file = Path.of("docs/api-contracts/openapi.yaml");
		if (!Files.exists(file)) file = Path.of("../docs/api-contracts/openapi.yaml");
		LoaderOptions options = new LoaderOptions();
		options.setAllowDuplicateKeys(false);
		Map<?, ?> root = new Yaml(new SafeConstructor(options)).load(Files.readString(file));
		Map<?, ?> paths = (Map<?, ?>) root.get("paths");
		Map<?, ?> authMe = (Map<?, ?>) paths.get("/api/v1/auth/me");
		Map<?, ?> patch = (Map<?, ?>) authMe.get("patch");
		assertTrue(((String) patch.get("description")).contains("không đổi email/password"));
		Map<?, ?> requestBody = (Map<?, ?>) patch.get("requestBody");
		Map<?, ?> content = (Map<?, ?>) requestBody.get("content");
		Map<?, ?> json = (Map<?, ?>) content.get("application/json");
		Map<?, ?> ref = (Map<?, ?>) json.get("schema");
		assertEquals("#/components/schemas/ProfileUpdateRequest", ref.get("$ref"));

		Map<?, ?> schemas = (Map<?, ?>) ((Map<?, ?>) root.get("components")).get("schemas");
		Map<?, ?> update = (Map<?, ?>) schemas.get("ProfileUpdateRequest");
		Map<?, ?> properties = (Map<?, ?>) update.get("properties");
		assertEquals(Set.of("fullName", "phoneNumber"), properties.keySet());
		assertEquals(Boolean.FALSE, update.get("additionalProperties"));
		Map<?, ?> responses = (Map<?, ?>) patch.get("responses");
		Map<?, ?> badRequest = (Map<?, ?>) responses.get("400");
		assertTrue(((String) badRequest.get("description")).contains("MALFORMED_REQUEST"));
		assertTrue(!responses.containsKey("409"));

		Path authDoc = Path.of("docs/api-contracts/auth.md");
		if (!Files.exists(authDoc)) authDoc = Path.of("../docs/api-contracts/auth.md");
		String authContract = Files.readString(authDoc);
		assertTrue(authContract.contains("chỉ cập nhật `fullName` và `phoneNumber`"));
		assertTrue(authContract.contains("JwtAuthenticationFilter` đối chiếu version với DB"));
		assertTrue(authContract.contains("JWT cũ bị từ chối"));
		assertTrue(!authContract.contains("Password mới không làm mất hiệu lực JWT"));
	}
}
