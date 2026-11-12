package com.legacyvault.common.security;

import java.util.List;

import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Cấu hình bảo mật: API stateless, 401/403 trả JSON lỗi chung, phân quyền theo đường dẫn/role.
 * Xác thực Bearer JWT nằm ở {@link JwtAuthenticationFilter}.
 *
 * <p>Quy tắc phân quyền: các đường dẫn trong {@code PUBLIC_PATHS} và IPN VNPay công khai; {@code /api/v1/vaults/**},
 * {@code /api/v1/trustees/**}, {@code /api/v1/dms/**} yêu cầu {@code VAULT_OWNER}; {@code /api/v1/admin/**} yêu cầu
 * {@code ADMIN}; còn lại cần đăng nhập (kiểm tra role chi tiết bằng {@code @PreAuthorize} ở controller).
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

	/** Filter xác thực JWT được chèn vào chuỗi filter. */
	private final JwtAuthenticationFilter jwtAuthenticationFilter;

	/** Nhận filter JWT. */
	public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
		this.jwtAuthenticationFilter = jwtAuthenticationFilter;
	}

	/** Đường dẫn công khai (không cần đăng nhập). Thêm đường dẫn mới = cập nhật docs/api-contracts. */
	private static final String[] PUBLIC_PATHS = {
			"/api/v1/auth/register",
			"/api/v1/auth/login",
			"/api/v1/auth/google",
            "/api/v1/auth/password-recovery/requests",
            "/api/v1/auth/password-recovery/reset",
            "/api/v1/auth/email-verification/confirm",
			"/api/v1/system/ping",
			"/api/v1/system/db-check" // chỉ tồn tại khi chạy profile "dev"
	};

	@Bean
	/**
	 * Dựng chuỗi filter bảo mật: tắt CSRF (API stateless dùng Bearer), bật CORS theo
	 * {@link #corsConfigurationSource}, không tạo session, khai báo luật phân quyền theo đường dẫn, gắn entry point
	 * 401 / handler 403 JSON và chèn {@link JwtAuthenticationFilter}.
	 */
	SecurityFilterChain securityFilterChain(HttpSecurity http, ApiAuthenticationEntryPoint entryPoint,
			ApiAccessDeniedHandler accessDeniedHandler) throws Exception {
		http
				// API stateless dùng Bearer token trong header, không dùng cookie phiên -> CSRF không áp dụng.
				// Nếu sau này chọn refresh token bằng cookie thì phải bật lại biện pháp chống CSRF cho endpoint đó.
				.csrf(csrf -> csrf.disable())
				.cors(cors -> { })
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(HttpMethod.GET, "/api/v1/payments/vnpay/ipn").permitAll()
						.requestMatchers(HttpMethod.OPTIONS, "/api/**").permitAll()
						.requestMatchers(PUBLIC_PATHS).permitAll()
						.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
						.requestMatchers("/api/v1/vaults/**").hasRole("VAULT_OWNER")
						.requestMatchers("/api/v1/trustees/**").hasRole("VAULT_OWNER")
						.requestMatchers("/api/v1/dms/**").hasRole("VAULT_OWNER")
						.requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
						.anyRequest().authenticated())
				.exceptionHandling(ex -> ex
						.authenticationEntryPoint(entryPoint)
						.accessDeniedHandler(accessDeniedHandler))
				.addFilterBefore(
						jwtAuthenticationFilter,
						org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class
				);
		return http.build();
	}

	/**
	 * Chặn Spring Boot tự sinh tài khoản "user" kèm mật khẩu ngẫu nhiên in ra log.
	 * Bean giữ lại có chủ đích: xác thực thật do JwtAuthenticationFilter xử lý, không tra cứu người dùng qua UserDetailsService.
	 */
	@Bean
	/**
	 * Chặn Spring Boot tự sinh tài khoản "user" kèm mật khẩu ngẫu nhiên in ra log.
	 * Bean giữ lại có chủ đích: xác thực thật do JwtAuthenticationFilter xử lý, không tra cứu người dùng qua UserDetailsService.
	 */
	UserDetailsService noUsersYet() {
		return username -> {
			throw new UsernameNotFoundException("User lookup is not implemented yet");
		};
	}

	/**
	 * CORS chỉ cho các origin khai báo trong legacyvault.cors.allowed-origins (mặc định rỗng = không origin nào).
	 * Khi dev dùng Vite proxy thì không cần CORS.
	 */
	@Bean
	/**
	 * CORS chỉ cho các origin khai báo trong legacyvault.cors.allowed-origins (mặc định rỗng = không origin nào).
	 * Khi dev dùng Vite proxy thì không cần CORS. Áp dụng cho {@code /api/**}; cho phép các method thông dụng, các header
	 * Authorization/Content-Type/Accept/Accept-Language và lộ header {@code X-Trace-Id}.
	 */
	CorsConfigurationSource corsConfigurationSource(
			@Value("${legacyvault.cors.allowed-origins:}") List<String> allowedOrigins) {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(allowedOrigins.stream().filter(origin -> !origin.isBlank()).toList());
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "Accept-Language"));
		config.setExposedHeaders(List.of("X-Trace-Id"));
		config.setMaxAge(3600L);
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/api/**", config);
		return source;
	}

	@Bean
	/** Bộ băm mật khẩu BCrypt dùng cho đăng ký, đăng nhập và xác nhận lại mật khẩu. */
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}
}
