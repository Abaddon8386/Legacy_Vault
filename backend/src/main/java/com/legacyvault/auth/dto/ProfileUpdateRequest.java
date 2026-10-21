package com.legacyvault.auth.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** PS-79 partial self-profile update. Only fullName and phoneNumber are writable. */
public class ProfileUpdateRequest {
    @Size(min = 1, max = 150)
    @Pattern(regexp = ".*\\S.*")
    private String fullName;

    @Pattern(regexp = "^$|^\\+?[0-9]{8,15}$")
    private String phoneNumber;

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    @JsonAnySetter
    public void rejectUnrecognizedField(String field, Object value) {
        throw new IllegalArgumentException("Unsupported profile field");
    }
}
