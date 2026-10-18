package com.legacyvault.verification.dto;
public record HandoverCompletionResponse(CompletionProgressResponse assets,
 CompletionProgressResponse beneficiaries,boolean ready,String reason) {}
