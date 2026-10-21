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
    }

    @Test
    void acceptsOnlyFullNameAndPhoneNumberAndRejectsEmailPasswordAndOtherFields() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        ProfileUpdateRequest request = mapper.readValue(
                "{\"fullName\":\"New Name\",\"phoneNumber\":\"+84900000000\"}", ProfileUpdateRequest.class);
        assertThat(request.getFullName()).isEqualTo("New Name");
        assertThat(request.getPhoneNumber()).isEqualTo("+84900000000");

        for (String forbidden : new String[] {"email", "password", "role", "userId"}) {
            assertThatThrownBy(() -> mapper.readValue("{\"" + forbidden + "\":\"attacker-value\"}",
                    ProfileUpdateRequest.class))
                    .as("reject %s from PS-79", forbidden)
                    .isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
        }
    }
}
