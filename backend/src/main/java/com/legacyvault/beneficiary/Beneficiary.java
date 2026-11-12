package com.legacyvault.beneficiary;

import java.time.LocalDate;
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
 * Thực thể JPA ánh xạ bảng {@code dbo.beneficiaries}: một người thụ hưởng (người nhận di sản) do chủ kho (Owner) chỉ định
 * trong một Vault, hoặc được tạo từ hồ sơ pháp lý của tòa án (BE-02).
 * <p>Dữ liệu nhạy cảm (số giấy tờ định danh) chỉ lưu dạng mã hóa AES-GCM qua {@code IdentityNumberCipher}.
 * Hồ sơ người thụ hưởng độc lập với tài khoản đăng nhập: việc liên kết tài khoản chỉ đổi {@code linked_user_id}
 * và {@code account_status}.
 * <p>Được dùng bởi {@code BeneficiaryService} (Owner CRUD), {@code BeneficiaryAccountService},
 * {@code IdentityVerificationService}, {@code CounterIdentityAttestationService}, {@code BeneficiaryInvitationService}...
 */
@Entity
@Table(name = "beneficiaries", schema = "dbo")
public class Beneficiary {

	/**
	 * Trạng thái xác minh danh tính: chưa được Staff xác minh trực tiếp tại quầy.
	 */
	public static final String NOT_VERIFIED = "NOT_VERIFIED";
	/**
	 * Trạng thái xác minh danh tính: Staff đã đối chiếu giấy tờ trực tiếp tại quầy (ST-14).
	 */
	public static final String VERIFIED_AT_COUNTER = "VERIFIED_AT_COUNTER";
	/**
	 * Trạng thái tài khoản: chưa liên kết với tài khoản đăng nhập nào.
	 */
	public static final String ACCOUNT_NOT_CREATED = "NOT_CREATED";
	/**
	 * Trạng thái tài khoản: đã liên kết với một tài khoản chính thức (đặt trong {@link #linkAccount(Long)}).
	 */
	public static final String ACCOUNT_CREATED = "ACCOUNT_CREATED";
	/**
	 * Nguồn gốc bản ghi: do chủ kho chỉ định (mặc định).
	 */
	public static final String ORIGIN_OWNER_DESIGNATED = "OWNER_DESIGNATED";
	/** BE-02: recipient named only by a Legal-reviewed court document (D-LEGAL-002), not by the Owner. */
	public static final String ORIGIN_COURT_DOCUMENT = "COURT_DOCUMENT";

	/**
	 * Khóa chính nội bộ (cột {@code beneficiary_id}, IDENTITY); không bao giờ lộ ra API, API dùng {@link #publicId}.
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "beneficiary_id")
	private Long id;

	/**
	 * Mã công khai (UUID) dùng làm định danh trong URL/JSON; được sinh ở {@link #onCreate()} nếu chưa có.
	 */
	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	/**
	 * Kho (Vault) mà người thụ hưởng này thuộc về (nạp lazy, bắt buộc).
	 */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "vault_id", nullable = false)
	private Vault vault;

	/**
	 * Id người dùng của tài khoản đã liên kết; {@code null} nếu chưa liên kết tài khoản.
	 */
	@Column(name = "linked_user_id")
	private Long linkedUserId;

	@Column(name = "full_name", nullable = false, length = 150)
	private String fullName;

	@Column(name = "email", length = 254)
	private String email;

	@Column(name = "phone_number", length = 20)
	private String phone;

	@Column(name = "identity_document_type", length = 30)
	private String identityDocumentType;

	/**
	 * Số giấy tờ định danh đã mã hóa (định dạng do {@code IdentityNumberCipher} tạo); {@code null} nếu chưa nhập.
	 */
	@Column(name = "identity_document_no_encrypted", length = 512)
	private byte[] identityNumberEncrypted;

	/**
	 * Trạng thái chỉ định (cột {@code designation_status}), khởi tạo là {@code DESIGNATED}.
	 */
	@Column(name = "designation_status", nullable = false, length = 20)
	private String status;

	/**
	 * Kết quả xác minh danh tính tại quầy: {@link #NOT_VERIFIED} hoặc {@link #VERIFIED_AT_COUNTER}.
	 */
	@Column(name = "id_verification_status", nullable = false, length = 30)
	private String identityVerificationStatus = NOT_VERIFIED;

	/**
	 * Trạng thái liên kết tài khoản: {@link #ACCOUNT_NOT_CREATED} hoặc {@link #ACCOUNT_CREATED}.
	 */
	@Column(name = "account_status", nullable = false, length = 30)
	private String accountStatus = ACCOUNT_NOT_CREATED;

	@Column(name = "created_at", nullable = false)
	private LocalDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	@Column(name = "date_of_birth")
	private LocalDate dateOfBirth;

	@Column(name = "relationship_to_owner", length = 100)
	private String relationship;

	/**
	 * Nguồn gốc bản ghi: {@link #ORIGIN_OWNER_DESIGNATED} hoặc {@link #ORIGIN_COURT_DOCUMENT}; không cập nhật được sau khi tạo.
	 */
	@Column(name = "origin", nullable = false, updatable = false, length = 30)
	private String origin = ORIGIN_OWNER_DESIGNATED;

	/**
	 * Id phiên bản hồ sơ pháp lý (dossier version) đã nêu tên người này; chỉ có giá trị khi {@code origin = COURT_DOCUMENT}.
	 */
	@Column(name = "origin_dossier_version_id", updatable = false)
	private Long originDossierVersionId;

	/**
	 * Hàm khởi tạo mặc định cho JPA, không dùng trực tiếp.
	 */
	protected Beneficiary() {
	}

	/**
	 * BE-02: a recipient created at ST-18 from the court document version that names them.
	 *
	 * <p>Cách làm: tạo bản ghi bằng hàm khởi tạo thông thường rồi đặt {@code origin = COURT_DOCUMENT} và gắn id phiên bản hồ sơ.
	 * @param publicId mã công khai của người thụ hưởng mới
	 * @param vault kho chứa người thụ hưởng
	 * @param dossierVersionId id phiên bản hồ sơ pháp lý nêu tên người này (bắt buộc)
	 * @param fullName họ tên; {@code relationship} quan hệ với chủ kho; {@code dateOfBirth} ngày sinh
	 * @param phone số điện thoại; {@code email} email; {@code identityNumberEncrypted} số giấy tờ đã mã hóa (có thể null)
	 * @return bản ghi {@code Beneficiary} chưa lưu
	 * @throws IllegalArgumentException nếu {@code dossierVersionId} là null
	 */
	public static Beneficiary fromCourtDocument(UUID publicId, Vault vault, Long dossierVersionId, String fullName,
			String relationship, LocalDate dateOfBirth, String phone, String email, byte[] identityNumberEncrypted) {
		if (dossierVersionId == null) throw new IllegalArgumentException("dossierVersionId");
		Beneficiary beneficiary = new Beneficiary(publicId, vault, fullName, relationship, dateOfBirth, phone, email,
				identityNumberEncrypted);
		beneficiary.origin = ORIGIN_COURT_DOCUMENT;
		beneficiary.originDossierVersionId = dossierVersionId;
		return beneficiary;
	}

	/**
	 * Tạo người thụ hưởng do chủ kho chỉ định (gọi từ {@code BeneficiaryService.create}). Đặt trạng thái {@code DESIGNATED};
	 * nếu có số giấy tờ mã hóa thì loại giấy tờ là {@code IDENTITY_NUMBER}.
	 * @param publicId mã công khai đã sinh trước (cũng là dữ liệu AAD khi mã hóa số giấy tờ)
	 * @param vault kho chứa người thụ hưởng
	 * @param identityNumberEncrypted số giấy tờ đã mã hóa, có thể null
	 */
	public Beneficiary(UUID publicId, Vault vault, String fullName, String relationship, LocalDate dateOfBirth,
			String phone, String email, byte[] identityNumberEncrypted) {
		this.publicId = publicId;
		this.vault = vault;
		this.fullName = fullName;
		this.relationship = relationship;
		this.dateOfBirth = dateOfBirth;
		this.phone = phone;
		this.email = email;
		this.identityNumberEncrypted = identityNumberEncrypted;
		this.identityDocumentType = identityNumberEncrypted == null ? null : "IDENTITY_NUMBER";
		this.status = "DESIGNATED";
	}

	/**
	 * Callback JPA trước khi INSERT: điền {@code publicId}, {@code createdAt}, {@code updatedAt} (UTC) nếu còn trống.
	 */
	@PrePersist
	void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		if (publicId == null) publicId = UUID.randomUUID();
		if (createdAt == null) createdAt = now;
		if (updatedAt == null) updatedAt = now;
	}

	/**
	 * Callback JPA trước khi UPDATE: cập nhật {@code updatedAt} theo giờ UTC.
	 */
	@PreUpdate
	void onUpdate() {
		updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	/**
	 * Cập nhật thông tin hồ sơ (gọi từ {@code BeneficiaryService.update}). Số giấy tờ mã hóa chỉ bị ghi đè khi truyền giá trị
	 * khác null, tức là không gửi số mới thì giữ nguyên số cũ.
	 */
	public void update(String fullName, String relationship, LocalDate dateOfBirth,
			String phone, String email, byte[] identityNumberEncrypted) {
		this.fullName = fullName;
		this.relationship = relationship;
		this.dateOfBirth = dateOfBirth;
		this.phone = phone;
		this.email = email;
		if (identityNumberEncrypted != null) {
			this.identityNumberEncrypted = identityNumberEncrypted;
			this.identityDocumentType = "IDENTITY_NUMBER";
		}
	}

	public Long getId() { return id; }
	public UUID getPublicId() { return publicId; }
	public Vault getVault() { return vault; }
	public String getFullName() { return fullName; }
	public String getRelationship() { return relationship; }
	public LocalDate getDateOfBirth() { return dateOfBirth; }
	public String getPhone() { return phone; }
	public String getEmail() { return email; }
	/**
	 * @return {@code true} nếu đã lưu số giấy tờ định danh (API chỉ trả cờ này, không bao giờ trả số).
	 */
	public boolean hasIdentityNumber() { return identityNumberEncrypted != null && identityNumberEncrypted.length > 0; }
	/**
	 * @return {@code true} nếu bản ghi đã liên kết với một tài khoản đăng nhập.
	 */
	public boolean hasAccount() { return linkedUserId != null; }
	public Long getLinkedUserId() { return linkedUserId; }
	public String getAccountStatus() { return accountStatus; }
	public String getOrigin() { return origin; }
	public Long getOriginDossierVersionId() { return originDossierVersionId; }
	/**
	 * ST-24: link the beneficiary record to an official account; the legal identity record is not altered.
	 *
	 * Đặt {@code linkedUserId} và chuyển {@code accountStatus} sang {@link #ACCOUNT_CREATED}.
	 * @throws IllegalStateException nếu {@code userId} null hoặc bản ghi đã liên kết trước đó
	 */
	public void linkAccount(Long userId) {
		if (userId == null || linkedUserId != null) throw new IllegalStateException("Beneficiary account cannot be linked");
		this.linkedUserId = userId;
		this.accountStatus = ACCOUNT_CREATED;
	}
	public String getIdentityVerificationStatus() { return identityVerificationStatus; }
	/**
	 * Đánh dấu đã xác minh danh tính tại quầy (gọi khi Staff xác minh MATCH hoặc ghi nhận chứng thực tại quầy).
	 */
	public void verifyAtCounter() { this.identityVerificationStatus = VERIFIED_AT_COUNTER; }
	/**
	 * A new NOT_MATCH invalidates any previous at-counter verification. History remains append-only.
	 *
	 * Đưa trạng thái xác minh về {@link #NOT_VERIFIED} (gọi khi Staff ghi kết quả NOT_MATCH).
	 */
	public void markIdentityNotVerified() { this.identityVerificationStatus = NOT_VERIFIED; }
	public String getStatus() { return status; }
	public LocalDateTime getCreatedAt() { return createdAt; }
	public LocalDateTime getUpdatedAt() { return updatedAt; }
}
