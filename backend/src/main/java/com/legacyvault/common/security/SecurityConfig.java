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
 * Khung bảo mật tối thiểu của PS-74: chứng minh 401/403 trả đúng JSON lỗi chung.
 * Xác thực JWT, role VAULT_OWNER... thuộc PS-10/PS-11, mở rộng file này (không viết lại).
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

	private final JwtAuthenticationFilter jwtAuthenticationFilter;

	public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
		this.jwtAuthenticationFilter = jwtAuthenticationFilter;
	}

	/** Đường dẫn công khai (không cần đăng nhập). Thêm đường dẫn mới = cập nhật docs/api-contracts. */
	private static final String[] PUBLIC_PATHS = {
			"/api/v1/auth/register",
			"/api/v1/auth/login",
			"/api/v1/system/ping",
			"/api/v1/system/db-check" // chỉ tồn tại khi chạy profile "dev"
	};

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, ApiAuthenticationEntryPoint entryPoint,
			ApiAccessDeniedHandler accessDeniedHandler) throws Exception {
		http
				// API stateless dùng Bearer token trong header, không dùng cookie phiên -> CSRF không áp dụng.
				// Nếu sau này chọn refresh token bằng cookie thì phải bật lại biện pháp chống CSRF cho endpoint đó.
				.csrf(csrf -> csrf.disable())
				.cors(cors -> { })
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
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
	 * PS-10/PS-11 thay bean này bằng UserDetailsService đọc từ DB.
	 */
	@Bean
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
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}
}
