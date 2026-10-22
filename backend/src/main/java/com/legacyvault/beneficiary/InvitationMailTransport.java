package com.legacyvault.beneficiary;

public interface InvitationMailTransport {
    void send(InvitationMailDeliveryService.Delivery delivery);
    class DeliveryFailure extends RuntimeException {
        private final boolean ambiguous;
        public DeliveryFailure(boolean ambiguous) { super("Invitation delivery unavailable"); this.ambiguous=ambiguous; }
        public boolean ambiguous() { return ambiguous; }
    }
}
