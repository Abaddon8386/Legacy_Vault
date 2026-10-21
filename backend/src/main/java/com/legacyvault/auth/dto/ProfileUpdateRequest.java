package com.legacyvault.auth.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Partial self-profile update; null/omitted fields are left unchanged. */
public class ProfileUpdateRequest {
    @Size(min = 1, max = 150)
    @Pattern(regexp = ".*\\S.*")
    private String fullName;

    @Email
    @Size(max = 254)
    @Pattern(regexp = ".*\\S.*")
    private String email;

    @Pattern(regexp = "^$|^\\+?[0-9]{8,15}$")
    private String phoneNumber;

    @Size(min = 8, max = 72)
    private String password;

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    @JsonAnySetter
    public void rejectUnrecognizedField(String field, Object value) {
        throw new IllegalArgumentException("Unsupported profile field");
    }
}
