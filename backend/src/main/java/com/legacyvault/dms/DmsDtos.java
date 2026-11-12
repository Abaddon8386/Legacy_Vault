package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Nhóm DTO của API DMS ({@code /api/v1/dms}): {@link ConfigureRequest} (request cấu hình), bộ giải mã nghiêm ngặt
 * {@link ConfigureDeserializer} và {@link Response} (phản hồi).
 */
public final class DmsDtos {
	/** Lớp tiện ích chỉ chứa các kiểu lồng nhau, không cho tạo thể hiện. */
	private DmsDtos() { }

	/**
	 * Request cấu hình DMS ({@code PUT /api/v1/dms}), giải mã bằng {@link ConfigureDeserializer}.
	 *
	 * <ul>
	 *   <li>{@code checkIntervalDays}: chu kỳ check-in theo ngày (1..180 theo {@link DmsPolicy});</li>
	 *   <li>{@code checkIntervalMinutes}: chu kỳ theo phút (1..259200); phải gửi đúng MỘT trong hai trường chu kỳ;</li>
	 *   <li>{@code gracePeriodDays}: gia hạn theo ngày (0..30), tùy chọn;</li>
	 *   <li>{@code gracePeriodMinutes}: gia hạn theo phút, tùy chọn; không được gửi cùng {@code gracePeriodDays}.</li>
	 * </ul>
	 */
	@tools.jackson.databind.annotation.JsonDeserialize(using = ConfigureDeserializer.class)
	public record ConfigureRequest(Integer checkIntervalDays, Integer checkIntervalMinutes, Integer gracePeriodDays, Integer gracePeriodMinutes) {
		/** Constructor tiện lợi chỉ có chu kỳ (ngày/phút), không có gia hạn. */
		public ConfigureRequest(Integer checkIntervalDays, Integer checkIntervalMinutes) { this(checkIntervalDays, checkIntervalMinutes, null, null); }
		/** Constructor tiện lợi chỉ có chu kỳ theo ngày. */
		public ConfigureRequest(Integer checkIntervalDays) { this(checkIntervalDays, null, null, null); }
	}

	/**
	 * Reject fractional/coerced numbers, unknown units/fields and duplicate duration fields.
	 * Bộ giải mã JSON tùy chỉnh: chỉ chấp nhận một object với 4 trường số nguyên đã biết, mỗi trường tối đa một lần,
	 * giá trị vừa trong 31 bit; mọi sai lệch ném {@code MismatchedInputException} (bị
	 * {@code GlobalExceptionHandler} đổi thành 400 {@code MALFORMED_REQUEST}).
	 */
	public static class ConfigureDeserializer extends tools.jackson.databind.ValueDeserializer<ConfigureRequest> {
		/** Đọc từng trường của object JSON, kiểm tra tên/kiểu/tràn số rồi dựng {@link ConfigureRequest}. */
		@Override public ConfigureRequest deserialize(tools.jackson.core.JsonParser parser,
				tools.jackson.databind.DeserializationContext context) {
			if (!parser.isExpectedStartObjectToken()) throw tools.jackson.databind.exc.MismatchedInputException.from(parser, ConfigureRequest.class, "Expected DMS object");
			Integer days = null, minutes = null, graceDays = null, graceMinutes = null;
			var seen = new java.util.HashSet<String>();
			while (parser.nextToken() != tools.jackson.core.JsonToken.END_OBJECT) {
				String field = parser.currentName(); parser.nextToken();
				if (!java.util.Set.of("checkIntervalDays", "checkIntervalMinutes", "gracePeriodDays", "gracePeriodMinutes").contains(field) || !seen.add(field)
						|| parser.currentToken() != tools.jackson.core.JsonToken.VALUE_NUMBER_INT)
					throw tools.jackson.databind.exc.MismatchedInputException.from(parser, ConfigureRequest.class, "Invalid DMS duration field");
				var value = parser.getBigIntegerValue();
				if (value.bitLength() > 31) throw tools.jackson.databind.exc.MismatchedInputException.from(parser, ConfigureRequest.class, "DMS duration overflow");
				switch (field) {
					case "checkIntervalDays" -> days = value.intValue();
					case "checkIntervalMinutes" -> minutes = value.intValue();
					case "gracePeriodDays" -> graceDays = value.intValue();
					default -> graceMinutes = value.intValue();
				}
			}
			return new ConfigureRequest(days, minutes, graceDays, graceMinutes);
		}
	}

	/**
	 * Phản hồi cấu hình DMS (cho PUT/GET/check-in). Thời gian là chuỗi ISO-8601 UTC.
	 *
	 * <ul>
	 *   <li>{@code ownerId}: UUID công khai của chủ két;</li>
	 *   <li>{@code status}: {@code MONITORING}, {@code TRIGGERED} hoặc {@code GRACE_PERIOD_EXCEEDED};</li>
	 *   <li>{@code checkIntervalDays}: chu kỳ theo ngày (null nếu không chia hết);</li>
	 *   <li>{@code checkIntervalMinutes}: chu kỳ theo phút;</li>
	 *   <li>{@code gracePeriodDays}, {@code gracePeriodMinutes}: thời gian gia hạn;</li>
	 *   <li>{@code lastCheckInAt}, {@code nextCheckAt}: lần check-in gần nhất và hạn kế tiếp;</li>
	 *   <li>{@code triggeredAt}, {@code graceDeadline}: lúc kích hoạt và hạn cuối gia hạn (null nếu chưa);</li>
	 *   <li>{@code updatedAt}: lần cập nhật cuối.</li>
	 * </ul>
	 */
	public record Response(UUID ownerId, String status, Integer checkIntervalDays, int checkIntervalMinutes, int gracePeriodDays, int gracePeriodMinutes,
			String lastCheckInAt, String nextCheckAt, String triggeredAt, String graceDeadline, String updatedAt) {
		/** Dựng phản hồi từ entity {@link DmsConfig}, đổi các mốc thời gian sang chuỗi UTC. */
		public static Response from(UUID ownerId, DmsConfig config) {
			return new Response(ownerId, config.getStatus(), config.getCheckIntervalDays(), config.getCheckIntervalMinutes(), config.getGracePeriodDays(), config.getGracePeriodMinutes(),
					utc(config.getLastCheckInAt()), utc(config.getNextCheckAt()), utc(config.getTriggeredAt()),
					utc(config.getGraceDeadline()), utc(config.getUpdatedAt()));
		}
	}

	/** Đổi {@link LocalDateTime} (UTC) sang chuỗi ISO-8601 {@code Instant}; null giữ nguyên null. */
	private static String utc(LocalDateTime value) {
		return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
	}
}
