package com.legacyvault.verification.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Reload a locked workflow row: a locking query alone can return stale first-level-cache fields. */
@Component
public class LegalBasisLockedState {
    private final EntityManager entityManager;

    public LegalBasisLockedState(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void refresh(Object entity) {
        entityManager.refresh(entity, LockModeType.PESSIMISTIC_WRITE);
    }
}
