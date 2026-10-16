package com.opc.mobile.core.feature.account

import com.opc.mobile.core.feature.CoreLog
import com.opc.mobile.core.transport.TransportLog

internal fun CoreLog.asTransportLog(): TransportLog = object : TransportLog {
    override fun info(message: String) = this@asTransportLog.info(message)
    override fun warn(message: String) = this@asTransportLog.warn(message)
    override fun error(message: String) = this@asTransportLog.error(message)
}
