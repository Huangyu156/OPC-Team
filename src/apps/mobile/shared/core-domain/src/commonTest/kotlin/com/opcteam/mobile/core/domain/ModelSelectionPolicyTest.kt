package com.opc.mobile.core.domain

import com.opc.mobile.core.protocol.RemoteModelCatalog
import com.opc.mobile.core.protocol.RemoteModelConfig
import com.opc.mobile.core.protocol.RemoteDefaultModels
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ModelSelectionPolicyTest {
    @Test
    fun rolesUseEnabledDefaultsAndFastFallsBack() {
        val catalog = RemoteModelCatalog(1, listOf(
            RemoteModelConfig("a", "A", "provider", "", "a", enabled = true),
            RemoteModelConfig("b", "B", "provider", "", "b", enabled = false)),
            RemoteDefaultModels(primary = " a ", fast = "b"))
        assertEquals("a", ModelSelectionPolicy.resolve(catalog, " primary ")?.id)
        assertEquals("a", ModelSelectionPolicy.resolve(catalog, " fast ")?.id)
        assertNull(ModelSelectionPolicy.resolve(catalog, "b"))
        assertNull(ModelSelectionPolicy.resolve(catalog, "unknown"))
    }
}
