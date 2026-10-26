package com.legacyvault.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.auth.dto.ProfileUpdateRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

class ProfileUpdateRequestTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void rejectsInvalidFieldsAndAcceptsOmittedFields() {
        ProfileUpdateRequest empty = new ProfileUpdateRequest();
        assertThat(validator.validate(empty)).isEmpty();

        ProfileUpdateRequest bad = new ProfileUpdateRequest();
        bad.setFullName("  ");
        bad.setPhoneNumber("abc");
        assertThat(validator.validate(bad)).hasSize(2);

        ProfileUpdateRequest badEmail = new ProfileUpdateRequest();
        badEmail.setEmail("not-an-email");
        assertThat(validator.validate(badEmail)).isNotEmpty();
    }

    @Test
    void acceptsFourMutableFieldsAndReauthenticationProofButRejectsInternalFields() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        ProfileUpdateRequest request = mapper.readValue(
                "{\"fullName\":\"New Name\",\"phoneNumber\":\"+84900000000\",\"email\":\"new@example.test\",\"password\":\"NewPassword123\",\"currentPassword\":\"CurrentPass123\"}", ProfileUpdateRequest.class);
        assertThat(request.getFullName()).isEqualTo("New Name");
        assertThat(request.getPhoneNumber()).isEqualTo("+84900000000");
        assertThat(request.getEmail()).isEqualTo("new@example.test");
        assertThat(request.getPassword()).isEqualTo("NewPassword123");
        assertThat(request.getCurrentPassword()).isEqualTo("CurrentPass123");

        for (String forbidden : new String[] {"id", "roles", "authVersion", "password_login_enabled", "status"}) {
            assertThatThrownBy(() -> mapper.readValue("{\"" + forbidden + "\":\"attacker-value\"}",
                    ProfileUpdateRequest.class))
                    .as("reject %s from PS-79", forbidden)
                    .isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
        }
    }
}
