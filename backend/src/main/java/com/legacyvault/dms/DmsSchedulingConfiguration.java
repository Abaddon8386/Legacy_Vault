package com.legacyvault.dms;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Bật cơ chế lập lịch của Spring ({@code @EnableScheduling}) để {@link DmsScanJob} chạy theo {@code @Scheduled}.
 */
@Configuration
@EnableScheduling
public class DmsSchedulingConfiguration {
}
