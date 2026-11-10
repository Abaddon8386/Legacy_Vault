-- The limiter purges expired rows with "DELETE ... WHERE failed_at < cutoff" on every attempt. Neither existing
-- index starts with failed_at, so that purge scanned the whole table. This index lets it seek the expired range.
CREATE INDEX IX_login_failures_failed_at
    ON dbo.login_failures(failed_at);
