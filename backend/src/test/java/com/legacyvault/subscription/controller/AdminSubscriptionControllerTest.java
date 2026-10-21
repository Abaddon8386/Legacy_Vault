package com.legacyvault.subscription.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.subscription.dto.AdminSubscriptionDtos.*;
import com.legacyvault.subscription.service.AdminSubscriptionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AdminSubscriptionController.class)
@WebContractTestConfig
class AdminSubscriptionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @MockitoBean
    private AdminSubscriptionService adminService;

    @MockitoBean
    private com.legacyvault.auth.JwtService jwtService;

    @MockitoBean
    private com.legacyvault.user.repository.UserRepository userRepository;

    @MockitoBean
    private com.legacyvault.user.repository.UserRoleRepository userRoleRepository;

    private static final CustomUserPrincipal ADMIN_USER = new CustomUserPrincipal(1L, UUID.randomUUID(), "admin@legacyvault.local");
    private static final CustomUserPrincipal OWNER_USER = new CustomUserPrincipal(2L, UUID.randomUUID(), "owner@legacyvault.local");
    private static final CustomUserPrincipal STAFF_USER = new CustomUserPrincipal(3L, UUID.randomUUID(), "staff@legacyvault.local");
    private static final CustomUserPrincipal LEGAL_USER = new CustomUserPrincipal(4L, UUID.randomUUID(), "legal@legacyvault.local");

    private static RequestPostProcessor admin() {
        return authentication(new UsernamePasswordAuthenticationToken(ADMIN_USER, null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
    }

    private static RequestPostProcessor asRole(CustomUserPrincipal principal, String role) {
        return authentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    @Test
    @DisplayName("GET /api/v1/admin/subscriptions/plans unauthenticated returns 401")
    void getPlans_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/admin/subscriptions/plans"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/v1/admin/subscriptions/plans with ROLE_VAULT_OWNER returns 403 Forbidden")
    void getPlans_asVaultOwner_returns403() throws Exception {
        mockMvc.perform(get("/api/v1/admin/subscriptions/plans").with(asRole(OWNER_USER, "VAULT_OWNER")))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET /api/v1/admin/subscriptions/plans with ROLE_STAFF_EXECUTOR returns 403 Forbidden")
    void getPlans_asStaff_returns403() throws Exception {
        mockMvc.perform(get("/api/v1/admin/subscriptions/plans").with(asRole(STAFF_USER, "STAFF_EXECUTOR")))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET /api/v1/admin/subscriptions/plans with ROLE_LEGAL_VERIFIER returns 403 Forbidden")
    void getPlans_asLegal_returns403() throws Exception {
        mockMvc.perform(get("/api/v1/admin/subscriptions/plans").with(asRole(LEGAL_USER, "LEGAL_VERIFIER")))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET /api/v1/admin/subscriptions/plans with ROLE_ADMIN returns 200 OK")
    void getPlans_asAdmin_returns200() throws Exception {
        when(adminService.listPlans()).thenReturn(List.of(
            new PlanSummaryDto("BASIC", "Cơ bản", "Basic", 1, 0L, "LIFETIME", "PUBLISHED", false, null, 1, new PlanLimitsDto(5, 104857600L, 10485760L)),
            new PlanSummaryDto("STANDARD", "Tiêu chuẩn", "Standard", 1, 499000L, "LIFETIME", "PUBLISHED", true, 2, 2, new PlanLimitsDto(50, 1073741824L, 10485760L))
        ));

        mockMvc.perform(get("/api/v1/admin/subscriptions/plans").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].planCode").value("BASIC"))
            .andExpect(jsonPath("$[1].planCode").value("STANDARD"))
            .andExpect(jsonPath("$[1].activePriceVnd").value(499000));
    }

    @Test
    @DisplayName("POST /api/v1/admin/subscriptions/plans/{planCode}/versions with invalid body returns 400")
    void createDraft_invalidBody_returns400() throws Exception {
        // Missing sourceVersionId
        String invalidJson = "{}";

        mockMvc.perform(post("/api/v1/admin/subscriptions/plans/STANDARD/versions")
                .with(admin())
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidJson))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PUT /api/v1/admin/subscriptions/plans/{planCode}/versions/{version} with valid body returns 200")
    void updateDraft_validBody_returns200() throws Exception {
        UpdatePlanVersionRequest req = new UpdatePlanVersionRequest(
            "Tiêu chuẩn", "Standard", "Mô tả", "Desc",
            499000L, "LIFETIME", 50L, 1073741824L, 10485760L, 0L, "Ghi chú"
        );

        SubscriptionPlanVersionDto dto = new SubscriptionPlanVersionDto(
            1L, "STANDARD", 2, "DRAFT", "Tiêu chuẩn", "Standard",
            "Mô tả", "Desc", 499000L, "LIFETIME", 50L, 1073741824L, 10485760L,
            1L, "Ghi chú", null, null, Instant.now(), Instant.now(), null
        );

        when(adminService.updateDraftVersion(eq("STANDARD"), eq(2), any(), any(), any())).thenReturn(dto);

        mockMvc.perform(put("/api/v1/admin/subscriptions/plans/STANDARD/versions/2")
                .with(admin())
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value(2))
            .andExpect(jsonPath("$.purchasePriceVnd").value(499000));
    }

    @Test
    @DisplayName("PUT /api/v1/admin/subscriptions/plans/{planCode}/versions/{version} with missing concurrencyToken returns 400")
    void updateDraft_missingConcurrencyToken_returns400() throws Exception {
        // Request missing concurrencyToken
        String jsonWithoutToken = """
        {
            "nameVi": "Tiêu chuẩn",
            "nameEn": "Standard",
            "purchasePriceVnd": 499000,
            "billingModel": "LIFETIME",
            "assetLimit": 50,
            "storageBytesLimit": 1073741824,
            "fileBytesLimit": 10485760
        }
        """;

        mockMvc.perform(put("/api/v1/admin/subscriptions/plans/STANDARD/versions/2")
                .with(admin())
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonWithoutToken))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/publish returns 200")
    void publishVersion_asAdmin_returns200() throws Exception {
        SubscriptionPlanVersionDto dto = new SubscriptionPlanVersionDto(
            1L, "STANDARD", 2, "PUBLISHED", "Tiêu chuẩn", "Standard",
            "Mô tả", "Desc", 499000L, "LIFETIME", 50L, 1073741824L, 10485760L,
            1L, null, Instant.now(), 1L, Instant.now(), Instant.now(), null
        );

        when(adminService.publishVersion(eq("STANDARD"), eq(2), any(), any())).thenReturn(dto);

        mockMvc.perform(post("/api/v1/admin/subscriptions/plans/STANDARD/versions/2/publish")
                .with(admin())
                .with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    @Test
    @DisplayName("GET /api/v1/admin/subscriptions/accounts with query returns 200")
    void lookupAccount_asAdmin_returns200() throws Exception {
        AccountUsageLookupDto dto = new AccountUsageLookupDto(
            "uuid-123", "owner1", "owner1@test.com", "ROLE_VAULT_OWNER",
            "BASIC", "Gói Cơ bản (Mặc định)", "ACTIVE", "DEFAULT_BASIC_FREE",
            Instant.now(), null, "LIFETIME", 3L, 5L, 204800L, 104857600L,
            10485760L, 10485760L, true, "vault-uuid-456"
        );

        when(adminService.lookupAccount("owner1")).thenReturn(dto);

        mockMvc.perform(get("/api/v1/admin/subscriptions/accounts?query=owner1")
                .with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.effectivePlanCode").value("BASIC"))
            .andExpect(jsonPath("$.entitlementStatus").value("DEFAULT_BASIC_FREE"))
            .andExpect(jsonPath("$.assetCount").value(3));
    }

    @Test void transactionsReadOnlyRoleBoundaryAndPublicDetail() throws Exception {
        String path="/api/v1/admin/subscriptions/transactions";
        mockMvc.perform(get(path)).andExpect(status().isUnauthorized());
        for(String role:List.of("VAULT_OWNER","STAFF_EXECUTOR","LEGAL_VERIFIER","BENEFICIARY"))
            mockMvc.perform(get(path).with(asRole(OWNER_USER,role))).andExpect(status().isForbidden());
        when(adminService.lookupTransactions(isNull(),isNull(),isNull(),isNull(),isNull(),eq(0),eq(20)))
            .thenReturn(new com.legacyvault.common.api.PageEnvelope<>(List.of(),0,20,0,0));
        mockMvc.perform(get(path).with(admin())).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get(path+"/not-a-uuid").with(admin())).andExpect(status().isBadRequest());
        mockMvc.perform(get(path).param("from","not-a-date").with(admin())).andExpect(status().isBadRequest());
        mockMvc.perform(post(path).with(admin()).with(csrf())).andExpect(status().isMethodNotAllowed());
    }
}
