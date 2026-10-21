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
        bad.setEmail("not-an-email");
        bad.setPhoneNumber("abc");
        bad.setPassword("short");
        assertThat(validator.validate(bad)).hasSize(4);
    }

    @Test
    void rejectsFieldsOutsideWhitelist() {
        ObjectMapper mapper = new ObjectMapper();
        assertThatThrownBy(() -> mapper.readValue("{\"role\":\"ADMIN\"}", ProfileUpdateRequest.class))
                .isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
    }
}
