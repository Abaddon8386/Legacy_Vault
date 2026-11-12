
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
 * Controller xác thực, gốc đường dẫn {@code /api/v1/auth}. Chỉ ủy quyền cho {@link AuthService} (mật khẩu, hồ sơ)
 * và {@link GoogleAuthService} (Google). Các endpoint đăng ký/đăng nhập/Google là công khai; còn lại cần JWT hợp lệ.
 * Lỗi nghiệp vụ là {@code BusinessException} với {@code ErrorCode} tương ứng.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    /**
     * Dịch vụ đăng ký, đăng nhập bằng mật khẩu và hồ sơ.
     */
    private final AuthService authService;
    /**
     * Dịch vụ đăng nhập/liên kết Google và đặt mật khẩu lần đầu.
     */
    private final GoogleAuthService googleAuthService;

    /**
     * @param authService       dịch vụ xác thực bằng mật khẩu và hồ sơ
     * @param googleAuthService dịch vụ xác thực Google
     */
    public AuthController(AuthService authService, GoogleAuthService googleAuthService) {
        this.authService = authService;
        this.googleAuthService = googleAuthService;
    }

    /**
     * {@code POST /api/v1/auth/register} (công khai): đăng ký tài khoản Vault Owner mới.
     *
     * @param request {@link RegisterRequest} đã validate
     * @return {@code 201 Created} với {@link RegisterResponse}
     * @throws BusinessException {@code EMAIL_ALREADY_EXISTS} nếu email đã tồn tại
     */
    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        RegisterResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * {@code POST /api/v1/auth/login} (công khai): đăng nhập bằng email + mật khẩu, có giới hạn thử sai theo email và IP.
     *
     * @param request        {@link LoginRequest}
     * @param servletRequest request HTTP, lấy IP nguồn cho bộ giới hạn
     * @return {@code 200 OK} với {@link LoginResponse} (JWT)
     * @throws BusinessException {@code INVALID_CREDENTIALS}, {@code ACCOUNT_LOCKED_BY_ADMIN} hoặc lỗi khóa tạm do thử sai quá nhiều
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            jakarta.servlet.http.HttpServletRequest servletRequest) {

        LoginResponse response = authService.login(request, servletRequest.getRemoteAddr());
        return ResponseEntity.ok(response);
    }

    /**
     * {@code POST /api/v1/auth/google} (công khai): đăng nhập bằng ID token Google; tự tạo tài khoản Owner nếu là lần
     * đầu. Nếu gặp {@link GoogleSignupRaceException} (request song song vừa tạo tài khoản) thì thử lại đúng một lần.
     *
     * @param request {@link GoogleLoginRequest} chứa credential
     * @return {@code 200 OK} với {@link LoginResponse}
     */
    @PostMapping("/google")
    public ResponseEntity<LoginResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        try {
            return ResponseEntity.ok(googleAuthService.login(request));
        } catch (GoogleSignupRaceException race) {
            // The parallel request that won created the account and this transaction rolled back (token not used).
            // One retry signs the same Google user in, or returns the real GOOGLE_EMAIL_ALREADY_REGISTERED.
            return ResponseEntity.ok(googleAuthService.login(request));
        }
    }

    /**
     * {@code POST /api/v1/auth/google/link} (cần đăng nhập): liên kết danh tính Google với tài khoản hiện tại.
     *
     * @param request   {@link GoogleLoginRequest} chứa credential
     * @param principal người dùng hiện tại lấy từ JWT
     * @return {@code 200 OK} với {@link GoogleIdentityLinkResponse}
     */
    @PostMapping("/google/link")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<GoogleIdentityLinkResponse> linkGoogleIdentity(
            @Valid @RequestBody GoogleLoginRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok(googleAuthService.linkIdentity(
                request, CustomUserPrincipal.requireUserId(principal)));
    }

    /**
     * {@code POST /api/v1/auth/password/setup} (cần đăng nhập): đặt mật khẩu lần đầu cho tài khoản Google-only,
     * yêu cầu ID token Google mới để chứng minh quyền kiểm soát.
     *
     * @param request   {@link PasswordSetupRequest}
     * @param principal người dùng hiện tại lấy từ JWT
     * @return {@code 200 OK} với {@link PasswordSetupResponse}
     * @throws BusinessException {@code PASSWORD_ALREADY_SET}, {@code PASSWORD_POLICY}, ...
     */
    @PostMapping("/password/setup")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PasswordSetupResponse> setupPassword(
            @Valid @RequestBody PasswordSetupRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        return ResponseEntity.ok(googleAuthService.setupPassword(CustomUserPrincipal.requireUserId(principal), request));
    }

    /**
     * {@code GET /api/v1/auth/me} (cần đăng nhập): lấy hồ sơ của tài khoản hiện tại.
     *
     * @param authentication đối tượng xác thực của Spring Security
     * @return {@code 200 OK} với {@link ProfileResponse}
     */
    @GetMapping("/me")
    public ResponseEntity<ProfileResponse> me(
            org.springframework.security.core.Authentication authentication) {
        ProfileResponse response = authService.getCurrentUser(authentication);
        return ResponseEntity.ok(response);
    }

    /**
     * {@code PATCH /api/v1/auth/me} (cần đăng nhập): cập nhật một phần hồ sơ (họ tên, điện thoại, email, mật khẩu).
     *
     * @param authentication đối tượng xác thực của Spring Security
     * @param request        {@link ProfileUpdateRequest}
     * @return {@code 200 OK} với {@link ProfileResponse} sau khi cập nhật
     * @throws BusinessException {@code PASSWORD_POLICY}, {@code PASSWORD_NOT_SET}, {@code EMAIL_ALREADY_EXISTS}, ...
     */
    @PatchMapping("/me")
    public ResponseEntity<ProfileResponse> updateMe(
            org.springframework.security.core.Authentication authentication,
            @Valid @RequestBody ProfileUpdateRequest request) {
        return ResponseEntity.ok(authService.updateCurrentUser(authentication, request));
    }
}
