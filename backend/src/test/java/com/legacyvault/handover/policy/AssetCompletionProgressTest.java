package com.legacyvault.handover.policy;

import org.junit.jupiter.api.Test;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class AssetCompletionProgressTest {
    private final UUID a = UUID.randomUUID();
    private final UUID b = UUID.randomUUID();

    @Test
    void partialScopeCannotPassEvenWithOutOfScopeDeliveries() {
        var progress = AssetCompletionProgress.from(List.of(a, b), List.of(a, UUID.randomUUID()));
        assertEquals(1, progress.delivered());
        assertEquals(2, progress.total());
        assertEquals(1, progress.pending());
        assertFalse(progress.allDelivered());
    }

    @Test
    void duplicateRowsDoNotInflateProgressOrDenominator() {
        var progress = AssetCompletionProgress.from(List.of(a, a, b), List.of(a, a));
        assertEquals(new AssetCompletionProgress(1, 2), progress);
        assertFalse(progress.allDelivered());
    }

    @Test
    void completeScopePassesRegardlessOfOrder() {
        var progress = AssetCompletionProgress.from(List.of(a, b), List.of(b, a));
        assertTrue(progress.allDelivered());
        assertEquals(0, progress.pending());
    }

    @Test
    void absentScopeAndAbsentDeliveryDoNotEstablishCompletion() {
        assertFalse(AssetCompletionProgress.from(List.of(), List.of(a)).allDelivered());
        assertFalse(AssetCompletionProgress.from(List.of(a), List.of()).allDelivered());
    }

    @Test
    void rejectsUnavailableOrMalformedInputsRatherThanTreatingThemAsZero() {
        assertThrows(NullPointerException.class, () -> AssetCompletionProgress.from(null, List.of()));
        assertThrows(NullPointerException.class, () -> AssetCompletionProgress.from(List.of(), null));
        assertThrows(NullPointerException.class, () -> AssetCompletionProgress.from(Arrays.asList(a, null), List.of()));
        assertThrows(NullPointerException.class, () -> AssetCompletionProgress.from(List.of(a), Arrays.asList(a, null)));
        assertThrows(IllegalArgumentException.class, () -> new AssetCompletionProgress(2, 1));
        assertThrows(IllegalArgumentException.class, () -> new AssetCompletionProgress(-1, 1));
    }
}
