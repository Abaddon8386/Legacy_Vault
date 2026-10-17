package com.legacyvault.verification;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.controller.StaffVerificationCaseController;
import com.legacyvault.verification.service.StaffVerificationCaseService;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.validation.beanvalidation.MethodValidationPostProcessor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.core.MethodParameter;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.bind.support.WebDataBinderFactory;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;


class StaffVerificationCaseControllerTest {

    private MockMvc mockMvc;

    private CustomUserPrincipal staff;

    private AnnotationConfigApplicationContext context;

    @BeforeEach
    void setUp() {
        context = new AnnotationConfigApplicationContext(TestValidationConfig.class);

        StaffVerificationCaseService service =
                mock(StaffVerificationCaseService.class);

        StaffVerificationCaseController controller =
                context.getBean(StaffVerificationCaseController.class);

        staff = new CustomUserPrincipal(
                10L,
                UUID.randomUUID(),
                "staff@example.com"
        );

        HandlerMethodArgumentResolver principalResolver =
                new HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.getParameterType()
                                .equals(CustomUserPrincipal.class);
                    }

                    @Override
                    public Object resolveArgument(
                            MethodParameter parameter,
                            ModelAndViewContainer mavContainer,
                            NativeWebRequest webRequest,
                            WebDataBinderFactory binderFactory) {
                        return staff;
                    }
                };

        mockMvc = MockMvcBuilders
                .standaloneSetup(controller)
                .setCustomArgumentResolvers(principalResolver)
                .build();
    }

    @Test
    void listCases_negativePage_returns400() throws Exception {
        jakarta.servlet.ServletException exception = assertThrows(
                jakarta.servlet.ServletException.class,
                () -> mockMvc.perform(get("/api/v1/staff/verification-cases")
                        .param("page", "-1")
                        .param("size", "20"))
        );

        org.junit.jupiter.api.Assertions.assertTrue(
                exception.getCause() instanceof jakarta.validation.ConstraintViolationException
                        || exception.getCause().getCause()
                        instanceof jakarta.validation.ConstraintViolationException
        );
    }

    @Test
    void listCases_sizeAboveLimit_returns400() throws Exception {
        jakarta.servlet.ServletException exception = assertThrows(
                jakarta.servlet.ServletException.class,
                () -> mockMvc.perform(get("/api/v1/staff/verification-cases")
                        .param("page", "0")
                        .param("size", "101"))
        );

        org.junit.jupiter.api.Assertions.assertTrue(
                exception.getCause() instanceof jakarta.validation.ConstraintViolationException
                        || exception.getCause().getCause()
                        instanceof jakarta.validation.ConstraintViolationException
        );
    }


    @Configuration
    static class TestValidationConfig {

        @Bean
        LocalValidatorFactoryBean validator() {
            return new LocalValidatorFactoryBean();
        }

        @Bean
        MethodValidationPostProcessor methodValidationPostProcessor(
                Validator validator) {
            MethodValidationPostProcessor processor =
                    new MethodValidationPostProcessor();
            processor.setValidator(validator);
            return processor;
        }

        @Bean
        StaffVerificationCaseController staffVerificationCaseController(
                StaffVerificationCaseService service) {
            return new StaffVerificationCaseController(service);
        }

        @Bean
        StaffVerificationCaseService staffVerificationCaseService() {
            return mock(StaffVerificationCaseService.class);
        }
    }
}