package com.legacyvault.verification.group;
import java.util.*;
/**
 * Máy trạng thái bất biến của cổng bàn giao nhóm, lưu dưới dạng JSON trong {@code handover_group_events.state_json}.
 *
 * - {@code status}: UNCONFIRMED, READY, SUSPENDED hoặc AWAITING_LEGAL.
 * - {@code revision}: tăng 1 sau mỗi thao tác.
 * - {@code attendanceId}: sự kiện điểm danh hiện hành.
 * - {@code snapshot}: vân tay phạm vi lúc điểm danh.
 * - {@code allPresent}: mọi người thụ hưởng cần thiết đã có mặt.
 * - {@code requestId}: yêu cầu mở lại đang chờ (nếu có).
 */
public record GroupState(String status,long revision,UUID attendanceId,String snapshot,boolean allPresent,UUID requestId) {
 /**
  * Trạng thái ban đầu: UNCONFIRMED, revision 0.
  */
 public static GroupState initial(){return new GroupState("UNCONFIRMED",0,null,null,false,null);}
 /**
  * Ghi điểm danh: READY nếu đủ người và chưa bị giữ (SUSPENDED/AWAITING_LEGAL), ngược lại SUSPENDED.
  *
  * @throws IllegalArgumentException nếu tập cần có rỗng hoặc có người ngoài phạm vi
  */
 public GroupState attendance(UUID id,String hash,Set<UUID> required,Set<UUID> present){
  if(required.isEmpty() || !required.containsAll(present)) throw new IllegalArgumentException("Invalid direct-beneficiary scope");
  boolean all=required.equals(present);
  boolean held=Set.of("SUSPENDED","AWAITING_LEGAL").contains(status);
  return new GroupState(all&&!held?"READY":"SUSPENDED",revision+1,id,hash,all,null);
 }
 /**
  * Staff xin mở lại: chỉ từ SUSPENDED, đã đủ người và vân tay còn khớp, sang AWAITING_LEGAL.
  *
  * @throws IllegalStateException nếu điều kiện không đạt
  */
 public GroupState request(UUID id,String current){
  if(!status.equals("SUSPENDED") || !allPresent || !Objects.equals(snapshot,current)) throw new IllegalStateException("Current complete attendance required");
  return new GroupState("AWAITING_LEGAL",revision+1,attendanceId,snapshot,true,id);
 }
 /**
  * Legal quyết định: từ AWAITING_LEGAL, đúng {@code requestId} và vân tay còn khớp; APPROVE sang READY, REJECT sang SUSPENDED.
  *
  * @throws IllegalStateException nếu yêu cầu cũ hoặc không khớp
  */
 public GroupState decide(UUID id,boolean approve,String current){
  if(!status.equals("AWAITING_LEGAL") || id==null || !id.equals(requestId) || !allPresent || !Objects.equals(snapshot,current)) throw new IllegalStateException("Stale Staff request");
  return new GroupState(approve?"READY":"SUSPENDED",revision+1,attendanceId,snapshot,true,null);
 }
 /**
  * True khi cổng đang READY, đủ người và vân tay còn khớp {@code current}; điều kiện cho phép giao tài sản.
  */
 public boolean allowed(String current){return status.equals("READY") && allPresent && Objects.equals(snapshot,current);}
}
