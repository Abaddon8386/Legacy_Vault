package com.legacyvault.admin;

import java.time.Instant;
import java.util.Map;

/**
 * Dữ liệu response của {@code GET /api/v1/admin/overview}.
 * <ul>
 *   <li>{@code totalAccounts}: số tài khoản chưa bị xóa mềm.</li>
 *   <li>{@code activeVaults}: số vault có trạng thái khác ARCHIVED.</li>
 *   <li>{@code processingCases}: số hồ sơ xác minh đang OPEN.</li>
 *   <li>{@code roleAssignments}: map mã role -> số tài khoản đang giữ role đó.</li>
 *   <li>{@code startedAt}/{@code completedAt}: khoảng thời gian (giờ DB, UTC) thu thập số liệu.</li>
 *   <li>{@code consistency}: nhãn mức nhất quán của số liệu.</li>
 * </ul>
 * Counts are sampled during [startedAt, completedAt], not a cross-table historical snapshot.
 */
public record AdminOverview(long totalAccounts, long activeVaults, long processingCases,
        Map<String,Long> roleAssignments, Instant startedAt, Instant completedAt, String consistency) {}
