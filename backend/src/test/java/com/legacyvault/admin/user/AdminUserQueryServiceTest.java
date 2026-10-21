package com.legacyvault.admin.user;

import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminUserQueryService;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminUserQueryServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final UserRoleRepository userRoles = mock(UserRoleRepository.class);
    private final AdminUserQueryService service = new AdminUserQueryService(users, userRoles);

    @Test
    void listMapsDistinctPublicFieldsAndSoftDeletedEffectiveStatus() {
        UUID publicId = UUID.randomUUID();
        User user = user(publicId, LocalDateTime.of(2026, 10, 20, 12, 0));
        ReflectionTestUtils.setField(user, "deletedAt", LocalDateTime.of(2026, 10, 21, 0, 0));
        when(users.searchForAdmin("alice", "ROLE_ADMIN", "DELETED", PageRequest.of(0, 20,
                org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "createdAt")
                        .and(org.springframework.data.domain.Sort.by("publicId")))))
                .thenReturn(new PageImpl<>(List.of(user), PageRequest.of(0, 20), 1));
        Role adminRole = new Role();
        adminRole.setRoleCode("ROLE_ADMIN");
        Role staffRole = new Role();
        staffRole.setRoleCode("ROLE_STAFF_EXECUTOR");
        when(userRoles.findByUserIdsWithRole(List.of(17L))).thenReturn(List.of(
                new UserRole(user, staffRole), new UserRole(user, adminRole)));

        var result = service.listUsers(" alice ", "role_admin", "deleted", 0, 20);

        assertThat(result.content()).containsExactly(new AdminUserResponse(publicId, "Alice Example",
                "alice@example.test", List.of("ROLE_ADMIN", "ROLE_STAFF_EXECUTOR"), LocalDateTime.of(2026, 10, 20, 12, 0)
                .toInstant(ZoneOffset.UTC), "DELETED"));
        assertThat(result.content().getFirst()).hasNoNullFieldsOrProperties();
    }

    @Test
    void getUserUsesPublicIdAndMissingIdReturnsTypedNotFound() {
        UUID publicId = UUID.randomUUID();
        User user = user(publicId, LocalDateTime.of(2026, 1, 1, 0, 0));
        when(users.findByPublicId(publicId)).thenReturn(Optional.of(user));
        when(userRoles.findByUserIdWithRole(17L)).thenReturn(List.of());
        assertThat(service.getUser(publicId).publicId()).isEqualTo(publicId);

        UUID absent = UUID.randomUUID();
        when(users.findByPublicId(absent)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getUser(absent))
                .isInstanceOf(com.legacyvault.common.error.BusinessException.class);
    }

    private User user(UUID publicId, LocalDateTime createdAt) {
        User user = new User();
        ReflectionTestUtils.setField(user, "userId", 17L);
        user.setPublicId(publicId);
        user.setFullName("Alice Example");
        user.setEmail("alice@example.test");
        user.setPasswordHash("must-not-be-exposed");
        user.setStatus("ACTIVE");
        ReflectionTestUtils.setField(user, "createdAt", createdAt);
        return user;
    }
}
