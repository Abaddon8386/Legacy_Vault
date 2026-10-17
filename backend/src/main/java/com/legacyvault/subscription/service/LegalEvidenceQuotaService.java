package com.legacyvault.subscription.service;

import com.legacyvault.common.error.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** All retained legal versions count separately from Owner content. Caller holds the case lock. */
@Service
public class LegalEvidenceQuotaService {
    private final JdbcTemplate jdbc;
    private final long maxBytes;
    private final long maxVersions;
    private final long maxFileBytes;
    public LegalEvidenceQuotaService(JdbcTemplate jdbc,
            @Value("${legacyvault.subscription.legal-evidence.max-bytes:104857600}") long maxBytes,
            @Value("${legacyvault.subscription.legal-evidence.max-versions:50}") long maxVersions,
            @Value("${legacyvault.subscription.legal-evidence.max-file-bytes:10485760}") long maxFileBytes) {
        if(maxBytes<=0 || maxVersions<=0 || maxFileBytes<=0 || maxFileBytes>maxBytes) throw new IllegalArgumentException("Evidence limits must be positive");
        this.jdbc=jdbc;this.maxBytes=maxBytes;this.maxVersions=maxVersions;this.maxFileBytes=maxFileBytes;
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void requireGrowth(Long caseId,long bytes) {
        if(bytes>maxFileBytes) throw new BusinessException(ErrorCode.PAYLOAD_TOO_LARGE);
        long[] usage=jdbc.queryForObject("SELECT COUNT_BIG(*), COALESCE(SUM(CONVERT(BIGINT,v.file_size_bytes)),0) FROM dbo.legal_basis_dossier_versions v JOIN dbo.legal_basis_dossiers d ON d.legal_basis_dossier_id=v.legal_basis_dossier_id WHERE d.verification_case_id=?",
            (r,n)->new long[]{r.getLong(1),r.getLong(2)},caseId);
        if(bytes<0 || usage[0]>=maxVersions || bytes>maxBytes-usage[1])
            throw new BusinessException(ErrorCode.CASE_EVIDENCE_QUOTA_EXCEEDED);
    }
}
