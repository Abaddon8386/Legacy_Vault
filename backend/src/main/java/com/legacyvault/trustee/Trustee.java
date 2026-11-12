package com.legacyvault.trustee;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.vault.entity.Vault;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Entity ánh xạ bảng {@code dbo.trustees}: người được Owner bổ nhiệm để Staff liên hệ khi xác minh (ST-04). Mỗi Vault có tối đa một Trustee
 * trạng thái {@code APPOINTED}; thu hồi chuyển sang {@code REVOKED}. Quản lý bởi {@code TrusteeService}, Staff đọc qua
 * {@code CaseContactService} / {@code TrusteeContactService}.
 */
@Entity
@Table(name = "trustees", schema = "dbo")
public class Trustee {

	/**
	 * Khóa chính nội bộ ({@code trustee_id}).
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "trustee_id")
	private Long id;

	/**
	 * Id công khai, sinh trong {@link #onCreate()}.
	 */
	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	/**
	 * Vault mà Trustee được bổ nhiệm (nạp lười).
	 */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "vault_id", nullable = false)
	private Vault vault;

	/**
	 * Họ tên Trustee.
	 */
	@Column(name = "full_name", nullable = false, length = 150)
	private String fullName;

	/**
	 * Số điện thoại (có thể null nếu có email).
	 */
	@Column(name = "phone_number", length = 20)
	private String phone;

	/**
	 * Email (có thể null nếu có số điện thoại), đã chuẩn hóa chữ thường.
	 */
	@Column(name = "email", length = 254)
	private String email;

	/**
	 * Quan hệ với Owner.
	 */
	@Column(name = "relationship_to_owner", length = 100)
	private String relationship;

	/**
	 * Ghi chú tùy chọn.
	 */
	@Column(name = "note", length = 500)
	private String note;

	/**
	 * Trạng thái: {@code APPOINTED} hoặc {@code REVOKED}.
	 */
	@Column(name = "status", nullable = false, length = 20)
	private String status;

	/**
	 * Thời điểm bổ nhiệm (UTC).
	 */
	@Column(name = "appointed_at", nullable = false)
	private LocalDateTime appointedAt;

	/**
	 * Thời điểm thu hồi (UTC), null nếu chưa.
	 */
	@Column(name = "revoked_at")
	private LocalDateTime revokedAt;

	/**
	 * Thời điểm cập nhật gần nhất (UTC).
	 */
	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	/**
	 * Constructor không tham số cho JPA.
	 */
	protected Trustee() {
	}

	/**
	 * Tạo Trustee mới ở trạng thái {@code APPOINTED}.
	 *
	 * @param vault Vault được bổ nhiệm
	 * @param fullName họ tên
	 * @param phone điện thoại
	 * @param email email
	 * @param relationship quan hệ với Owner
	 * @param note ghi chú
	 */
	public Trustee(Vault vault, String fullName, String phone, String email, String relationship, String note) {
		this.vault = vault;
		this.fullName = fullName;
		this.phone = phone;
		this.email = email;
		this.relationship = relationship;
		this.note = note;
		this.status = "APPOINTED";
	}

	/**
	 * Callback JPA: sinh {@code publicId} và đặt {@code appointedAt}/{@code updatedAt} nếu chưa có.
	 */
	@PrePersist
	void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		if (publicId == null) publicId = UUID.randomUUID();
		if (appointedAt == null) appointedAt = now;
		if (updatedAt == null) updatedAt = now;
	}

	/**
	 * Callback JPA: cập nhật {@code updatedAt} (UTC).
	 */
	@PreUpdate
	void onUpdate() {
		updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	/**
	 * Cập nhật thông tin liên hệ của Trustee.
	 *
	 * @param fullName họ tên
	 * @param phone điện thoại
	 * @param email email
	 * @param relationship quan hệ
	 * @param note ghi chú
	 */
	public void update(String fullName, String phone, String email, String relationship, String note) {
		this.fullName = fullName;
		this.phone = phone;
		this.email = email;
		this.relationship = relationship;
		this.note = note;
	}

	/**
	 * Thu hồi Trustee: đặt trạng thái {@code REVOKED} và thời điểm thu hồi.
	 *
	 * @param at thời điểm thu hồi (UTC)
	 */
	public void revoke(LocalDateTime at) {
		this.status = "REVOKED";
		this.revokedAt = at;
	}

	/**
	 * @return khóa chính nội bộ
	 */
	public Long getId() { return id; }
	/**
	 * @return id công khai
	 */
	public UUID getPublicId() { return publicId; }
	/**
	 * @return Vault được bổ nhiệm
	 */
	public Vault getVault() { return vault; }
	/**
	 * @return họ tên
	 */
	public String getFullName() { return fullName; }
	/**
	 * @return điện thoại
	 */
	public String getPhone() { return phone; }
	/**
	 * @return email
	 */
	public String getEmail() { return email; }
	/**
	 * @return quan hệ với Owner
	 */
	public String getRelationship() { return relationship; }
	/**
	 * @return ghi chú
	 */
	public String getNote() { return note; }
	/**
	 * @return trạng thái APPOINTED / REVOKED
	 */
	public String getStatus() { return status; }
	/**
	 * @return thời điểm bổ nhiệm (UTC)
	 */
	public LocalDateTime getAppointedAt() { return appointedAt; }
	/**
	 * @return thời điểm thu hồi (UTC) hoặc null
	 */
	public LocalDateTime getRevokedAt() { return revokedAt; }
	/**
	 * @return thời điểm cập nhật gần nhất (UTC)
	 */
	public LocalDateTime getUpdatedAt() { return updatedAt; }
}
