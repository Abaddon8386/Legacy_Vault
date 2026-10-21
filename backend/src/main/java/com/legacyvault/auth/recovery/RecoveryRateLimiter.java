package com.legacyvault.auth.recovery;

import java.time.LocalDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Durable rolling windows. Failure of the limiter fails closed, never permits unmetered work. */
@Service
public class RecoveryRateLimiter {
    private final JdbcTemplate jdbc;
    private final RecoverySecrets secrets;
    public RecoveryRateLimiter(JdbcTemplate jdbc, RecoverySecrets secrets) { this.jdbc=jdbc; this.secrets=secrets; }

    @Transactional(propagation=Propagation.REQUIRES_NEW,isolation=Isolation.READ_COMMITTED)
    public boolean allow(String scope, String identity, int maximum, int seconds) {
        String key=secrets.bucket(scope,identity);
        // Hibernate may defer the first physical BEGIN until DML. sp_getapplock requires it now.
        Integer result=jdbc.queryForObject("IF @@TRANCOUNT=0 BEGIN TRANSACTION; DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=?, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000; SELECT @r",Integer.class,"recovery:"+key);
        if(result==null || result<0) throw new IllegalStateException("Recovery limit unavailable (lock result "+result+")");
        LocalDateTime now=jdbc.queryForObject("SELECT SYSUTCDATETIME()",(rs,n)->rs.getObject(1,LocalDateTime.class));
        jdbc.update("DELETE dbo.password_recovery_limits WHERE bucket_hash=? AND occurred_at<=?",key,now.minusSeconds(seconds));
        Long count=jdbc.queryForObject("SELECT COUNT_BIG(*) FROM dbo.password_recovery_limits WHERE bucket_hash=?",Long.class,key);
        if(count!=null && count>=maximum) return false;
        jdbc.update("INSERT dbo.password_recovery_limits(bucket_hash,occurred_at) VALUES (?,?)",key,now);
        return true;
    }
}
