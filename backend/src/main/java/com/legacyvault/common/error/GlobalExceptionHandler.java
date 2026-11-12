package com.legacyvault.common.error;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.validation.ConstraintViolationException;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Bắt mọi exception phát sinh trong tầng controller và đổi thành JSON lỗi chung.
 * Chi tiết kỹ thuật chỉ ghi vào log phía server (kèm traceId), không bao giờ trả cho client.
 *
 * <p>Dùng {@link ApiErrorFactory} để dựng {@link ApiError}. Ánh xạ chính: {@link BusinessException} theo
 * {@link ErrorCode} của nó; lỗi validation và request sai định dạng thành 400; sai method 405; sai media type 415;
 * file quá lớn 413; không tìm thấy 404; thiếu quyền 403 (hoặc 401 nếu ẩn danh); lỗi DB trigger khóa két (mã
 * 51300) thành {@code VAULT_NOT_EDITABLE}; còn lại thành 500.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {
	/** Logger ghi chi tiết lỗi không lường trước (kèm traceId). */
	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
	private final ApiErrorFactory factory;

	/** Nhận {@link ApiErrorFactory} để dựng phản hồi lỗi. */
	public GlobalExceptionHandler(ApiErrorFactory factory) {
		this.factory = factory;
	}

    /**
     * Xử lý vượt giới hạn khôi phục mật khẩu: trả 429 {@code RATE_LIMITED} kèm header {@code Retry-After: 900} và
     * {@code Cache-Control: no-store}.
     */
    @ExceptionHandler(com.legacyvault.auth.recovery.PasswordRecoveryController.Limited.class)
    ResponseEntity<ApiError> handleRecoveryLimit(HttpServletRequest request) {
        return ResponseEntity.status(429).header("Retry-After", "900").header("Cache-Control", "no-store")
                .body(factory.create(request, ErrorCode.RATE_LIMITED, List.of()));
    }

	/**
	 * Xử lý {@link BusinessException}: dựng lỗi theo {@link ErrorCode} và tham số của exception. Với đường dẫn
	 * {@code /api/v1/auth/password-recovery/*} thêm header {@code Cache-Control: no-store}.
	 */
	@ExceptionHandler(BusinessException.class)
	ResponseEntity<ApiError> handleBusiness(BusinessException ex, HttpServletRequest request) {
		ErrorCode code = ex.getErrorCode();
        if (request.getRequestURI().startsWith("/api/v1/auth/password-recovery/"))
            return ResponseEntity.status(code.status()).header("Cache-Control", "no-store")
                    .body(factory.create(request, code, List.of(), ex.getArgs()));
		return respond(factory.create(request, code, List.of(), ex.getArgs()));
	}

	/** Lỗi Bean Validation trên {@code @RequestBody}: trả 400 {@code VALIDATION_FAILED} kèm lỗi từng trường. */
	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
		return respond(factory.validation(request, ex.getBindingResult()));
	}

	/** Lỗi validation ở tham số method (path/query): trả 400 {@code VALIDATION_FAILED}. */
	@ExceptionHandler({ HandlerMethodValidationException.class, ConstraintViolationException.class })
	ResponseEntity<ApiError> handleMethodValidation(Exception ex, HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.VALIDATION_FAILED, List.of()));
	}

	/*
	 * Xử lý request sai định dạng (JSON hỏng, thiếu tham số/header bắt buộc, sai kiểu tham số): 400 MALFORMED_REQUEST.
	 */
	// A required request header that is absent (for example Idempotency-Key) is a client error, not a server fault.
	@ExceptionHandler({ HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
			org.springframework.web.bind.MissingRequestHeaderException.class, MethodArgumentTypeMismatchException.class })
	ResponseEntity<ApiError> handleMalformed(Exception ex, HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.MALFORMED_REQUEST, List.of()));
	}

	/** Sai HTTP method: trả 405 {@code METHOD_NOT_ALLOWED}. */
	@ExceptionHandler(HttpRequestMethodNotSupportedException.class)
	ResponseEntity<ApiError> handleMethodNotAllowed(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.METHOD_NOT_ALLOWED, List.of()));
	}

	/** Content-Type không được hỗ trợ: trả 415 {@code UNSUPPORTED_MEDIA_TYPE}. */
	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	ResponseEntity<ApiError> handleUnsupportedMedia(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.UNSUPPORTED_MEDIA_TYPE, List.of()));
	}

	/** File tải lên vượt giới hạn: trả 413 {@code PAYLOAD_TOO_LARGE}. */
	@ExceptionHandler(MaxUploadSizeExceededException.class)
	ResponseEntity<ApiError> handleTooLarge(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.PAYLOAD_TOO_LARGE, List.of()));
	}

	/** Không có endpoint/tài nguyên tĩnh khớp đường dẫn: trả 404 {@code RESOURCE_NOT_FOUND}. */
	@ExceptionHandler(NoResourceFoundException.class)
	ResponseEntity<ApiError> handleNotFound(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.RESOURCE_NOT_FOUND, List.of()));
	}

	/**
	 * AccessDeniedException ném từ @PreAuthorize (tầng method) chạy vào đây chứ không tới
	 * AccessDeniedHandler của filter; nếu không bắt riêng sẽ bị Exception.class biến thành 500.
	 * Người dùng ẩn danh nhận 401 {@code UNAUTHENTICATED}, người đã đăng nhập nhận 403 {@code ACCESS_DENIED}.
	 */
	@ExceptionHandler(AccessDeniedException.class)
	ResponseEntity<ApiError> handleAccessDenied(HttpServletRequest request) {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		boolean anonymous = authentication == null || authentication instanceof AnonymousAuthenticationToken;
		return respond(factory.create(request, anonymous ? ErrorCode.UNAUTHENTICATED : ErrorCode.ACCESS_DENIED,
				List.of()));
	}

	/** Lỗi xác thực của Spring Security: trả 401 {@code UNAUTHENTICATED}. */
	@ExceptionHandler(AuthenticationException.class)
	ResponseEntity<ApiError> handleAuthentication(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.UNAUTHENTICATED, List.of()));
	}

	/**
	 * SQL Server archive trigger errors are classified by numeric code, never message text.
	 * Duyệt chuỗi nguyên nhân tìm {@link java.sql.SQLException} có mã 51300 (trigger chặn ghi vào két đã lưu trữ)
	 * thì trả 409 {@code VAULT_NOT_EDITABLE}; lỗi DB khác chuyển cho {@link #handleUnexpected}.
	 */
	@ExceptionHandler(org.springframework.dao.DataAccessException.class)
	ResponseEntity<ApiError> handleDatabaseWrite(org.springframework.dao.DataAccessException ex, HttpServletRequest request) {
		for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
			if (cause instanceof java.sql.SQLException sql && sql.getErrorCode() == 51300)
				return respond(factory.create(request, ErrorCode.VAULT_NOT_EDITABLE, List.of()));
		}
		return handleUnexpected(ex, request);
	}

	/**
	 * Lưới an toàn cuối cùng: client chỉ thấy thông điệp chung (500 {@code INTERNAL_ERROR}), chi tiết nằm trong log
	 * theo traceId.
	 */
	@ExceptionHandler(Exception.class)
	ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
		ApiError body = factory.create(request, ErrorCode.INTERNAL_ERROR, List.of());
		log.error("Unhandled exception, traceId={}", body.traceId(), ex);
		return respond(body);
	}

	/** Đóng gói {@link ApiError} thành {@link ResponseEntity} JSON với status tương ứng. */
	private ResponseEntity<ApiError> respond(ApiError body) {
		return ResponseEntity.status(body.status()).contentType(MediaType.APPLICATION_JSON).body(body);
	}
}
