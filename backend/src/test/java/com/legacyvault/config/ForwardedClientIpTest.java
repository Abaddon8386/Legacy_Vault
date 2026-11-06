package com.legacyvault.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.tomcat.autoconfigure.servlet.TomcatServletWebServerAutoConfiguration;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.boot.web.server.autoconfigure.servlet.ServletWebServerConfiguration;
import org.springframework.boot.web.server.servlet.context.AnnotationConfigServletWebServerApplicationContext;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/** Proves the real Tomcat (no DB) honours X-Forwarded-For only when forward-headers-strategy is enabled. */
class ForwardedClientIpTest {

    @Test
    void defaultConfigurationIgnoresForwardedHeader() throws Exception {
        assertThat(remoteAddrSeenByServlet(null)).isEqualTo("127.0.0.1");
    }

    @Test
    void nativeStrategyUsesForwardedForFromTrustedProxy() throws Exception {
        assertThat(remoteAddrSeenByServlet("native")).isEqualTo("203.0.113.7");
    }

    private String remoteAddrSeenByServlet(String envValue) throws Exception {
        try (var ctx = new AnnotationConfigServletWebServerApplicationContext()) {
            // Load the real application.yaml; FORWARD_HEADERS_STRATEGY is the env placeholder it reads.
            List<PropertySource<?>> yaml = new YamlPropertySourceLoader()
                    .load("application", new ClassPathResource("application.yaml"));
            var props = new java.util.HashMap<String, Object>();
            props.put("server.port", "0");
            if (envValue != null) {
                props.put("FORWARD_HEADERS_STRATEGY", envValue);
            }
            ctx.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", props));
            ctx.getEnvironment().getPropertySources().addLast(yaml.get(0));
            ctx.register(Config.class);
            ctx.refresh();
            int port = ctx.getWebServer().getPort();
            var response = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/ip"))
                            .header("X-Forwarded-For", "203.0.113.7").build(),
                    HttpResponse.BodyHandlers.ofString());
            return response.body();
        }
    }

    @Configuration
    @Import({ServletWebServerConfiguration.class, TomcatServletWebServerAutoConfiguration.class})
    @EnableConfigurationProperties(ServerProperties.class)
    static class Config {
        @Bean
        ServletRegistrationBean<HttpServlet> ipServlet() {
            return new ServletRegistrationBean<>(new HttpServlet() {
                @Override
                protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws java.io.IOException {
                    resp.getWriter().write(req.getRemoteAddr());
                }
            }, "/ip");
        }
    }
}
