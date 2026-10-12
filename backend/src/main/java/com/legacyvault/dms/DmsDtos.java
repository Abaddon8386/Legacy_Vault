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

	public record Response(UUID vaultId, String status, int checkIntervalDays, String lastCheckInAt,
			String nextCheckAt, String triggeredAt, String graceDeadline) {
		public static Response from(UUID vaultId, DmsConfig config) {
			return new Response(vaultId, config.getStatus(), config.getCheckIntervalDays(), utc(config.getLastCheckInAt()),
					utc(config.getNextCheckAt()), utc(config.getTriggeredAt()), utc(config.getGraceDeadline()));
		}
	}

	private static String utc(LocalDateTime value) {
		return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
	}
}
