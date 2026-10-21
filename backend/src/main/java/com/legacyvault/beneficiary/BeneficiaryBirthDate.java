package com.legacyvault.beneficiary;

import java.lang.annotation.*;
import java.time.LocalDate;
import jakarta.validation.*;

@Target({ElementType.FIELD,ElementType.PARAMETER,ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy=BeneficiaryBirthDate.Validator.class)
public @interface BeneficiaryBirthDate {
    String message() default "validation.PastOrPresent";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    class Validator implements ConstraintValidator<BeneficiaryBirthDate,LocalDate> {
        @Override public boolean isValid(LocalDate value,ConstraintValidatorContext context) {
            return value==null || !value.isAfter(LocalDate.now(GuardianService.AGE_ZONE));
        }
    }
}
