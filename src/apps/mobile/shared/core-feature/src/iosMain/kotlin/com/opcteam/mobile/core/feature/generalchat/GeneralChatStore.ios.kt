package com.opc.mobile.core.feature.generalchat

import com.opc.mobile.core.persistence.iosPersistenceStores
import com.opc.mobile.core.persistence.iosSecureStore
import kotlinx.coroutines.CoroutineScope

public fun GeneralChatStore.Companion.create(scope: CoroutineScope): GeneralChatStore {
    val persistence = iosPersistenceStores("opc-mobile.db")
    return GeneralChatStore.create(
        scope = scope,
        stream = GeneralChatStore.providerStream(),
        drafts = persistence.drafts,
        chats = persistence.chats,
        secure = iosSecureStore("com.opc.mobile.generalchat"),
    )
}
