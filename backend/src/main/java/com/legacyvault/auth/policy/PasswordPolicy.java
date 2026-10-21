package com.legacyvault.auth.policy;

import java.nio.charset.StandardCharsets;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** Shared registration/recovery policy. BCrypt's limit is bytes, not UTF-16 characters. */
public class PasswordPolicy implements ConstraintValidator<ValidPassword,String> {
    @Override public boolean isValid(String value,ConstraintValidatorContext context) {
        if(value==null || value.isBlank() || value.length()<8 || value.length()>72
                || value.indexOf('\0')>=0 || value.getBytes(StandardCharsets.UTF_8).length>72) return false;
        for(int i=0;i<value.length();i++) {
            char c=value.charAt(i);
            if(Character.isHighSurrogate(c)) {
                if(++i>=value.length() || !Character.isLowSurrogate(value.charAt(i))) return false;
            } else if(Character.isLowSurrogate(c)) return false;
        }
        return true;
    }
}
