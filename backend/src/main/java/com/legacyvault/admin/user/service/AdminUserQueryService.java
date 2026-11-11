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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Read-only Admin account lookup; never returns persistence identifiers or credentials. */
@Service
public class AdminUserQueryService {
    private final UserRepository users;
    private static final java.util.regex.Pattern FULL_UUID = java.util.regex.Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final UUID NO_UUID = new UUID(0L, 0L);

    private final UserRoleRepository userRoles;
    private final VaultRepository vaults;

    public AdminUserQueryService(UserRepository users, UserRoleRepository userRoles, VaultRepository vaults) {
        this.users = users;
        this.userRoles = userRoles;
        this.vaults = vaults;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminUserResponse> listUsers(String query, String role, String status, int page, int size) {
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        String normalizedRole = role == null || role.isBlank() ? null : role.trim().toUpperCase(Locale.ROOT);
        String normalizedStatus = status == null || status.isBlank() ? null : status.trim().toUpperCase(Locale.ROOT);
        // A full UUID also finds the account with that public ID; any other text keeps searching name and email.
        UUID exactId = normalizedQuery != null && FULL_UUID.matcher(normalizedQuery).matches()
                ? UUID.fromString(normalizedQuery) : null;
        Page<User> result = users.searchForAdmin(normalizedQuery, exactId != null, exactId == null ? NO_UUID : exactId,
                normalizedRole, normalizedStatus, AdminAccountStatus.HANDOVER_VAULT_STATUSES,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("publicId"))));
        Map<Long, java.util.List<String>> rolesByUserId = result.getContent().isEmpty() ? Map.of()
                : userRoles.findByUserIdsWithRole(result.getContent().stream().map(User::getUserId).toList()).stream()
                .collect(Collectors.groupingBy(link -> link.getUser().getUserId(),
                        Collectors.mapping(link -> link.getRole().getRoleCode(), Collectors.toList())));
        Map<Long, String> vaultStatusByOwner = result.getContent().isEmpty() ? Map.of()
                : vaultStatuses(result.getContent().stream().map(User::getUserId).toList());
        return PageResponse.from(result, user -> toResponse(user, rolesByUserId.getOrDefault(user.getUserId(), java.util.List.of()),
                vaultStatusByOwner.get(user.getUserId())));
    }

    @Transactional(readOnly = true)
    public AdminUserResponse getUser(UUID publicId) {
        User user = users.findByPublicId(publicId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return toResponse(user, userRoles.findByUserIdWithRole(user.getUserId()).stream()
                .map(link -> link.getRole().getRoleCode()).toList(),
                vaultStatuses(List.of(user.getUserId())).get(user.getUserId()));
    }

    /** Vault status per owner, read fresh from the database (one vault per owner). */
    private Map<Long, String> vaultStatuses(List<Long> ownerIds) {
        return vaults.findByOwnerUserIdIn(ownerIds).stream()
                .collect(Collectors.toMap(Vault::getOwnerUserId, Vault::getStatus, (first, second) -> first));
    }

    private AdminUserResponse toResponse(User user, java.util.List<String> assignedRoles, String vaultStatus) {
        var roles = assignedRoles.stream()
                .filter(code -> code != null && !code.isBlank())
                .distinct()
                .sorted()
                .toList();
        String effectiveStatus = AdminAccountStatus.effective(user, vaultStatus);
        return new AdminUserResponse(user.getPublicId(), user.getFullName(), user.getEmail(), roles,
                user.getCreatedAt().toInstant(ZoneOffset.UTC), effectiveStatus);
    }
}
