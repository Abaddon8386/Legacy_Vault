package com.legacyvault.admin.user.service;

import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Read-only Admin account lookup; never returns persistence identifiers or credentials. */
@Service
public class AdminUserQueryService {
    private final UserRepository users;
    private final UserRoleRepository userRoles;
    private final VaultRepository vaults;

    public AdminUserQueryService(UserRepository users, UserRoleRepository userRoles, VaultRepository vaults) {
        this.users = users;
        this.userRoles = userRoles;
        this.vaults = vaults;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminUserResponse> listUsers(String query, String role, String status, String vaultStatus, int page, int size) {
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        String normalizedRole = role == null || role.isBlank() ? null : role.trim().toUpperCase(Locale.ROOT);
        String normalizedStatus = status == null || status.isBlank() ? null : status.trim().toUpperCase(Locale.ROOT);
        String normalizedVaultStatus = vaultStatus == null || vaultStatus.isBlank() ? null : vaultStatus.trim().toUpperCase(Locale.ROOT);
        if (normalizedVaultStatus != null && (!"ROLE_VAULT_OWNER".equals(normalizedRole)
                || !java.util.Set.of("NO_VAULT", "ACTIVE", "IN_PROCESS", "ARCHIVED").contains(normalizedVaultStatus))) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        Page<User> result = users.searchForAdmin(normalizedQuery, normalizedRole, normalizedStatus, normalizedVaultStatus,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("publicId"))));
        Map<Long, java.util.List<String>> rolesByUserId = result.getContent().isEmpty() ? Map.of()
                : userRoles.findByUserIdsWithRole(result.getContent().stream().map(User::getUserId).toList()).stream()
                .collect(Collectors.groupingBy(link -> link.getUser().getUserId(),
                        Collectors.mapping(link -> link.getRole().getRoleCode(), Collectors.toList())));
        var ownerIds = rolesByUserId.entrySet().stream().filter(entry -> entry.getValue().contains("ROLE_VAULT_OWNER"))
                .map(Map.Entry::getKey).toList();
        Map<Long, String> vaultStatusByOwner = ownerIds.isEmpty() ? Map.of()
                : vaults.findByOwnerUserIdIn(ownerIds).stream().collect(Collectors.toMap(Vault::getOwnerUserId, Vault::getStatus));
        var processingIds = result.isEmpty() ? java.util.Set.<Long>of()
                : users.findProcessingUserIds(result.getContent().stream().map(User::getUserId).toList(), normalizedRole);
        return PageResponse.from(result, user -> toResponse(user, rolesByUserId.getOrDefault(user.getUserId(), java.util.List.of()),
                vaultStatusByOwner.get(user.getUserId()), processingIds.contains(user.getUserId())));
    }

    @Transactional(readOnly = true)
    public AdminUserResponse getUser(UUID publicId, String role) {
        User user = users.findByPublicId(publicId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        var roles = userRoles.findByUserIdWithRole(user.getUserId()).stream().map(link -> link.getRole().getRoleCode()).toList();
        String vaultStatus = roles.contains("ROLE_VAULT_OWNER") ? vaults.findByOwnerUserIdIn(java.util.List.of(user.getUserId()))
                .stream().findFirst().map(Vault::getStatus).orElse(null) : null;
        String normalizedRole = role == null || role.isBlank() ? null : role.trim().toUpperCase(Locale.ROOT);
        boolean processing = users.findProcessingUserIds(java.util.List.of(user.getUserId()), normalizedRole).contains(user.getUserId());
        return toResponse(user, roles, vaultStatus, processing);
    }

    private AdminUserResponse toResponse(User user, java.util.List<String> assignedRoles, String vaultStatus, boolean processing) {
        var roles = assignedRoles.stream()
                .filter(code -> code != null && !code.isBlank())
                .distinct()
                .sorted()
                .toList();
        String effectiveStatus = user.getDeletedAt() != null ? "DELETED" : user.getStatus();
        String vaultGroup = !roles.contains("ROLE_VAULT_OWNER") ? null : switch (vaultStatus) {
            case null -> "NO_VAULT";
            case "ACTIVE", "ARCHIVED" -> vaultStatus;
            case "AWAITING_VERIFICATION", "DOCUMENT_VERIFICATION", "WILL_VERIFICATION", "AWAITING_LEGAL_BASIS",
                 "LEGAL_BASIS_VERIFICATION", "ON_HOLD", "UNLOCKED", "HANDOVER_IN_PROGRESS" -> "IN_PROCESS";
            default -> null;
        };
        return new AdminUserResponse(user.getPublicId(), user.getFullName(), user.getEmail(), roles,
                user.getCreatedAt().toInstant(ZoneOffset.UTC), effectiveStatus,
                "ACTIVE".equals(effectiveStatus) && processing ? "IN_PROCESS" : effectiveStatus, vaultGroup);
    }
}
