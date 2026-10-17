package com.legacyvault.subscription;

import com.legacyvault.common.error.ErrorCode;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;

class SubscriptionContractTest {
    @Test
    void openApiRepresentsEveryRuntimeErrorAndResolvesLocalReferences() throws Exception {
        var options=new LoaderOptions();options.setAllowDuplicateKeys(false);
        Map<?,?> document=new Yaml(new SafeConstructor(options)).load(
            Files.readString(Path.of("../docs/api-contracts/openapi.yaml")));
        Object codes=resolve(document,"#/components/schemas/ApiError/properties/code/enum");
        assertEquals(Arrays.stream(ErrorCode.values()).map(Enum::name).collect(Collectors.toSet()),
            new HashSet<>((List<?>)codes));
        walk(document,document);
    }
    private static Object resolve(Map<?,?> root,String ref) {
        Object node=root;
        for(String part:ref.substring(2).split("/")) {
            assertInstanceOf(Map.class,node,"Invalid local reference: "+ref);
            node=((Map<?,?>)node).get(part.replace("~1","/").replace("~0","~"));
            assertNotNull(node,"Unresolved local reference: "+ref);
        }
        return node;
    }
    private static void walk(Map<?,?> root,Object node) {
        if(node instanceof Map<?,?> map) {
            if(map.get("$ref") instanceof String ref && ref.startsWith("#/")) resolve(root,ref);
            map.values().forEach(v->walk(root,v));
        } else if(node instanceof List<?> list) list.forEach(v->walk(root,v));
    }
}
