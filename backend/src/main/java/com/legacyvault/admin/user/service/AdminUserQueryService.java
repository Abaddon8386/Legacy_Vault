package com.legacyvault.admin.user.service;

import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
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

    public AdminUserQueryService(UserRepository users, UserRoleRepository userRoles) {
        this.users = users;
        this.userRoles = userRoles;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminUserResponse> listUsers(String query, String role, String status, int page, int size) {
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        String normalizedRole = role == null || role.isBlank() ? null : role.trim().toUpperCase(Locale.ROOT);
        String normalizedStatus = status == null || status.isBlank() ? null : status.trim().toUpperCase(Locale.ROOT);
        Page<User> result = users.searchForAdmin(normalizedQuery, normalizedRole, normalizedStatus,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("publicId"))));
        Map<Long, java.util.List<String>> rolesByUserId = result.getContent().isEmpty() ? Map.of()
                : userRoles.findByUserIdsWithRole(result.getContent().stream().map(User::getUserId).toList()).stream()
                .collect(Collectors.groupingBy(link -> link.getUser().getUserId(),
                        Collectors.mapping(link -> link.getRole().getRoleCode(), Collectors.toList())));
        return PageResponse.from(result, user -> toResponse(user, rolesByUserId.getOrDefault(user.getUserId(), java.util.List.of())));
    }

    @Transactional(readOnly = true)
    public AdminUserResponse getUser(UUID publicId) {
        User user = users.findByPublicId(publicId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return toResponse(user, userRoles.findByUserIdWithRole(user.getUserId()).stream()
                .map(link -> link.getRole().getRoleCode()).toList());
    }

    private AdminUserResponse toResponse(User user, java.util.List<String> assignedRoles) {
        var roles = assignedRoles.stream()
                .filter(code -> code != null && !code.isBlank())
                .distinct()
                .sorted()
                .toList();
        String effectiveStatus = user.getDeletedAt() != null ? "DELETED" : user.getStatus();
        return new AdminUserResponse(user.getPublicId(), user.getFullName(), user.getEmail(), roles,
                user.getCreatedAt().toInstant(ZoneOffset.UTC), effectiveStatus);
    }
}
