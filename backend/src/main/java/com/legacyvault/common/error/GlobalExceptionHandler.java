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

import jakarta.servlet.http.HttpServletRequest;

/**
 * Bắt mọi exception phát sinh trong tầng controller và đổi thành JSON lỗi chung.
 * Chi tiết kỹ thuật chỉ ghi vào log phía server (kèm traceId), không bao giờ trả cho client.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {
	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
	private final ApiErrorFactory factory;

	public GlobalExceptionHandler(ApiErrorFactory factory) {
		this.factory = factory;
	}

	@ExceptionHandler(BusinessException.class)
	ResponseEntity<ApiError> handleBusiness(BusinessException ex, HttpServletRequest request) {
		ErrorCode code = ex.getErrorCode();
		return respond(factory.create(request, code, List.of(), ex.getArgs()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
		return respond(factory.validation(request, ex.getBindingResult()));
	}

	@ExceptionHandler(HandlerMethodValidationException.class)
	ResponseEntity<ApiError> handleMethodValidation(HandlerMethodValidationException ex, HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.VALIDATION_FAILED, List.of()));
	}

	@ExceptionHandler({ HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
			MethodArgumentTypeMismatchException.class })
	ResponseEntity<ApiError> handleMalformed(Exception ex, HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.MALFORMED_REQUEST, List.of()));
	}

	@ExceptionHandler(HttpRequestMethodNotSupportedException.class)
	ResponseEntity<ApiError> handleMethodNotAllowed(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.METHOD_NOT_ALLOWED, List.of()));
	}

	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	ResponseEntity<ApiError> handleUnsupportedMedia(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.UNSUPPORTED_MEDIA_TYPE, List.of()));
	}

	@ExceptionHandler(MaxUploadSizeExceededException.class)
	ResponseEntity<ApiError> handleTooLarge(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.PAYLOAD_TOO_LARGE, List.of()));
	}

	@ExceptionHandler(NoResourceFoundException.class)
	ResponseEntity<ApiError> handleNotFound(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.RESOURCE_NOT_FOUND, List.of()));
	}

	/**
	 * AccessDeniedException ném từ @PreAuthorize (tầng method) chạy vào đây chứ không tới
	 * AccessDeniedHandler của filter; nếu không bắt riêng sẽ bị Exception.class biến thành 500.
	 */
	@ExceptionHandler(AccessDeniedException.class)
	ResponseEntity<ApiError> handleAccessDenied(HttpServletRequest request) {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		boolean anonymous = authentication == null || authentication instanceof AnonymousAuthenticationToken;
		return respond(factory.create(request, anonymous ? ErrorCode.UNAUTHENTICATED : ErrorCode.ACCESS_DENIED,
				List.of()));
	}

	@ExceptionHandler(AuthenticationException.class)
	ResponseEntity<ApiError> handleAuthentication(HttpServletRequest request) {
		return respond(factory.create(request, ErrorCode.UNAUTHENTICATED, List.of()));
	}

	/** Lưới an toàn cuối cùng: client chỉ thấy thông điệp chung, chi tiết nằm trong log theo traceId. */
	@ExceptionHandler(Exception.class)
	ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
		ApiError body = factory.create(request, ErrorCode.INTERNAL_ERROR, List.of());
		log.error("Unhandled exception, traceId={}", body.traceId(), ex);
		return respond(body);
	}

	private ResponseEntity<ApiError> respond(ApiError body) {
		return ResponseEntity.status(body.status()).contentType(MediaType.APPLICATION_JSON).body(body);
	}
}
