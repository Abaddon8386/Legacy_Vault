package com.legacyvault.trustee;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * DTO và enum của API kết quả liên hệ Trustee (Staff, ST-10).
 */
public final class TrusteeContactDtos {

	/**
	 * Lớp tiện ích, không khởi tạo.
	 */
	private TrusteeContactDtos() { }

	/**
	 * Kênh liên hệ: điện thoại, email, gặp trực tiếp, khác.
	 */
	public enum Channel { PHONE, EMAIL, IN_PERSON, OTHER }
	/**
	 * Kết quả liên hệ: đã liên lạc được, không phản hồi, thông tin liên hệ không hợp lệ.
	 */
	public enum Outcome { CONTACTED, NO_RESPONSE, INVALID_CONTACT }
	/**
	 * Trạng thái phương án dự phòng: không cần, cần, đang thực hiện, đã hoàn tất.
	 */
	public enum FallbackStatus { NOT_REQUIRED, REQUIRED, IN_PROGRESS, COMPLETED }

	/**
	 * Body ghi kết quả liên hệ.
	 *
	 * <ul>
	 * <li>{@code channel} - kênh liên hệ, bắt buộc</li>
	 * <li>{@code outcome} - kết quả, bắt buộc</li>
	 * <li>{@code fallbackStatus} - trạng thái dự phòng, bắt buộc</li>
	 * <li>{@code note} - ghi chú tùy chọn, tối đa 500 ký tự</li>
	 * </ul>
	 */
	public record RecordRequest(@NotNull(message = "validation.NotNull") Channel channel,
			@NotNull(message = "validation.NotNull") Outcome outcome,
			@NotNull(message = "validation.NotNull") FallbackStatus fallbackStatus,
			@Size(max = 500, message = "validation.Size") String note) { }

	/**
	 * Một bản ghi kết quả liên hệ.
	 *
	 * <ul>
	 * <li>{@code id} - public id bản ghi; {@code trusteeId} - public id Trustee</li>
	 * <li>{@code channel}, {@code outcome}, {@code fallbackStatus}, {@code note}</li>
	 * <li>{@code occurredAt} - thời điểm ghi (ISO-8601 UTC)</li>
	 * </ul>
	 */
	public record RecordResponse(UUID id, UUID trusteeId, Channel channel, Outcome outcome,
			FallbackStatus fallbackStatus, String note, String occurredAt) {
		/**
		 * Dựng response từ entity {@link TrusteeContactRecord}.
		 */
		static RecordResponse from(TrusteeContactRecord record) {
			return new RecordResponse(record.getPublicId(), record.getTrustee().getPublicId(),
					Channel.valueOf(record.getChannel()), Outcome.valueOf(record.getOutcome()),
					FallbackStatus.valueOf(record.getFallbackStatus()), record.getNote(), utc(record.getOccurredAt()));
		}
		/**
		 * Chuyển thời gian UTC sang chuỗi ISO-8601; null giữ nguyên.
		 */
		private static String utc(LocalDateTime value) {
			return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
		}
	}
}
