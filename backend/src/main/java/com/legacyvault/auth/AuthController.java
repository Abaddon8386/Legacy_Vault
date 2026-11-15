
package com.legacyvault.auth;

import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.auth.dto.GoogleLoginRequest;
import com.legacyvault.auth.dto.GoogleIdentityLinkResponse;
import com.legacyvault.auth.dto.PasswordSetupRequest;
import com.legacyvault.auth.dto.PasswordSetupResponse;
import com.legacyvault.auth.dto.RegisterRequest;
import com.legacyvault.auth.dto.RegisterResponse;
import com.legacyvault.auth.dto.ProfileResponse;
import com.legacyvault.auth.dto.ProfileUpdateRequest;
import com.legacyvault.common.security.CustomUserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

/**
 * Controller REST cho nhóm API xác thực dưới <code>/api/v1/auth</code>: đăng ký, đăng nhập (mật khẩu và Google),
 * liên kết danh tính Google, thiết lập mật khẩu lần đầu và xem/cập nhật hồ sơ cá nhân.
 * Controller chỉ nhận request, kiểm tra dữ liệu đầu vào ({@code @Valid}) và ủy quyền cho {@link AuthService} / {@link GoogleAuthService}.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final GoogleAuthService googleAuthService;

    public AuthController(AuthService authService, GoogleAuthService googleAuthService) {
        this.authService = authService;
        this.googleAuthService = googleAuthService;
    }

    /**
     * Đăng ký tài khoản Vault Owner bằng email + mật khẩu.
     * @return 201 Created cùng thông tin công khai của tài khoản mới (không có mật khẩu).
     */
    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        RegisterResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Đăng nhập bằng email/mật khẩu. Truyền IP client để {@link LoginAttemptLimiter} giới hạn theo IP.
     * @return access token JWT và thông tin người dùng.
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            jakarta.servlet.http.HttpServletRequest servletRequest) {

        LoginResponse response = authService.login(request, servletRequest.getRemoteAddr());
        return ResponseEntity.ok(response);
    }

    /**
     * Đăng nhập (hoặc tạo tài khoản lần đầu) bằng Google ID token.
     * Nếu hai request song song cùng tạo tài khoản, request thua nhận {@link GoogleSignupRaceException} và được thử lại đúng một lần.
     */
    @PostMapping("/google")
    public ResponseEntity<LoginResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        try {
            return ResponseEntity.ok(googleAuthService.login(request));
        } catch (GoogleSignupRaceException race) {
            // Request song song thắng đã tạo tài khoản và transaction này bị rollback (token chưa dùng).
            // Thử lại một lần sẽ đăng nhập đúng người dùng Google đó, hoặc trả GOOGLE_EMAIL_ALREADY_REGISTERED thật sự.
            return ResponseEntity.ok(googleAuthService.login(request));
        }
    }

    /** Liên kết danh tính Google với tài khoản đang đăng nhập (không bao giờ liên kết theo email). */
    @PostMapping("/google/link")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<GoogleIdentityLinkResponse> linkGoogleIdentity(
            @Valid @RequestBody GoogleLoginRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok(googleAuthService.linkIdentity(
                request, CustomUserPrincipal.requireUserId(principal)));
    }

    /** Đặt mật khẩu lần đầu cho tài khoản chỉ đăng nhập bằng Google; yêu cầu thêm Google ID token mới để chứng minh quyền kiểm soát tài khoản Google. */
    @PostMapping("/password/setup")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PasswordSetupResponse> setupPassword(
            @Valid @RequestBody PasswordSetupRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok(googleAuthService.setupPassword(CustomUserPrincipal.requireUserId(principal), request));
    }

    /** Lấy hồ sơ của người dùng hiện tại (đọc từ DB, không tin dữ liệu trong token). */
    @GetMapping("/me")
    public ResponseEntity<ProfileResponse> me(
            org.springframework.security.core.Authentication authentication) {
        ProfileResponse response = authService.getCurrentUser(authentication);
        return ResponseEntity.ok(response);
    }

    /** Cập nhật một phần hồ sơ cá nhân. Đổi email hoặc mật khẩu bắt buộc kèm mật khẩu hiện tại (xem {@link AuthService#updateCurrentUser}). */
    @PatchMapping("/me")
    public ResponseEntity<ProfileResponse> updateMe(
            org.springframework.security.core.Authentication authentication,
            @Valid @RequestBody ProfileUpdateRequest request) {
        return ResponseEntity.ok(authService.updateCurrentUser(authentication, request));
    }
}
