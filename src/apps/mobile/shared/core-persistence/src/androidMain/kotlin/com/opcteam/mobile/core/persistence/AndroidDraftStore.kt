package com.opc.mobile.core.persistence

import android.content.Context
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import com.opc.mobile.core.persistence.db.MobileDatabase

public fun androidPersistenceStores(context: Context, databaseName: String): MobilePersistenceStores =
    mobilePersistenceStores(AndroidSqliteDriver(MobileDatabase.Schema, context, databaseName))
