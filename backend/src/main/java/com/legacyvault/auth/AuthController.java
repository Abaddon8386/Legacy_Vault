
package com.legacyvault.auth;

import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.auth.dto.GoogleLoginRequest;
import com.legacyvault.auth.dto.RegisterRequest;
import com.legacyvault.auth.dto.RegisterResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final GoogleAuthService googleAuthService;

    public AuthController(AuthService authService, GoogleAuthService googleAuthService) {
        this.authService = authService;
        this.googleAuthService = googleAuthService;
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

    @PostMapping("/google")
    public ResponseEntity<LoginResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        return ResponseEntity.ok(googleAuthService.login(request));
    }

    @GetMapping("/me")
    public ResponseEntity<LoginResponse.AuthUserResponse> me(
            org.springframework.security.core.Authentication authentication) {
        LoginResponse.AuthUserResponse response = authService.getCurrentUser(authentication);
        return ResponseEntity.ok(response);
    }
}
