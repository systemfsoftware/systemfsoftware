//! Plugin configuration.
//!
//! This plugin claims the `typescript` config key and the TypeScript file
//! extensions, because dprint gives a file to exactly one plugin: an
//! `associations` entry naming a second one does not chain them, it takes the
//! file away from the first. Composition therefore happens inside this crate —
//! the upstream formatter is a dependency, not a sibling plugin.
//!
//! The consequence for configuration is that every existing `typescript` option
//! keeps working: the map is handed to the upstream resolver after this
//! plugin's own keys are removed from it, so an unknown property is still
//! reported by whichever resolver owns that name.

use dprint_core::configuration::ConfigKeyMap;
use dprint_core::configuration::ConfigurationDiagnostic;
use dprint_core::configuration::GlobalConfiguration;
use dprint_core::configuration::ResolveConfigurationResult;
use dprint_core::configuration::get_value;
use serde::Serialize;

/// Which of the two array spellings survives.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
pub enum ArrayTypeStyle {
  /// `Array<T>` and `ReadonlyArray<T>`.
  Generic,
  /// `T[]` and `readonly T[]`.
  Shorthand,
}

#[derive(Clone, Serialize)]
pub struct Configuration {
  #[serde(rename = "arrayType")]
  pub array_type: ArrayTypeStyle,
  /// A rewrite that has not converged by here is reported rather than retried
  /// forever. Nesting depth is what consumes passes, so this bounds depth.
  #[serde(rename = "maxPasses")]
  pub max_passes: u32,
  /// The upstream formatter's own resolved configuration.
  #[serde(skip)]
  pub typescript: dprint_plugin_typescript::configuration::Configuration,
}

pub fn resolve_config(
  mut config: ConfigKeyMap,
  global_config: &GlobalConfiguration,
) -> ResolveConfigurationResult<Configuration> {
  let mut diagnostics: Vec<ConfigurationDiagnostic> = Vec::new();

  // This plugin's own keys come out first, so what reaches the upstream
  // resolver contains only keys it owns and its unknown-property check stays
  // meaningful.
  let array_type = match get_value(&mut config, "arrayType", String::from("generic"), &mut diagnostics).as_str() {
    "generic" => ArrayTypeStyle::Generic,
    "shorthand" => ArrayTypeStyle::Shorthand,
    other => {
      diagnostics.push(ConfigurationDiagnostic {
        property_name: "arrayType".to_string(),
        message: format!("Expected \"generic\" or \"shorthand\". Actual: \"{other}\""),
      });
      ArrayTypeStyle::Generic
    }
  };
  let max_passes = get_value(&mut config, "maxPasses", 16, &mut diagnostics);

  let upstream = dprint_plugin_typescript::configuration::resolve_config(config, global_config);
  diagnostics.extend(upstream.diagnostics);

  ResolveConfigurationResult {
    config: Configuration {
      array_type,
      max_passes,
      typescript: upstream.config,
    },
    diagnostics,
  }
}
