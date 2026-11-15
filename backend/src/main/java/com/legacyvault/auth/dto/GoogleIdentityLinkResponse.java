package com.legacyvault.auth.dto;

/** Xác nhận liên kết danh tính Google thành công mà không để lộ subject của provider. */
public record GoogleIdentityLinkResponse(boolean linked) {
}
