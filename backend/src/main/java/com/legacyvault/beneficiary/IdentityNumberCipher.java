package com.legacyvault.beneficiary;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;

/**
 * Stores identity ciphertext, IV and key version in the existing VARBINARY column.
 *
 * <p>Định dạng byte lưu trong cột {@code identity_document_no_encrypted}: {@code MAGIC("LVBI")}, 1 byte phiên bản định dạng, 1 byte độ dài
 * tên phiên bản khóa, tên phiên bản khóa, IV 12 byte, bản mã. Dùng bởi {@code BeneficiaryService} khi tạo/cập nhật người thụ hưởng
 * và bởi luồng hồ sơ pháp lý (BE-02). Mã hóa thực hiện bởi {@code EncryptionService} (AES-256-GCM) với AAD gắn mã công khai người thụ hưởng.
 */
@Component
public class IdentityNumberCipher {
    /**
     * Chữ ký nhận dạng định dạng dữ liệu.
     */
    private static final byte[] MAGIC = { 'L', 'V', 'B', 'I' };
    private static final byte FORMAT_VERSION = 1;
    /**
     * Kích thước tối đa của giá trị lưu (bằng độ dài cột).
     */
    private static final int MAX_STORED_BYTES = 512;
    private final EncryptionService encryption;

    /**
     * Hàm khởi tạo, nhận dịch vụ mã hóa.
     */
    public IdentityNumberCipher(EncryptionService encryption) {
        this.encryption = encryption;
    }

    /**
     * Mã hóa số giấy tờ và đóng gói theo định dạng nêu trên.
     * @param identityNumber số giấy tờ dạng chữ
     * @param beneficiaryId mã công khai người thụ hưởng, dùng làm dữ liệu AAD
     * @return mảng byte sẵn để lưu vào DB
     * @throws IllegalArgumentException nếu thiếu {@code beneficiaryId} hoặc kết quả vượt 512 byte
     * @throws IllegalStateException nếu metadata mã hóa không hợp lệ
     */
    public byte[] encrypt(String identityNumber, UUID beneficiaryId) {
        if (beneficiaryId == null) throw new IllegalArgumentException("Beneficiary ID is required");
        EncryptedData data = encryption.encrypt(identityNumber, associatedData(beneficiaryId));
        byte[] version = data.keyVersion().getBytes(StandardCharsets.UTF_8);
        if (version.length == 0 || version.length > 255 || data.iv().length != 12) {
            throw new IllegalStateException("Invalid identity encryption metadata");
        }
        int size = MAGIC.length + 1 + 1 + version.length + data.iv().length + data.ciphertext().length;
        if (size > MAX_STORED_BYTES) {
            throw new IllegalArgumentException("Encrypted identity number exceeds database column size");
        }
        return ByteBuffer.allocate(size).put(MAGIC).put(FORMAT_VERSION).put((byte) version.length)
                .put(version).put(data.iv()).put(data.ciphertext()).array();
    }

    /**
     * Dữ liệu AAD: chuỗi {@code BENEFICIARY_IDENTITY_NUMBER:} cộng mã công khai, ràng buộc bản mã với đúng một người thụ hưởng.
     */
    static byte[] associatedData(UUID beneficiaryId) {
        return ("BENEFICIARY_IDENTITY_NUMBER:" + beneficiaryId).getBytes(StandardCharsets.UTF_8);
    }
}
