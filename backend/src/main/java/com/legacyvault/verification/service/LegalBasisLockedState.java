package com.legacyvault.verification.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nạp lại (refresh) một dòng workflow đã khóa: chỉ riêng truy vấn khóa có thể trả về các trường cũ từ cache cấp một
 * của Hibernate nên cần refresh với {@code PESSIMISTIC_WRITE}. Được {@link LegalBasisCaseAccess},
 * {@link HandoverSessionCaseAccess} và các service khác gọi ngay sau khi khóa Vault/case/dossier.
 */
@Component
public class LegalBasisLockedState {
    private final EntityManager entityManager;

    /**
     * @param entityManager EntityManager dùng để refresh entity
     */
    public LegalBasisLockedState(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /**
     * Nạp lại entity từ DB với khóa ghi bi quan. Bắt buộc có transaction ({@code Propagation.MANDATORY}).
     *
     * @param entity entity JPA (Vault, VerificationCase, LegalBasisDossier...) cần làm mới
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void refresh(Object entity) {
        entityManager.refresh(entity, LockModeType.PESSIMISTIC_WRITE);
    }
}
