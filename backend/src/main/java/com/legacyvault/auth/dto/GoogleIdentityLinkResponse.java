package com.legacyvault.auth.dto;

/** Acknowledges a successful Google identity link without exposing the provider subject. */
public record GoogleIdentityLinkResponse(boolean linked) {
}
