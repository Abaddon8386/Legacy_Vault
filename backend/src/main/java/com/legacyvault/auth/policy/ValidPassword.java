package com.legacyvault.auth.policy;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.*;

@Target({ElementType.FIELD,ElementType.PARAMETER,ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy=PasswordPolicy.class)
public @interface ValidPassword {
    String message() default "{validation.passwordPolicy}";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
