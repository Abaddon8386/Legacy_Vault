package com.legacyvault.trustee;

import java.util.List;
import java.util.UUID;

/**
 * What Staff may read about the people to contact before receiving documents on an assigned OPEN case: the appointed
 * Trustee and the Beneficiaries, with their phone and email. {@code canRecord} says whether a contact outcome can be
 * recorded through the existing Trustee contact-outcome API; Beneficiary contacts have no such record yet.
 */
public final class CaseContactDtos {

	private CaseContactDtos() { }

	public static final String TRUSTEE = "TRUSTEE";
	public static final String BENEFICIARY = "BENEFICIARY";

	public record Person(String kind, UUID id, String fullName, String relationship, String phone, String email,
			boolean canRecord, List<TrusteeContactDtos.RecordResponse> contacts) { }

	public record Response(UUID caseId, List<Person> people) { }
}
