package com.legacyvault.trustee;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class TrusteeContactDtos {

	private TrusteeContactDtos() { }

	public enum Channel { PHONE, EMAIL, IN_PERSON, OTHER }
	public enum Outcome { CONTACTED, NO_RESPONSE, INVALID_CONTACT }
	public enum FallbackStatus { NOT_REQUIRED, REQUIRED, IN_PROGRESS, COMPLETED }

	public record RecordRequest(@NotNull(message = "validation.NotNull") Channel channel,
			@NotNull(message = "validation.NotNull") Outcome outcome,
			@NotNull(message = "validation.NotNull") FallbackStatus fallbackStatus,
			@Size(max = 500, message = "validation.Size") String note) { }

	public record RecordResponse(UUID id, UUID trusteeId, Channel channel, Outcome outcome,
			FallbackStatus fallbackStatus, String note, String occurredAt) {
		static RecordResponse from(TrusteeContactRecord record) {
			return new RecordResponse(record.getPublicId(), record.getTrustee().getPublicId(),
					Channel.valueOf(record.getChannel()), Outcome.valueOf(record.getOutcome()),
					FallbackStatus.valueOf(record.getFallbackStatus()), record.getNote(), utc(record.getOccurredAt()));
		}
		private static String utc(LocalDateTime value) {
			return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
		}
	}
}
