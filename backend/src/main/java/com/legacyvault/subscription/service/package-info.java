/**
 * PS-77 / PS-92: logic gói đăng ký và quota. Giới hạn catalog trọn đời (5/50/200 Asset kể cả di chúc; 100 MiB/1 GiB/5 GiB)
 * được áp dụng mặc định ({@code legacyvault.subscription.quota-enforcement-enabled=true}); cờ chỉ là công tắc tắt khẩn cấp.
 * Nâng cấp trả phí không thể tự cấp quyền lợi nếu thiếu đơn thanh toán VNPay đã xác minh.
 * Intake pháp lý PS-41 độc lập với chính sách gói. Xem open-decisions.md mục G.
 */
package com.legacyvault.subscription.service;
