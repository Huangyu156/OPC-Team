package com.opc.mobile.core.feature.generalchat

import android.content.Context
import com.opc.mobile.core.persistence.androidPersistenceStores
import com.opc.mobile.core.persistence.androidSecureStore
import kotlinx.coroutines.CoroutineScope

public fun GeneralChatStore.Companion.create(
    scope: CoroutineScope,
    context: Context,
): GeneralChatStore {
    val application = context.applicationContext
    val persistence = androidPersistenceStores(application, "opc-mobile.db")
    return GeneralChatStore.create(
        scope = scope,
        stream = GeneralChatStore.providerStream(),
        drafts = persistence.drafts,
        chats = persistence.chats,
        secure = androidSecureStore(application, "general-chat"),
    )
}
