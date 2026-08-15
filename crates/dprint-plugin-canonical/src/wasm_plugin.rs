//! The dprint Wasm plugin entry point.

use dprint_core::configuration::ConfigKeyMap;
use dprint_core::configuration::GlobalConfiguration;
use dprint_core::generate_plugin_code;
use dprint_core::plugins::CheckConfigUpdatesMessage;
use dprint_core::plugins::ConfigChange;
use dprint_core::plugins::FileMatchingInfo;
use dprint_core::plugins::FormatResult;
use dprint_core::plugins::PluginInfo;
use dprint_core::plugins::PluginResolveConfigurationResult;
use dprint_core::plugins::SyncFormatRequest;
use dprint_core::plugins::SyncHostFormatRequest;
use dprint_core::plugins::SyncPluginHandler;

use crate::configuration::Configuration;
use crate::configuration::resolve_config;

struct CanonicalPluginHandler;

impl SyncPluginHandler<Configuration> for CanonicalPluginHandler {
  fn resolve_config(
    &mut self,
    config: ConfigKeyMap,
    global_config: &GlobalConfiguration,
  ) -> PluginResolveConfigurationResult<Configuration> {
    let result = resolve_config(config, global_config);
    PluginResolveConfigurationResult {
      config: result.config,
      diagnostics: result.diagnostics,
      file_matching: FileMatchingInfo {
        file_extensions: vec![
          "ts".to_string(),
          "tsx".to_string(),
          "js".to_string(),
          "jsx".to_string(),
          "mjs".to_string(),
          "cjs".to_string(),
          "mts".to_string(),
          "cts".to_string(),
        ],
        file_names: vec![],
      },
    }
  }

  fn check_config_updates(&self, _message: CheckConfigUpdatesMessage) -> anyhow::Result<Vec<ConfigChange>> {
    Ok(Vec::new())
  }

  fn plugin_info(&mut self) -> PluginInfo {
    PluginInfo {
      name: env!("CARGO_PKG_NAME").to_string(),
      version: env!("CARGO_PKG_VERSION").to_string(),
      config_key: "typescript".to_string(),
      help_url: "https://github.com/systemfsoftware/systemfsoftware".to_string(),
      config_schema_url: String::new(),
      update_url: None,
    }
  }

  fn license_text(&mut self) -> String {
    include_str!("../LICENSE").to_string()
  }

  fn format(
    &mut self,
    request: SyncFormatRequest<Configuration>,
    _format_with_host: impl FnMut(SyncHostFormatRequest) -> FormatResult,
  ) -> FormatResult {
    let source = String::from_utf8(request.file_bytes)?;
    let formatted = crate::format_text(request.file_path, &source, request.config)?;
    Ok(formatted.map(|text| text.into_bytes()))
  }
}

generate_plugin_code!(CanonicalPluginHandler, CanonicalPluginHandler);
