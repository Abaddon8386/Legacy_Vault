package com.legacyvault.asset.service;

import com.legacyvault.asset.dto.*;
import com.legacyvault.asset.entity.*;
import com.legacyvault.asset.repository.*;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.subscription.service.OwnerQuotaService;
import com.legacyvault.subscription.service.QuotaPolicy.Delta;
import com.legacyvault.vault.service.VaultService;
import com.legacyvault.will.service.WillFile;
import com.legacyvault.audit.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import java.io.ByteArrayInputStream;

@Service
public class AssetImageService {
    public static final long MAX_BYTES = 5L * 1024 * 1024;
    public static final int MAX_IMAGES = 5;
    private final AssetImageRepository images;
    private final AssetRepository assets;
    private final AssetService assetService;
    private final VaultService vaults;
    private final OwnerQuotaService quotas;
    private final EncryptionService encryption;
    private final PasswordReauthService reauth;
    private final AuditService audit;
    public AssetImageService(AssetImageRepository images, AssetRepository assets, AssetService assetService,
            VaultService vaults, OwnerQuotaService quotas, EncryptionService encryption,
            PasswordReauthService reauth, AuditService audit) {
        this.images=images; this.assets=assets; this.assetService=assetService; this.vaults=vaults;
        this.quotas=quotas; this.encryption=encryption; this.reauth=reauth; this.audit=audit;
    }
    public record ImageInfo(UUID id, String fileName, String contentType, long sizeBytes, Instant createdAt) {
        static ImageInfo from(AssetImage i) { return new ImageInfo(i.getPublicId(), i.getFileName(), i.getContentType(), i.getSize(), i.getCreatedAt()); }
    }
    // Metadata is safe to list; decrypted bytes require the existing password reauthentication policy.
    @Transactional(readOnly=true)
    public List<ImageInfo> list(UUID vaultId, UUID assetId, Long owner) {
        var vault = vaults.requireOwnedVault(vaultId, owner);
        return images.findByAssetIdOrderBySlotAsc(requireAsset(vault.getVaultId(), assetId).getAssetId()).stream().map(ImageInfo::from).toList();
    }
    @Transactional
    public AssetResponse create(UUID vaultId, Long owner, CreateAssetRequest request, List<MultipartFile> files) {
        // Both metadata and images commit together; an invalid image never leaves a partial Asset.
        var created = assetService.createAsset(vaultId, owner, request);
        add(vaultId, created.id(), owner, files);
        return created;
    }
    @Transactional
    public List<ImageInfo> add(UUID vaultId, UUID assetId, Long owner, List<MultipartFile> files) {
        quotas.lockOwner(owner);
        var vault = vaults.requireEditableVaultForUpdate(vaultId, owner);
        var asset = requireAsset(vault.getVaultId(), assetId);
        var existing = images.findByAssetIdOrderBySlotAsc(asset.getAssetId());
        if (files == null || files.isEmpty() || files.size() + existing.size() > MAX_IMAGES)
            throw new BusinessException(ErrorCode.ASSET_IMAGE_LIMIT_EXCEEDED);
        var inspected = files.stream().map(AssetImageService::inspect).toList();
        quotas.requireGrowth(owner, new Delta(0, inspected.stream().mapToLong(WillFile::size).sum()));
        var used = new HashSet<Integer>(); existing.forEach(i -> used.add(i.getSlot()));
        for (var file : inspected) {
            int slot=1; while (used.contains(slot)) slot++;
            var image = new AssetImage(asset.getAssetId(), slot, file.fileName(), file.contentType(), file.size());
            image.encrypt(encryption.encrypt(file.content(), aad(assetId, image.getPublicId())));
            images.saveAndFlush(image); used.add(slot);
            record(AuditAction.ASSET_IMAGE_ADDED, owner, vault.getVaultId(), asset.getAssetId(), image.getPublicId());
        }
        return images.findByAssetIdOrderBySlotAsc(asset.getAssetId()).stream().map(ImageInfo::from).toList();
    }
    @Transactional
    public byte[] open(UUID vaultId, UUID assetId, UUID imageId, Long owner, String password) {
        var vault = vaults.requireEditableVault(vaultId, owner);
        var asset = requireAsset(vault.getVaultId(), assetId);
        var image = requireImage(asset.getAssetId(), imageId);
        reauth.requirePassword(owner, vault.getVaultId(), password);
        var bytes = encryption.decryptBytes(image.encrypted(), aad(assetId, imageId));
        record(AuditAction.ASSET_IMAGE_OPENED, owner, vault.getVaultId(), asset.getAssetId(), imageId);
        return bytes;
    }
    @Transactional
    public void delete(UUID vaultId, UUID assetId, UUID imageId, Long owner) {
        quotas.lockOwner(owner);
        var vault = vaults.requireEditableVaultForUpdate(vaultId, owner);
        var asset = requireAsset(vault.getVaultId(), assetId);
        images.delete(requireImage(asset.getAssetId(), imageId)); images.flush();
        record(AuditAction.ASSET_IMAGE_REMOVED, owner, vault.getVaultId(), asset.getAssetId(), imageId);
    }
    private Asset requireAsset(Long vault, UUID id) {
        return assets.findByPublicIdAndVaultIdAndAssetTypeNot(id, vault, AssetType.DOCUMENT)
            .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }
    private AssetImage requireImage(Long asset, UUID id) {
        return images.findByPublicIdAndAssetId(id, asset).orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }
    static WillFile inspect(MultipartFile upload) {
        var file = WillFile.inspect(upload, MAX_BYTES);
        if (!Set.of("image/jpeg", "image/png").contains(file.contentType()))
            throw new BusinessException(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
        // Validate an actual image and bound its decoded dimensions before allocating a raster.
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(file.content()))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new BusinessException(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
            ImageReader reader = readers.next();
            try {
                reader.setInput(input);
                if ((long) reader.getWidth(0) * reader.getHeight(0) > 25_000_000L)
                    throw new BusinessException(ErrorCode.PAYLOAD_TOO_LARGE);
                reader.read(0);
            } finally { reader.dispose(); }
        } catch (BusinessException ex) { throw ex; }
        catch (Exception ex) { throw new BusinessException(ErrorCode.UNSUPPORTED_MEDIA_TYPE); }
        return file;
    }
    private static byte[] aad(UUID asset, UUID image) { return ("asset-image:"+asset+":"+image).getBytes(StandardCharsets.UTF_8); }
    private void record(AuditAction action, Long owner, Long vault, Long asset, UUID image) {
        audit.record(new AuditEvent(action, AuditActorType.USER, owner, vault, "ASSET_IMAGE", asset,
            null, null, null, Map.of("imageId", image), "ST-02", null));
    }
}
