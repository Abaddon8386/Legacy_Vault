package com.legacyvault.admin;

import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.constructor.SafeConstructor;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class AdminAuditOpenApiContractTest {
    @Test void allLocalReferencesResolveAndAuditAdvertisesOnlyGetWithPublicDto() throws Exception {
        Path file=Path.of("docs/api-contracts/openapi.yaml");
        if(!Files.exists(file)) file=Path.of("../docs/api-contracts/openapi.yaml");
        var options=new LoaderOptions();options.setAllowDuplicateKeys(false);
        Map<?,?> root=new Yaml(new SafeConstructor(options)).load(Files.readString(file));
        references(root,root);
        var paths=(Map<?,?>)root.get("paths");
        var overview=(Map<?,?>)paths.get("/api/v1/admin/audit-logs");assertEquals(Set.of("get"),overview.keySet());
        var schemas=(Map<?,?>)((Map<?,?>)root.get("components")).get("schemas");
        var properties=(Map<?,?>)((Map<?,?>)schemas.get("AdminAuditEvent")).get("properties");
        assertEquals(Set.of("id","occurredAt","actor","action","entityType","vaultId"),properties.keySet());
    }
    private void references(Object node,Map<?,?> root) {
        if(node instanceof Map<?,?> map) {
            if(map.get("$ref") instanceof String ref && ref.startsWith("#/")) {
                Object current=root;
                for(String part:ref.substring(2).split("/")) {assertInstanceOf(Map.class,current,ref);current=((Map<?,?>)current).get(part.replace("~1","/").replace("~0","~"));assertNotNull(current,ref);}
            }
            map.values().forEach(x->references(x,root));
        } else if(node instanceof List<?> list) list.forEach(x->references(x,root));
    }
}
