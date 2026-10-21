package com.legacyvault.auth.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** PS-79 partial self-profile update. currentPassword is reauthentication proof, never a writable account field. */
public class ProfileUpdateRequest {
    @Size(min = 1, max = 150)
    @Pattern(regexp = ".*\\S.*")
    private String fullName;

    @Pattern(regexp = "^$|^\\+?[0-9]{8,15}$")
    private String phoneNumber;

    @Email
    @Size(max = 254)
    @Pattern(regexp = ".*\\S.*")
    private String email;

    private String password;
    private String currentPassword;

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getCurrentPassword() { return currentPassword; }
    public void setCurrentPassword(String currentPassword) { this.currentPassword = currentPassword; }

    @JsonAnySetter
    public void rejectUnrecognizedField(String field, Object value) {
        throw new IllegalArgumentException("Unsupported profile field");
    }
}
