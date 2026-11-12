package com.legacyvault.beneficiary;

import java.lang.annotation.*;
import java.time.LocalDate;
import jakarta.validation.*;

/**
 * Ràng buộc Bean Validation cho ngày sinh người thụ hưởng: cho phép null, nhưng không được sau ngày hôm nay
 * (tính theo múi giờ {@code GuardianService.AGE_ZONE} = Asia/Ho_Chi_Minh). Dùng trong {@code BeneficiaryDtos.UpsertRequest.dateOfBirth}.
 * Lỗi trả về khóa thông điệp {@code validation.PastOrPresent}.
 */
@Target({ElementType.FIELD,ElementType.PARAMETER,ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy=BeneficiaryBirthDate.Validator.class)
public @interface BeneficiaryBirthDate {
    String message() default "validation.PastOrPresent";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    /**
     * Bộ kiểm tra thực thi ràng buộc {@code BeneficiaryBirthDate}.
     */
    class Validator implements ConstraintValidator<BeneficiaryBirthDate,LocalDate> {
        /**
         * @return {@code true} nếu ngày sinh null hoặc không sau ngày hiện tại (múi giờ Việt Nam).
         */
        @Override public boolean isValid(LocalDate value,ConstraintValidatorContext context) {
            return value==null || !value.isAfter(LocalDate.now(GuardianService.AGE_ZONE));
        }
    }
}
