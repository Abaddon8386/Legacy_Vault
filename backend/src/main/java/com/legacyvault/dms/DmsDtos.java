package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public final class DmsDtos {
	private DmsDtos() { }

	public record ConfigureRequest(@NotNull(message = "validation.NotNull")
			@Min(value = 1, message = "validation.Min") @Max(value = 32767, message = "validation.Max")
			Integer checkIntervalDays) { }

	public record Response(UUID ownerId, String status, int checkIntervalDays, int gracePeriodDays,
			String lastCheckInAt, String nextCheckAt, String triggeredAt, String graceDeadline, String updatedAt) {
		public static Response from(UUID ownerId, DmsConfig config) {
			return new Response(ownerId, config.getStatus(), config.getCheckIntervalDays(), config.getGracePeriodDays(),
					utc(config.getLastCheckInAt()), utc(config.getNextCheckAt()), utc(config.getTriggeredAt()),
					utc(config.getGraceDeadline()), utc(config.getUpdatedAt()));
		}
	}

	private static String utc(LocalDateTime value) {
		return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
	}
}
