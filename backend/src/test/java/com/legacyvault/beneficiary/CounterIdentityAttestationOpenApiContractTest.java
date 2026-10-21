package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

class CounterIdentityAttestationOpenApiContractTest {
	@Test
	void declaresTheStaffScopedAttestationWithoutClientResultOrEvidenceEcho() throws Exception {
		Path file = Path.of("docs/api-contracts/openapi.yaml");
		if (!Files.exists(file)) file = Path.of("../docs/api-contracts/openapi.yaml");
		LoaderOptions options = new LoaderOptions();
		options.setAllowDuplicateKeys(false);
		Map<?, ?> root = new Yaml(new SafeConstructor(options)).load(Files.readString(file));
		Map<?, ?> paths = (Map<?, ?>) root.get("paths");
		String path = "/api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/identity-attestations";
		Map<?, ?> operations = (Map<?, ?>) paths.get(path);
		assertEquals(java.util.Set.of("post"), operations.keySet());
		Map<?, ?> post = (Map<?, ?>) operations.get("post");
		Map<?, ?> body = (Map<?, ?>) post.get("requestBody");
		Map<?, ?> content = (Map<?, ?>) body.get("content");
		Map<?, ?> json = (Map<?, ?>) content.get("application/json");
		Map<?, ?> requestSchema = (Map<?, ?>) json.get("schema");
		assertEquals("#/components/schemas/CounterIdentityAttestationRequest", requestSchema.get("$ref"));

		Map<?, ?> components = (Map<?, ?>) root.get("components");
		Map<?, ?> schemas = (Map<?, ?>) components.get("schemas");
		Map<?, ?> request = (Map<?, ?>) schemas.get("CounterIdentityAttestationRequest");
		Map<?, ?> requestProperties = (Map<?, ?>) request.get("properties");
		assertEquals(java.util.Set.of("evidenceReference"), requestProperties.keySet());
		Map<?, ?> response = (Map<?, ?>) schemas.get("CounterIdentityAttestation");
		Map<?, ?> responseProperties = (Map<?, ?>) response.get("properties");
		assertTrue(responseProperties.containsKey("recordedBy"));
		assertTrue(responseProperties.containsKey("recordedAt"));
		assertTrue(!responseProperties.containsKey("evidenceReference"));
	}
}
