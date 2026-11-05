package com.legacyvault.auth;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/**
 * A parallel request created the account for this email/subject first, so this request's transaction was rolled back.
 * That does not mean the email belongs to a password account, so callers retry once instead of telling the user to
 * "sign in with a password" (the winner is usually the same Google user and has no password). If it is surfaced anyway
 * it still maps to {@code GOOGLE_EMAIL_ALREADY_REGISTERED}.
 */
class GoogleSignupRaceException extends BusinessException {
    GoogleSignupRaceException() {
        super(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED);
    }
}
