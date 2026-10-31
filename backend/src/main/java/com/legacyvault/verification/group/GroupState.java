package com.legacyvault.verification.group;
import java.util.*;
public record GroupState(String status,long revision,UUID attendanceId,String snapshot,boolean allPresent,UUID requestId) {
 public static GroupState initial(){return new GroupState("UNCONFIRMED",0,null,null,false,null);}
 public GroupState attendance(UUID id,String hash,Set<UUID> required,Set<UUID> present){
  if(required.isEmpty() || !required.containsAll(present)) throw new IllegalArgumentException("Invalid direct-beneficiary scope");
  boolean all=required.equals(present);
  boolean held=Set.of("SUSPENDED","AWAITING_LEGAL").contains(status);
  return new GroupState(all&&!held?"READY":"SUSPENDED",revision+1,id,hash,all,null);
 }
 public GroupState request(UUID id,String current){
  if(!status.equals("SUSPENDED") || !allPresent || !Objects.equals(snapshot,current)) throw new IllegalStateException("Current complete attendance required");
  return new GroupState("AWAITING_LEGAL",revision+1,attendanceId,snapshot,true,id);
 }
 public GroupState decide(UUID id,boolean approve,String current){
  if(!status.equals("AWAITING_LEGAL") || id==null || !id.equals(requestId) || !allPresent || !Objects.equals(snapshot,current)) throw new IllegalStateException("Stale Staff request");
  return new GroupState(approve?"READY":"SUSPENDED",revision+1,attendanceId,snapshot,true,null);
 }
 public boolean allowed(String current){return status.equals("READY") && allPresent && Objects.equals(snapshot,current);}
}
