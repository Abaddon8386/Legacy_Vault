package com.legacyvault.common.support;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Controller giả chỉ nằm trong test, để kiểm tra hợp đồng lỗi mà không phụ thuộc PS-9..PS-23. */
@RestController
@RequestMapping("/api/v1/test")
public class TestSupportController {

	public record SampleRequest(
			@NotBlank String name,
			@Email @NotBlank String email,
			@Size(min = 8) String password) {
	}

	@PostMapping("/validate")
	public String validate(@Valid @RequestBody SampleRequest request) {
		return "ok";
	}

	@GetMapping("/private")
	public String privateEndpoint() {
		return "ok";
	}

	@GetMapping("/admin")
	@PreAuthorize("hasRole('ADMIN')")
	public String adminOnly() {
		return "ok";
	}

	@GetMapping("/business")
	public String business() {
		throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
	}

	@GetMapping("/boom")
	public String boom() {
		throw new IllegalStateException("SELECT * FROM secret_table WHERE password='hunter2'");
	}
}
