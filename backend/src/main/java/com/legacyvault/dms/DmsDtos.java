package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public final class DmsDtos {
	private DmsDtos() { }

	@tools.jackson.databind.annotation.JsonDeserialize(using = ConfigureDeserializer.class)
	public record ConfigureRequest(Integer checkIntervalDays, Integer checkIntervalMinutes, Integer gracePeriodDays, Integer gracePeriodMinutes) {
		public ConfigureRequest(Integer checkIntervalDays, Integer checkIntervalMinutes) { this(checkIntervalDays, checkIntervalMinutes, null, null); }
		public ConfigureRequest(Integer checkIntervalDays) { this(checkIntervalDays, null, null, null); }
	}

	/** Reject fractional/coerced numbers, unknown units/fields and duplicate duration fields. */
	public static class ConfigureDeserializer extends tools.jackson.databind.ValueDeserializer<ConfigureRequest> {
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

	public record Response(UUID ownerId, String status, Integer checkIntervalDays, int checkIntervalMinutes, int gracePeriodDays, int gracePeriodMinutes,
			String lastCheckInAt, String nextCheckAt, String triggeredAt, String graceDeadline, String updatedAt) {
		public static Response from(UUID ownerId, DmsConfig config) {
			return new Response(ownerId, config.getStatus(), config.getCheckIntervalDays(), config.getCheckIntervalMinutes(), config.getGracePeriodDays(), config.getGracePeriodMinutes(),
					utc(config.getLastCheckInAt()), utc(config.getNextCheckAt()), utc(config.getTriggeredAt()),
					utc(config.getGraceDeadline()), utc(config.getUpdatedAt()));
		}
	}

	private static String utc(LocalDateTime value) {
		return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
	}
}
