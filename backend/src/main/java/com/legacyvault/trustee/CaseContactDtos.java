package com.legacyvault.trustee;

import java.util.List;
import java.util.UUID;

/**
 * DTO của API liên hệ hồ sơ: những gì Staff được đọc về người cần liên lạc trước khi nhận tài liệu trên hồ sơ OPEN được giao — Trustee
 * đã bổ nhiệm và các Beneficiary, kèm điện thoại và email. {@code canRecord} cho biết có thể ghi kết quả liên hệ qua API
 * contact-outcome của Trustee hay không; liên hệ Beneficiary chưa có bản ghi như vậy.
 */
public final class CaseContactDtos {

	/**
	 * Lớp tiện ích, không khởi tạo.
	 */
	private CaseContactDtos() { }

	/**
	 * Giá trị {@code kind} cho Trustee.
	 */
	public static final String TRUSTEE = "TRUSTEE";
	/**
	 * Giá trị {@code kind} cho Beneficiary.
	 */
	public static final String BENEFICIARY = "BENEFICIARY";

	/**
	 * Một người cần liên lạc.
	 *
	 * <ul>
	 * <li>{@code kind} - {@code TRUSTEE} hoặc {@code BENEFICIARY}</li>
	 * <li>{@code id} - public id của Trustee / Beneficiary</li>
	 * <li>{@code fullName}, {@code relationship}, {@code phone}, {@code email} - thông tin liên hệ</li>
	 * <li>{@code canRecord} - true với Trustee (ghi được kết quả liên hệ), false với Beneficiary</li>
	 * <li>{@code contacts} - lịch sử liên hệ (chỉ Trustee, mới nhất trước)</li>
	 * </ul>
	 */
	public record Person(String kind, UUID id, String fullName, String relationship, String phone, String email,
			boolean canRecord, List<TrusteeContactDtos.RecordResponse> contacts) { }

	/**
	 * Response của API liên hệ hồ sơ.
	 *
	 * <ul>
	 * <li>{@code caseId} - public id hồ sơ</li>
	 * <li>{@code people} - danh sách người cần liên lạc (Trustee trước, rồi Beneficiary)</li>
	 * </ul>
	 */
	public record Response(UUID caseId, List<Person> people) { }
}
