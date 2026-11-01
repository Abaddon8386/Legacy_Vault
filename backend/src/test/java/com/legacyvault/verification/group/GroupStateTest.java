package com.legacyvault.verification.group;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class GroupStateTest {
 final UUID a=UUID.randomUUID(),b=UUID.randomUUID();
 final Set<UUID> required=Set.of(a,b);
 GroupState missing(){return GroupState.initial().attendance(UUID.randomUUID(),"scope",required,Set.of(a));}
 @Test void missingImmediatelySuspendsWholeGroup(){assertThat(missing().status()).isEqualTo("SUSPENDED");assertThat(missing().allowed("scope")).isFalse();}
 @Test void onlyStaffRequestThenLegalApprovalCanClearSuspension(){
  var complete=missing().attendance(UUID.randomUUID(),"scope",required,required);var request=UUID.randomUUID();
  assertThat(complete.allowed("scope")).isFalse();
  var pending=complete.request(request,"scope");assertThat(pending.allowed("scope")).isFalse();
  assertThat(pending.decide(request,true,"scope").allowed("scope")).isTrue();
  assertThat(pending.decide(request,false,"scope").allowed("scope")).isFalse();
 }
 @Test void changesInSessionAssignmentOrApprovalInvalidateSnapshot(){
  var state=GroupState.initial().attendance(UUID.randomUUID(),"old",required,required);
  assertThat(state.allowed("new")).isFalse();
 }
 @Test void replacementAttendanceInvalidatesPendingRequest(){
  var id=UUID.randomUUID();
  var state=missing().attendance(UUID.randomUUID(),"scope",required,required).request(id,"scope")
    .attendance(UUID.randomUUID(),"scope",required,required);
  assertThatThrownBy(()->state.decide(id,true,"scope")).isInstanceOf(IllegalStateException.class);
 }
 @Test void legalCannotOriginateReopen(){assertThatThrownBy(()->missing().decide(UUID.randomUUID(),true,"scope")).isInstanceOf(IllegalStateException.class);}
 @Test void guardianCannotReplaceDirectBeneficiary(){assertThatThrownBy(()->GroupState.initial().attendance(UUID.randomUUID(),"s",required,Set.of(a,UUID.randomUUID()))).isInstanceOf(IllegalArgumentException.class);}
 @Test void emptyRequiredSetNeverMakesGateReady(){assertThatThrownBy(()->GroupState.initial().attendance(UUID.randomUUID(),"s",Set.of(),Set.of())).isInstanceOf(IllegalArgumentException.class);}
}
