package com.legacyvault.beneficiary;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
public class ResendInvitationMailTransport implements InvitationMailTransport {
    private final InvitationMailConfiguration config;
    private final ObjectMapper json;
    private final HttpClient client;
    private final String template;
    @Autowired
    public ResendInvitationMailTransport(InvitationMailConfiguration config,ObjectMapper json) throws java.io.IOException {
        this(config,json,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
    }
    ResendInvitationMailTransport(InvitationMailConfiguration config,ObjectMapper json,HttpClient client) throws java.io.IOException {
        this.config=config;this.json=json;this.client=client;
        try(var input=new ClassPathResource("mail/beneficiary-invitation-bilingual.txt").getInputStream()) {
            template=new String(input.readAllBytes(),StandardCharsets.UTF_8);
        }
    }
    @Override public void send(InvitationMailDeliveryService.Delivery delivery) {
        if(!config.permits(delivery.recipientEmail())) throw new DeliveryFailure(false);
        try {
            String body=json.writeValueAsString(Map.of("from",config.sender(),"to",List.of(delivery.recipientEmail()),
                    "subject","LegacyVault — Mã lời mời / Invitation code",
                    "text",template.replace("{{invitationCode}}",delivery.invitationCode())));
            var request=HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
                    .timeout(Duration.ofSeconds(10)).header("Authorization","Bearer "+config.apiKey())
                    .header("Content-Type","application/json").header("Idempotency-Key","beneficiary-invitation/"+delivery.outboxId())
                    .POST(HttpRequest.BodyPublishers.ofString(body,StandardCharsets.UTF_8)).build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if(response.statusCode()<200 || response.statusCode()>=300) throw new DeliveryFailure(response.statusCode()>=500);
            var receipt=json.readTree(response.body());
            java.util.UUID.fromString(receipt.path("id").asText());
        } catch(DeliveryFailure failure) { throw failure; }
        catch(InterruptedException interrupted) {Thread.currentThread().interrupt();throw new DeliveryFailure(true);}
        catch(Exception failure) {throw new DeliveryFailure(true);} // Never retain provider bodies/headers/exception causes.
    }
}
