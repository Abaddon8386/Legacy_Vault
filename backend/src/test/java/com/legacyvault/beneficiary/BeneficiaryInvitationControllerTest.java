package com.legacyvault.beneficiary;

import com.legacyvault.auth.JwtService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.support.WebContractTestConfig;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BeneficiaryInvitationController.class)
@WebContractTestConfig
class BeneficiaryInvitationControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean UserRoleRepository roles;
    @MockitoBean BeneficiaryInvitationService service;
    final UUID vault = UUID.randomUUID(), beneficiary = UUID.randomUUID();
    final String path = "/api/v1/vaults/" + vault + "/beneficiaries/" + beneficiary + "/invitation";

    @Test void ownerIssuesOnceAndMetadataNeverContainsCode() throws Exception {
        var metadata = new InvitationDtos.Metadata(UUID.randomUUID(), beneficiary, "PENDING", 1, null, null, null, null);
        when(service.issue(vault, beneficiary)).thenReturn(new InvitationDtos.Issued(metadata, "example-code"));
        when(service.get(vault, beneficiary)).thenReturn(metadata);
        mvc.perform(post(path).with(user("owner").roles("VAULT_OWNER"))).andExpect(status().isCreated())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().doesNotExist("Location"))
                .andExpect(jsonPath("$.code").value("example-code"))
                .andExpect(jsonPath("$.invitation.state").value("PENDING"));
        mvc.perform(get(path).with(user("owner").roles("VAULT_OWNER"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.code").doesNotExist()).andExpect(jsonPath("$.codeHash").doesNotExist());
    }
    @Test void anonymousAndOtherRolesCannotManageInvitations() throws Exception {
        for (var request : List.of(get(path), post(path), delete(path).param("generation", "1"), post(path + "/reissue")
                .contentType(MediaType.APPLICATION_JSON).content("{\"generation\":1}"))) {
            mvc.perform(request).andExpect(status().isUnauthorized());
        }
        for (String role : List.of("BENEFICIARY", "STAFF_EXECUTOR", "LEGAL_VERIFIER", "ADMIN")) {
            mvc.perform(get(path).with(user("other").roles(role))).andExpect(status().isForbidden());
            mvc.perform(post(path).with(user("other").roles(role))).andExpect(status().isForbidden());
            mvc.perform(delete(path).param("generation", "1").with(user("other").roles(role))).andExpect(status().isForbidden());
            mvc.perform(post(path + "/reissue").with(user("other").roles(role))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"generation\":1}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }
    @Test void reissueValidatesGenerationAndNeverTakesClientExpiryRoleOrCode() throws Exception {
        for (String body : List.of("{}", "{\"generation\":0}", "{\"generation\":-1}", "{\"generation\":null}")) {
            mvc.perform(post(path + "/reissue").with(user("owner").roles("VAULT_OWNER"))
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
        mvc.perform(post(path + "/reissue").with(user("owner").roles("VAULT_OWNER"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"generation\":1}"))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"));
        verify(service).reissue(vault, beneficiary, 1);
    }
    @Test void revokeAndBusinessErrorsUseSharedEnvelopeAndViEnMessages() throws Exception {
        mvc.perform(delete(path).param("generation", "1").with(user("owner").roles("VAULT_OWNER"))).andExpect(status().isNoContent());
        when(service.issue(vault, beneficiary)).thenThrow(new BusinessException(ErrorCode.BENEFICIARY_INVITATION_ALREADY_EXISTS));
        mvc.perform(post(path).with(user("owner").roles("VAULT_OWNER")).header("Accept-Language", "en"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BENEFICIARY_INVITATION_ALREADY_EXISTS"))
                .andExpect(jsonPath("$.message").value("An invitation has already been issued. Check its status or explicitly reissue it."));
        mvc.perform(post(path).with(user("owner").roles("VAULT_OWNER")).header("Accept-Language", "vi"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("Lời mời đã được cấp. Hãy xem trạng thái hoặc chủ động cấp lại."));
    }

    @Test void revokeRequiresPositiveGenerationAndCannotMutateOnInvalidInput() throws Exception {
        mvc.perform(delete(path).with(user("owner").roles("VAULT_OWNER")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        for (String generation : List.of("0", "-1")) {
            mvc.perform(delete(path).param("generation", generation).with(user("owner").roles("VAULT_OWNER")))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
        for (String generation : List.of("not-a-number", "2147483648")) {
            mvc.perform(delete(path).param("generation", generation).with(user("owner").roles("VAULT_OWNER")))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        }
        verifyNoInteractions(service);
    }
}
