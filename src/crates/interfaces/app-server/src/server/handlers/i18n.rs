use crate::agent::opc_error;
use crate::role::{AppClient, AppServer};
use crate::schema::*;
use agent_client_protocol::{Builder, HandleDispatchFrom};

pub(in crate::server) fn builder() -> Builder<AppServer, impl HandleDispatchFrom<AppClient>> {
    AppServer
        .builder()
        .name("i18n handlers")
        .on_receive_request(
            async move |_: I18nGetCurrentLanguageMessage, p, _| {
                let result = async {
                    let s = opc_core::service::config::get_global_config_service().await?;
                    Ok::<_, opc_core::OpcTeamError>(
                        s.get_config::<String>(Some("app.language"))
                            .await
                            .unwrap_or_else(|_| "zh-CN".to_string()),
                    )
                }
                .await
                .map(|language| I18nGetCurrentLanguageResponse { language })
                .map_err(opc_error);
                p.respond_with_result(result)
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |r: I18nSetLanguageMessage, p, _| {
                let result = async {
                    let locale = opc_core::service::i18n::LocaleId::from_str(&r.language)
                        .ok_or_else(|| {
                            opc_core::OpcTeamError::validation(format!(
                                "Unsupported language: {}",
                                r.language
                            ))
                        })?;
                    opc_core::service::config::get_global_config_service()
                        .await?
                        .set_config("app.language", locale.as_str())
                        .await?;
                    let _ = opc_core::service::i18n::sync_global_i18n_service_locale(locale).await;
                    Ok::<_, opc_core::OpcTeamError>(locale.as_str().to_string())
                }
                .await
                .map(|language| I18nSetLanguageResponse { language })
                .map_err(opc_error);
                p.respond_with_result(result)
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |_: I18nGetConfigMessage, p, _| {
                let result = async {
                    let s = opc_core::service::config::get_global_config_service().await?;
                    Ok::<_, opc_core::OpcTeamError>(I18nGetConfigResponse {
                        current_language: s
                            .get_config::<String>(Some("app.language"))
                            .await
                            .unwrap_or_else(|_| "zh-CN".to_string()),
                        fallback_language: "en-US".to_string(),
                        auto_detect: false,
                    })
                }
                .await
                .map_err(opc_error);
                p.respond_with_result(result)
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |r: I18nSetConfigMessage, p, _| {
                let result = async {
                    if let Some(language) = r.current_language.as_deref() {
                        let locale = opc_core::service::i18n::LocaleId::from_str(language)
                            .ok_or_else(|| {
                                opc_core::OpcTeamError::validation(format!(
                                    "Unsupported language: {}",
                                    language
                                ))
                            })?;
                        opc_core::service::config::get_global_config_service()
                            .await?
                            .set_config("app.language", locale.as_str())
                            .await?;
                        let _ =
                            opc_core::service::i18n::sync_global_i18n_service_locale(locale).await;
                    }
                    Ok::<_, opc_core::OpcTeamError>(())
                }
                .await
                .map(|()| I18nSetConfigResponse {})
                .map_err(opc_error);
                p.respond_with_result(result)
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |_: I18nGetSupportedLanguagesMessage, p, _| {
                let locales = opc_core::service::i18n::LocaleMetadata::all()
                    .into_iter()
                    .map(|locale| I18nLocaleMetadata {
                        id: locale.id.as_str().to_string(),
                        name: locale.name,
                        english_name: locale.english_name,
                        native_name: locale.native_name,
                        rtl: locale.rtl,
                    })
                    .collect();
                p.respond(I18nGetSupportedLanguagesResponse { locales })
            },
            agent_client_protocol::on_receive_request!(),
        )
}
