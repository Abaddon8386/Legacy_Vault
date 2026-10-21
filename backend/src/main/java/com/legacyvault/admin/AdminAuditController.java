package com.legacyvault.admin;
import com.legacyvault.admin.AdminAuditDtos.*;
import com.legacyvault.common.web.PageResponse;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController
@RequestMapping("/api/v1/admin/audit-logs")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAuditController {
    private final AdminAuditService service;
    public AdminAuditController(AdminAuditService service) {this.service=service;}
    @GetMapping public ResponseEntity<PageResponse<Event>> list(@RequestParam(required=false) String from,@RequestParam(required=false) String to,
        @RequestParam(required=false) String action,@RequestParam(required=false) UUID actorId,@RequestParam(required=false) String actorKind,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(from,to,action,actorId,actorKind,page,size));
    }
    @GetMapping("/{id}") public ResponseEntity<Detail> detail(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.detail(id));
    }
}
