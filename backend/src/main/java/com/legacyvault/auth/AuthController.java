
package com.legacyvault.auth;

import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.auth.dto.RegisterRequest;
import com.legacyvault.auth.dto.RegisterResponse;
import com.legacyvault.auth.dto.ProfileResponse;
import com.legacyvault.auth.dto.ProfileUpdateRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        RegisterResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request) {

        LoginResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    public ResponseEntity<ProfileResponse> me(
            org.springframework.security.core.Authentication authentication) {
        ProfileResponse response = authService.getCurrentUser(authentication);
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/me")
    public ResponseEntity<ProfileResponse> updateMe(
            org.springframework.security.core.Authentication authentication,
            @Valid @RequestBody ProfileUpdateRequest request) {
        return ResponseEntity.ok(authService.updateCurrentUser(authentication, request));
    }
}
