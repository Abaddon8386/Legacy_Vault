
package com.legacyvault.vault.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

/**
 * Entity JPA ánh xạ bảng {@code vaults}: két chứa tài sản số và di chúc của một chủ sở hữu (unique theo
 * {@code owner_user_id}, mỗi chủ một két).
 *
 * <p>Quản lý Vault và các trạng thái xử lý nghiệp vụ. Vòng đời trạng thái:
 * {@code ACTIVE} -> {@code AWAITING_VERIFICATION} (DMS hết gia hạn) -> {@code DOCUMENT_VERIFICATION} ->
 * {@code WILL_VERIFICATION} -> {@code AWAITING_LEGAL_BASIS} / {@code ON_HOLD} -> {@code LEGAL_BASIS_VERIFICATION} ->
 * {@code UNLOCKED} -> {@code HANDOVER_IN_PROGRESS} -> {@code ARCHIVED}. Chủ két hủy cảnh báo thì quay về
 * {@code ACTIVE} ({@link #restoreActive()}). Chỉ trạng thái {@code ACTIVE} cho phép chủ sửa nội dung. Các phương
 * thức {@code mark*} kiểm tra trạng thái nguồn và ném {@link IllegalStateException} nếu chuyển không hợp lệ.
 */
@Entity
@Table(
        name = "vaults",
        uniqueConstraints = @UniqueConstraint(
                name = "UQ_vaults_owner_user_id",
                columnNames = "owner_user_id"))
public class Vault {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "vault_id")
    /** Khóa chính nội bộ (cột {@code vault_id}); không lộ ra API. */
    private Long vaultId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    /** UUID công khai dùng trong URL/API, tự sinh khi lưu lần đầu. */
    private UUID publicId;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    /** Id chủ sở hữu (bảng {@code users}); không đổi sau khi tạo. */
    private Long ownerUserId;

    @Column(name = "vault_name", nullable = false, length = 150)
    /** Tên két (cột {@code vault_name}, tối đa 150 ký tự). */
    private String name;

    @Column(name = "description", columnDefinition = "nvarchar(max)")
    /** Mô tả két, có thể null. */
    private String description;

    @Column(name = "status", nullable = false, length = 40)
    /** Trạng thái hiện tại, một trong các hằng {@code STATUS_*}. */
    private String status;

    @Column(name = "created_at", nullable = false, updatable = false)
    /** Thời điểm tạo (UTC), không cập nhật. */
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    /** Thời điểm cập nhật cuối (UTC), được làm mới khi đổi trạng thái. */
    private Instant updatedAt;

    /** Constructor công khai không tham số cho JPA và cho {@code VaultService} tạo két mới. */
    public Vault() {
    }

    /** Hook JPA trước khi chèn: tự sinh {@code publicId}, trạng thái {@code ACTIVE} và các mốc thời gian nếu còn trống. */
    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = STATUS_ACTIVE;
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    /** Két hoạt động bình thường, chủ được sửa nội dung. */
    public static final String STATUS_ACTIVE = "ACTIVE";
    /** Két đã lưu trữ sau khi bàn giao xong; không được ghi thêm. */
    public static final String STATUS_ARCHIVED = "ARCHIVED";

    /** Lưu trữ két sau khi bàn giao hoàn tất: {@code HANDOVER_IN_PROGRESS} -> {@code ARCHIVED}. */
    public void archiveAfterHandover() {
        moveTo(STATUS_HANDOVER_IN_PROGRESS, STATUS_ARCHIVED);
    }
    /** DMS đã hết gia hạn, vụ xác minh đã được mở, chờ nhân viên. */
    public static final String STATUS_AWAITING_VERIFICATION = "AWAITING_VERIFICATION";
    /** Đang xác minh giấy tờ chứng tử. */
    public static final String STATUS_DOCUMENT_VERIFICATION = "DOCUMENT_VERIFICATION";
    /** Đang đối chiếu di chúc. */
    public static final String STATUS_WILL_VERIFICATION = "WILL_VERIFICATION";
    /** Chờ văn bản căn cứ phân chia di sản hợp lệ. */
    public static final String STATUS_AWAITING_LEGAL_BASIS = "AWAITING_LEGAL_BASIS";
    /** Tạm dừng quy trình pháp lý (tranh chấp, thiếu chứng cứ...). */
    public static final String STATUS_ON_HOLD = "ON_HOLD";
    /** Bộ phận pháp lý đang thẩm định căn cứ phân chia. */
    public static final String STATUS_LEGAL_BASIS_VERIFICATION = "LEGAL_BASIS_VERIFICATION";
    /** Két đã được pháp lý duyệt mở khóa, sẵn sàng bàn giao. */
    public static final String STATUS_UNLOCKED = "UNLOCKED";
    /** Đang bàn giao tài sản cho người thụ hưởng. */
    public static final String STATUS_HANDOVER_IN_PROGRESS = "HANDOVER_IN_PROGRESS";

    /**
     * PS-59: chỉ quy trình Legal được bảo vệ mới được chuyển két sang UNLOCKED.
     * {@code LEGAL_BASIS_VERIFICATION} -> {@code UNLOCKED}.
     *
     * @throws IllegalStateException nếu két chưa ở trạng thái thẩm định căn cứ pháp lý
     */
    public void unlockAfterLegalApproval() {
        if (!STATUS_LEGAL_BASIS_VERIFICATION.equals(status)) {
            throw new IllegalStateException("Vault is not in legal-basis verification");
        }
        status = STATUS_UNLOCKED;
        updatedAt = Instant.now();
    }

    /**
     * PS-65 / ST-25: lần giao tài sản đầu tiên tại quầy chuyển két {@code UNLOCKED} -> {@code HANDOVER_IN_PROGRESS}; các
     * lần giao sau giữ nguyên trạng thái.
     *
     * @throws IllegalStateException nếu két chưa {@code UNLOCKED} (và chưa đang bàn giao)
     */
    public void markHandoverInProgress() {
        if (STATUS_HANDOVER_IN_PROGRESS.equals(status)) {
            return;
        }
        if (!STATUS_UNLOCKED.equals(status)) {
            throw new IllegalStateException("Vault must be UNLOCKED to start handover");
        }
        status = STATUS_HANDOVER_IN_PROGRESS;
        updatedAt = Instant.now();
    }

    /** Khôi phục két về {@code ACTIVE} (chủ hủy cảnh báo, {@code VaultService.cancelAlert}). */
    public void restoreActive() {
        this.status = STATUS_ACTIVE;
        this.updatedAt = Instant.now();
    }

    /**
     * Chuyển {@code AWAITING_VERIFICATION} -> {@code DOCUMENT_VERIFICATION} khi nhân viên nhận vụ xác minh giấy tờ.
     *
     * @throws IllegalStateException nếu két không ở {@code AWAITING_VERIFICATION}
     */
    public void markDocumentVerification() {
        if (!STATUS_AWAITING_VERIFICATION.equals(this.status)) {
            throw new IllegalStateException(
                    "Vault is not awaiting death-document verification");
        }

        this.status = STATUS_DOCUMENT_VERIFICATION;
        this.updatedAt = Instant.now();
    }

    /** ST-15: DOCUMENT_VERIFICATION -> WILL_VERIFICATION. */
    public void markWillVerification() {
        moveTo(STATUS_DOCUMENT_VERIFICATION, STATUS_WILL_VERIFICATION);
    }

    /**
     * ST-16: định tuyến sau khi xác minh chứng tử/di chúc: {@code DOCUMENT_VERIFICATION} hoặc {@code WILL_VERIFICATION}
     * -> {@code AWAITING_LEGAL_BASIS} hoặc {@code ON_HOLD}.
     *
     * @param onHold {@code true} thì chuyển sang {@code ON_HOLD}, ngược lại sang {@code AWAITING_LEGAL_BASIS}
     * @throws IllegalStateException nếu chưa qua bước xác minh giấy tờ/di chúc
     */
    public void markLegalBasisRouted(boolean onHold) {
        if (!STATUS_DOCUMENT_VERIFICATION.equals(status) && !STATUS_WILL_VERIFICATION.equals(status))
            throw new IllegalStateException("Death verification must precede court classification");
        status = onHold ? STATUS_ON_HOLD : STATUS_AWAITING_LEGAL_BASIS;
        updatedAt = Instant.now();
    }

    /** ON_HOLD -> AWAITING_LEGAL_BASIS sau khi Legal phân loại lại. */
    public void markAwaitingLegalBasisAfterHold() {
        moveTo(STATUS_ON_HOLD, STATUS_AWAITING_LEGAL_BASIS);
    }

    /**
     * Legal mở lại việc xem xét khi có tranh chấp mới hoặc thiếu chứng cứ; thao tác này không bao giờ mở khóa két.
     * Chuyển {@code AWAITING_LEGAL_BASIS} hoặc {@code LEGAL_BASIS_VERIFICATION} sang {@code ON_HOLD}.
     *
     * @throws IllegalStateException nếu két không nằm trong quy trình căn cứ pháp lý
     */
    public void holdLegalBasisReview() {
        if (!STATUS_AWAITING_LEGAL_BASIS.equals(status) && !STATUS_LEGAL_BASIS_VERIFICATION.equals(status))
            throw new IllegalStateException("Vault is not in the legal-basis workflow");
        status = STATUS_ON_HOLD;
        updatedAt = Instant.now();
    }

    /**
     * ST-19/20: Staff chuyển văn bản đúng nhánh cho Legal. {@code DOCUMENT_VERIFICATION}, {@code WILL_VERIFICATION} hoặc
     * {@code AWAITING_LEGAL_BASIS} -> {@code LEGAL_BASIS_VERIFICATION}.
     *
     * @throws IllegalStateException nếu két chưa ở trạng thái tiếp nhận ({@link #isLegalBasisIntakeState()})
     */
    public void markLegalBasisVerification() {
        if (!isLegalBasisIntakeState()) {
            throw new IllegalStateException(
                    "Vault must be DOCUMENT_VERIFICATION, WILL_VERIFICATION or AWAITING_LEGAL_BASIS to move to "
                            + STATUS_LEGAL_BASIS_VERIFICATION);
        }
        status = STATUS_LEGAL_BASIS_VERIFICATION;
        updatedAt = Instant.now();
    }

    /**
     * Các trạng thái Staff được tiếp nhận và chuyển tiếp văn bản căn cứ phân chia. Tất cả đều nằm sau bước Legal quyết
     * định giấy chứng tử nên không thể bỏ qua xác minh tử vong; {@code AWAITING_VERIFICATION} không nằm trong số này.
     *
     * @return {@code true} nếu két ở {@code DOCUMENT_VERIFICATION}, {@code WILL_VERIFICATION} hoặc {@code AWAITING_LEGAL_BASIS}
     */
    public boolean isLegalBasisIntakeState() {
        return STATUS_DOCUMENT_VERIFICATION.equals(status) || STATUS_WILL_VERIFICATION.equals(status)
                || STATUS_AWAITING_LEGAL_BASIS.equals(status);
    }

    /**
     * PS-37 / ST-20:
     * Legal yêu cầu Staff bổ sung chứng cứ sau khi review.
     *
     * LEGAL_BASIS_VERIFICATION -> AWAITING_LEGAL_BASIS.
     */
    public void markAwaitingLegalBasisAfterReviewHold() {
        moveTo(
                STATUS_LEGAL_BASIS_VERIFICATION,
                STATUS_AWAITING_LEGAL_BASIS);
    }

    /**
     * Chuyển trạng thái có kiểm tra điều kiện và cập nhật {@code updatedAt}.
     *
     * @param expectedFrom trạng thái nguồn bắt buộc
     * @param to           trạng thái đích
     * @throws IllegalStateException nếu trạng thái hiện tại khác {@code expectedFrom}
     */
    private void moveTo(String expectedFrom, String to) {
        if (!expectedFrom.equals(this.status)) {
            throw new IllegalStateException(
                    "Vault must be " + expectedFrom + " to move to " + to);
        }

        this.status = to;
        this.updatedAt = Instant.now();
    }

    /** @return {@code true} nếu két {@code ACTIVE} nên có thể chuyển sang chờ xác minh */
    public boolean canEnterVerification() {
        return STATUS_ACTIVE.equals(status);
    }

    /**
     * Chuyển két sang {@code AWAITING_VERIFICATION} khi DMS hết gia hạn ({@code DmsTriggerProcessor}).
     *
     * @throws IllegalStateException nếu két không {@code ACTIVE}
     */
    public void markAwaitingVerification() {
        if (!canEnterVerification()) {
            throw new IllegalStateException(
                    "Vault is not eligible for verification transition");
        }

        this.status = STATUS_AWAITING_VERIFICATION;
        this.updatedAt = Instant.now();
    }

    /** Các getter/setter bên dưới truy cập trực tiếp các cột tương ứng; trạng thái chỉ đổi qua các phương thức nghiệp vụ ở trên. */
    public Long getVaultId() {
        return vaultId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(Long ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

}
