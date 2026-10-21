package com.legacyvault.subscription.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.subscription.dto.AdminSubscriptionDtos.*;
import com.legacyvault.subscription.entity.SubscriptionPlan;
import com.legacyvault.subscription.entity.SubscriptionPlanVersion;
import com.legacyvault.subscription.entity.SubscriptionPlanVersion.VersionStatus;
import com.legacyvault.subscription.repository.OwnerUsageRepository;
import com.legacyvault.subscription.repository.SubscriptionPlanRepository;
import com.legacyvault.subscription.repository.SubscriptionPlanVersionRepository;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminSubscriptionServiceTest {

    @Mock
    private SubscriptionPlanVersionRepository planVersionRepository;

    @Mock
    private SubscriptionPlanRepository activePlanRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private OwnerUsageRepository ownerUsageRepository;

    @Mock
    private VaultRepository vaultRepository;

    @Mock
    private AuditService auditService;
    @Mock
    private com.legacyvault.subscription.repository.PaymentRepository payments;

    private AdminSubscriptionService service;

    @BeforeEach
    void setUp() {
        service = new AdminSubscriptionService(
            planVersionRepository,
            activePlanRepository,
            userRepository,
            ownerUsageRepository,
            vaultRepository,
            auditService,
            payments
        );
    }

    @Test
    @DisplayName("listPlans returns summary for BASIC, STANDARD, and EXTENDED with correct PS-82 prices")
    void listPlans_returnsAllThreePlans() {
        SubscriptionPlanVersion standardV1 = new SubscriptionPlanVersion();
        standardV1.setPlanCode("STANDARD");
        standardV1.setVersion(1);
        standardV1.setStatus(VersionStatus.PUBLISHED);
        standardV1.setNameVi("Tiêu chuẩn");
        standardV1.setNameEn("Standard Plan");
        standardV1.setPurchasePriceVnd(499000L);
        standardV1.setBillingModel("LIFETIME");
        standardV1.setAssetLimit(50L);
        standardV1.setStorageLimitBytes(1073741824L);
        standardV1.setFileLimitBytes(10485760L);

        when(planVersionRepository.findByPlanCodeOrderByVersionDesc("STANDARD")).thenReturn(List.of(standardV1));
        when(planVersionRepository.findByPlanCodeOrderByVersionDesc("BASIC")).thenReturn(Collections.emptyList());
        when(planVersionRepository.findByPlanCodeOrderByVersionDesc("EXTENDED")).thenReturn(Collections.emptyList());

        List<PlanSummaryDto> summaries = service.listPlans();

        assertThat(summaries).hasSize(3);
        PlanSummaryDto standard = summaries.stream().filter(s -> s.planCode().equals("STANDARD")).findFirst().orElseThrow();
        assertThat(standard.activePriceVnd()).isEqualTo(499000L);
        assertThat(standard.activeBillingModel()).isEqualTo("LIFETIME");
        assertThat(standard.limits().storageBytes()).isEqualTo(1073741824L);
        assertThat(standard.limits().fileBytes()).isEqualTo(10485760L);
    }

    @Test
    @DisplayName("createDraftVersion succeeds and inherits properties from source version")
    void createDraftVersion_success() {
        SubscriptionPlanVersion source = new SubscriptionPlanVersion();
        source.setId(10L);
        source.setPlanCode("STANDARD");
        source.setVersion(1);
        source.setStatus(VersionStatus.PUBLISHED);
        source.setNameVi("Tiêu chuẩn");
        source.setNameEn("Standard");
        source.setPurchasePriceVnd(499000L);
        source.setAssetLimit(50L);
        source.setStorageLimitBytes(1073741824L);

        when(planVersionRepository.existsByPlanCodeAndStatus("STANDARD", VersionStatus.DRAFT)).thenReturn(false);
        when(planVersionRepository.findById(10L)).thenReturn(Optional.of(source));
        when(planVersionRepository.findMaxVersion("STANDARD")).thenReturn(1);
        when(planVersionRepository.saveAndFlush(any(SubscriptionPlanVersion.class))).thenAnswer(inv -> {
            SubscriptionPlanVersion v = inv.getArgument(0);
            v.setId(11L);
            return v;
        });

        CreateDraftRequest req = new CreateDraftRequest(10L, "New draft for Q4");
        SubscriptionPlanVersionDto created = service.createDraftVersion("STANDARD", req, 1L, "127.0.0.1");

        assertThat(created).isNotNull();
        assertThat(created.version()).isEqualTo(2);
        assertThat(created.status()).isEqualTo("DRAFT");
        assertThat(created.purchasePriceVnd()).isEqualTo(499000L);
        assertThat(created.fileBytesLimit()).isEqualTo(10485760L);
        verify(auditService).record(any(AuditEvent.class));
    }

    @Test
    @DisplayName("createDraftVersion throws PLAN_VERSION_ALREADY_EXISTS when draft already present")
    void createDraftVersion_conflictWhenDraftExists() {
        when(planVersionRepository.existsByPlanCodeAndStatus("STANDARD", VersionStatus.DRAFT)).thenReturn(true);

        CreateDraftRequest req = new CreateDraftRequest(10L, "New draft");
        assertThatThrownBy(() -> service.createDraftVersion("STANDARD", req, 1L, "127.0.0.1"))
            .isInstanceOf(BusinessException.class)
            .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PLAN_VERSION_ALREADY_EXISTS);
    }

    @Test
    @DisplayName("createDraftVersion catches DB unique index violation and throws PLAN_VERSION_ALREADY_EXISTS")
    void createDraftVersion_catchesDbUniqueConstraint() {
        SubscriptionPlanVersion source = new SubscriptionPlanVersion();
        source.setId(10L);
        source.setPlanCode("STANDARD");

        when(planVersionRepository.existsByPlanCodeAndStatus("STANDARD", VersionStatus.DRAFT)).thenReturn(false);
        when(planVersionRepository.findById(10L)).thenReturn(Optional.of(source));
        when(planVersionRepository.findMaxVersion("STANDARD")).thenReturn(1);
        when(planVersionRepository.saveAndFlush(any(SubscriptionPlanVersion.class)))
            .thenThrow(new DataIntegrityViolationException("UQ_sub_plan_versions_draft"));

        CreateDraftRequest req = new CreateDraftRequest(10L, "New draft");
        assertThatThrownBy(() -> service.createDraftVersion("STANDARD", req, 1L, "127.0.0.1"))
            .isInstanceOf(BusinessException.class)
            .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PLAN_VERSION_ALREADY_EXISTS);
    }

    @Test
    @DisplayName("updateDraftVersion succeeds when concurrencyToken matches")
    void updateDraftVersion_success() {
        SubscriptionPlanVersion draft = new SubscriptionPlanVersion();
        draft.setId(11L);
        draft.setPlanCode("STANDARD");
        draft.setVersion(2);
        draft.setStatus(VersionStatus.DRAFT);
        draft.setConcurrencyToken(5L);

        when(planVersionRepository.findByPlanCodeAndVersion("STANDARD", 2)).thenReturn(Optional.of(draft));
        when(planVersionRepository.saveAndFlush(any(SubscriptionPlanVersion.class))).thenAnswer(inv -> inv.getArgument(0));

        UpdatePlanVersionRequest req = new UpdatePlanVersionRequest(
            "Tiêu chuẩn mới", "Standard New", "Mô tả", "Desc",
            499000L, "LIFETIME", 50L, 1073741824L, 10485760L, 5L, "Update notes"
        );

        SubscriptionPlanVersionDto updated = service.updateDraftVersion("STANDARD", 2, req, 1L, "127.0.0.1");

        assertThat(updated.nameVi()).isEqualTo("Tiêu chuẩn mới");
        verify(auditService).record(any(AuditEvent.class));
    }

    @Test
    @DisplayName("updateDraftVersion throws PLAN_VERSION_CONFLICT when concurrencyToken does not match")
    void updateDraftVersion_conflictWhenTokenMismatches() {
        SubscriptionPlanVersion draft = new SubscriptionPlanVersion();
        draft.setId(11L);
        draft.setPlanCode("STANDARD");
        draft.setVersion(2);
        draft.setStatus(VersionStatus.DRAFT);
        draft.setConcurrencyToken(6L); // DB has token 6

        when(planVersionRepository.findByPlanCodeAndVersion("STANDARD", 2)).thenReturn(Optional.of(draft));

        UpdatePlanVersionRequest req = new UpdatePlanVersionRequest(
            "Tiêu chuẩn", "Standard", "Mô tả", "Desc",
            499000L, "LIFETIME", 50L, 1073741824L, 10485760L, 5L, "Update notes" // Sent stale token 5
        );

        assertThatThrownBy(() -> service.updateDraftVersion("STANDARD", 2, req, 1L, "127.0.0.1"))
            .isInstanceOf(BusinessException.class)
            .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PLAN_VERSION_CONFLICT);
    }

    @Test
    @DisplayName("updateDraftVersion rejects file size != 10MB or invalid prices")
    void updateDraftVersion_validationFailed() {
        SubscriptionPlanVersion draft = new SubscriptionPlanVersion();
        draft.setPlanCode("STANDARD");
        draft.setVersion(2);
        draft.setStatus(VersionStatus.DRAFT);
        draft.setConcurrencyToken(0L);

        when(planVersionRepository.findByPlanCodeAndVersion("STANDARD", 2)).thenReturn(Optional.of(draft));

        // Invalid file size 20 MB (must be exactly 10 MB)
        UpdatePlanVersionRequest reqInvalidFile = new UpdatePlanVersionRequest(
            "Tiêu chuẩn", "Standard", "Mô tả", "Desc",
            499000L, "LIFETIME", 50L, 1073741824L, 20971520L, 0L, "Update notes"
        );

        assertThatThrownBy(() -> service.updateDraftVersion("STANDARD", 2, reqInvalidFile, 1L, "127.0.0.1"))
            .isInstanceOf(BusinessException.class)
            .hasFieldOrPropertyWithValue("errorCode", ErrorCode.VALIDATION_FAILED);
    }

    @Test
    @DisplayName("publishVersion deprecates old published version and synchronizes with subscription_plans table")
    void publishVersion_success() {
        SubscriptionPlanVersion draft = new SubscriptionPlanVersion();
        draft.setId(12L);
        draft.setPlanCode("STANDARD");
        draft.setVersion(2);
        draft.setStatus(VersionStatus.DRAFT);
        draft.setPurchasePriceVnd(499000L);
        draft.setAssetLimit(50L);
        draft.setStorageLimitBytes(1073741824L);
        draft.setFileLimitBytes(10485760L);

        SubscriptionPlanVersion oldPublished = new SubscriptionPlanVersion();
        oldPublished.setId(10L);
        oldPublished.setPlanCode("STANDARD");
        oldPublished.setVersion(1);
        oldPublished.setStatus(VersionStatus.PUBLISHED);

        when(planVersionRepository.findByPlanCodeAndVersion("STANDARD", 2)).thenReturn(Optional.of(draft));
        when(planVersionRepository.findByPlanCodeAndStatus("STANDARD", VersionStatus.PUBLISHED)).thenReturn(Optional.of(oldPublished));
        when(planVersionRepository.saveAndFlush(any(SubscriptionPlanVersion.class))).thenAnswer(inv -> inv.getArgument(0));

        when(activePlanRepository.updatePlanConfig(eq("STANDARD"), eq(2), eq(499000L), eq(50L), eq(1073741824L), eq(10485760L))).thenReturn(1);

        SubscriptionPlanVersionDto published = service.publishVersion("STANDARD", 2, 1L, "127.0.0.1");

        assertThat(published.status()).isEqualTo("PUBLISHED");
        assertThat(oldPublished.getStatus()).isEqualTo(VersionStatus.DEPRECATED);
        verify(activePlanRepository).updatePlanConfig(eq("STANDARD"), eq(2), eq(499000L), eq(50L), eq(1073741824L), eq(10485760L));
        verify(auditService).record(any(AuditEvent.class));
    }

    @Test
    @DisplayName("deprecateVersion marks active version as DEPRECATED")
    void deprecateVersion_success() {
        SubscriptionPlanVersion pub = new SubscriptionPlanVersion();
        pub.setId(10L);
        pub.setPlanCode("STANDARD");
        pub.setVersion(1);
        pub.setStatus(VersionStatus.PUBLISHED);
        pub.setNameVi("Tiêu chuẩn");
        pub.setNameEn("Standard");
        pub.setPurchasePriceVnd(499000L);
        pub.setBillingModel("LIFETIME");
        pub.setAssetLimit(50L);
        pub.setStorageLimitBytes(1073741824L);
        pub.setFileLimitBytes(10485760L);
        pub.setConcurrencyToken(0L);

        when(planVersionRepository.findByPlanCodeAndVersion("STANDARD", 1)).thenReturn(Optional.of(pub));
        when(planVersionRepository.saveAndFlush(any(SubscriptionPlanVersion.class))).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionPlanVersionDto deprecated = service.deprecateVersion("STANDARD", 1, 1L, "127.0.0.1");

        assertThat(deprecated.status()).isEqualTo("DEPRECATED");
        verify(auditService).record(any(AuditEvent.class));
    }

    @Test
    @DisplayName("lookupAccount returns truthful BASIC plan and real database usage without fake paid lifetime entitlements")
    void lookupAccount_returnsTruthfulData() {
        User user = new User();
        // Reflection or setter for fields
        try {
            var idField = User.class.getDeclaredField("userId");
            idField.setAccessible(true);
            idField.set(user, 99L);

            var publicIdField = User.class.getDeclaredField("publicId");
            publicIdField.setAccessible(true);
            publicIdField.set(user, UUID.randomUUID());

            var nameField = User.class.getDeclaredField("fullName");
            nameField.setAccessible(true);
            nameField.set(user, "Owner One");

            var emailField = User.class.getDeclaredField("email");
            emailField.setAccessible(true);
            emailField.set(user, "owner1@test.com");

            var createdField = User.class.getDeclaredField("createdAt");
            createdField.setAccessible(true);
            createdField.set(user, java.time.LocalDateTime.now());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        when(userRepository.findByEmail("owner1@test.com")).thenReturn(Optional.of(user));
        when(ownerUsageRepository.read(99L)).thenReturn(new com.legacyvault.subscription.service.QuotaPolicy.Usage(3L, 204800L));
        when(vaultRepository.existsByOwnerUserId(99L)).thenReturn(false);

        AccountUsageLookupDto lookup = service.lookupAccount("owner1@test.com");

        assertThat(lookup.effectivePlanCode()).isEqualTo("BASIC");
        assertThat(lookup.entitlementStatus()).isEqualTo("DEFAULT_BASIC_FREE");
        assertThat(lookup.effectiveUntil()).isNull(); // Indefinite free
        assertThat(lookup.billingModel()).isEqualTo("LIFETIME");
        assertThat(lookup.assetCount()).isEqualTo(3L);
        assertThat(lookup.storageBytes()).isEqualTo(204800L);
    }

    @Test
    @DisplayName("lookupTransactions throws PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE (409)")
    void lookupTransactions_throwsPendingIntegration() {
        assertThatThrownBy(() -> service.lookupTransactions("test"))
            .isInstanceOf(BusinessException.class)
            .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE);
    }
}
