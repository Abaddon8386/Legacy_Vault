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
    void declaresStaffScopedAttestationAndAuthenticatedInvitationRedeemContract() throws Exception {
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
        assertEquals(java.util.Set.of("evidenceReference", "confirmedEmail"), requestProperties.keySet());
        assertEquals(java.util.List.of("evidenceReference"), request.get("required"));
        Map<?, ?> response = (Map<?, ?>) schemas.get("CounterIdentityAttestation");
        Map<?, ?> responseProperties = (Map<?, ?>) response.get("properties");
        assertTrue(responseProperties.containsKey("recordedBy"));
        assertTrue(responseProperties.containsKey("recordedAt"));
        assertTrue(!responseProperties.containsKey("evidenceReference"));
        assertTrue(!responseProperties.containsKey("confirmedEmail"));

        Map<?, ?> redeem = (Map<?, ?>) paths.get("/api/v1/auth/invitations/redeem");
        Map<?, ?> redeemPost = (Map<?, ?>) redeem.get("post");
        assertEquals("implemented", redeemPost.get("x-status"));
        assertEquals("blocked", redeemPost.get("x-integration-status"));
        assertTrue(((java.util.List<?>) redeemPost.get("x-blockers")).contains("approved-mail-transport"));
        assertTrue(((java.util.List<?>) redeemPost.get("x-blockers")).contains("ps104-delivered-item-read-api"));
        Map<?, ?> redeemResponses = (Map<?, ?>) redeemPost.get("responses");
        assertTrue(redeemResponses.containsKey("409"));
        assertTrue(redeemResponses.containsKey("422"));
        assertTrue(redeemResponses.containsKey("429"));

        Map<?, ?> staffMail = (Map<?, ?>) paths.get(
                "/api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/invitation-email");
        Map<?, ?> staffMailPost = (Map<?, ?>) staffMail.get("post");
        assertEquals("implemented", staffMailPost.get("x-status"));
        assertEquals("blocked", staffMailPost.get("x-integration-status"));
        Map<?, ?> staffMailBody = (Map<?, ?>) staffMailPost.get("requestBody");
        Map<?, ?> staffMailSchema = (Map<?, ?>) ((Map<?, ?>) ((Map<?, ?>) staffMailBody.get("content"))
                .get("application/json")).get("schema");
        assertEquals("#/components/schemas/StaffInvitationEmailRequest", staffMailSchema.get("$ref"));
        Map<?, ?> staffMailRequest = (Map<?, ?>) ((Map<?, ?>) ((Map<?, ?>) root.get("components"))
                .get("schemas")).get("StaffInvitationEmailRequest");
        assertEquals(java.util.Set.of("expectedGeneration"),
                ((Map<?, ?>) staffMailRequest.get("properties")).keySet());
    }

    @Test
    void declaresSafePreUnlockAssetCatalogAndPreservesBeneficiaryContract() throws Exception {
        Path file = Path.of("docs/api-contracts/openapi.yaml");
        if (!Files.exists(file)) file = Path.of("../docs/api-contracts/openapi.yaml");
        LoaderOptions options = new LoaderOptions();
        options.setAllowDuplicateKeys(false);
        Map<?, ?> root = new Yaml(new SafeConstructor(options)).load(Files.readString(file));
        Map<?, ?> paths = (Map<?, ?>) root.get("paths");
        Map<?, ?> catalogPath = (Map<?, ?>) paths.get("/api/v1/staff/verification-cases/{caseId}/assets");
        Map<?, ?> get = (Map<?, ?>) catalogPath.get("get");
        assertEquals("implemented", get.get("x-status"));
        Map<?, ?> responses = (Map<?, ?>) get.get("responses");
        Map<?, ?> response200 = (Map<?, ?>) responses.get("200");
        Map<?, ?> schema = (Map<?, ?>) ((Map<?, ?>) ((Map<?, ?>) response200.get("content"))
                .get("application/json")).get("schema");
        assertEquals("#/components/schemas/StaffAssetCatalogPage", schema.get("$ref"));
        Map<?, ?> schemas = (Map<?, ?>) ((Map<?, ?>) root.get("components")).get("schemas");
        Map<?, ?> item = (Map<?, ?>) schemas.get("StaffAssetCatalogItem");
        assertEquals(java.util.Set.of("assetId", "assetType", "name"),
                ((Map<?, ?>) item.get("properties")).keySet());
        assertEquals(Boolean.FALSE, item.get("additionalProperties"));

        Map<?, ?> beneficiaries = (Map<?, ?>) paths.get("/api/v1/staff/verification-cases/{caseId}/beneficiaries");
        assertTrue(beneficiaries.containsKey("get"), "existing PS-88 beneficiary contract remains in place");
        Map<?, ?> beneficiaryGet = (Map<?, ?>) beneficiaries.get("get");
        Map<?, ?> beneficiaryResponses = (Map<?, ?>) beneficiaryGet.get("responses");
        Map<?, ?> beneficiary200 = (Map<?, ?>) beneficiaryResponses.get("200");
        Map<?, ?> beneficiaryContent = (Map<?, ?>) beneficiary200.get("content");
        Map<?, ?> beneficiaryJson = (Map<?, ?>) beneficiaryContent.get("application/json");
        Map<?, ?> beneficiarySchema = (Map<?, ?>) beneficiaryJson.get("schema");
        assertEquals("array", beneficiarySchema.get("type"));
    }
}
