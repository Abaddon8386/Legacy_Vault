package com.legacyvault.admin;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/overview")
@PreAuthorize("hasRole('ADMIN')")
public class AdminOverviewController {
    private final AdminOverviewService service;
    public AdminOverviewController(AdminOverviewService service) {this.service=service;}
    @GetMapping public ResponseEntity<AdminOverview> overview() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.overview());
    }
}
