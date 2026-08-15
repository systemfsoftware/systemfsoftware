//! A dprint plugin that formats TypeScript and then decides between two
//! spellings of the same type.
//!
//! Why one plugin rather than two: dprint hands a file to exactly one plugin.
//! Adding a second plugin for the same extension does not chain them — the
//! `associations` entry that makes the second one match takes the file away from
//! the first, which was measured by formatting a deliberately misformatted file
//! and seeing the spacing survive untouched. So the upstream TypeScript
//! formatter is a dependency of this crate and runs first, in process.
//!
//! Why a formatter rather than a lint rule: a lint rule reports the spelling it
//! dislikes and leaves both in the language, so something upstream still has to
//! record which one an author picked. A formatter deletes the choice. After
//! `dprint fmt` only one spelling is on disk, and `dprint check` fails on any
//! other — there is no comment, annotation or manifest entry that makes it pass,
//! because the check compares the file to what the formatter would write.

pub mod canonical;
pub mod configuration;

#[cfg(target_arch = "wasm32")]
mod wasm_plugin;

use std::path::Path;

pub use canonical::canonicalize;
pub use configuration::Configuration;

/// Format one file, returning `None` when it is already canonical.
///
/// The order is formatter, canonicaliser, formatter. The first pass is required
/// because canonicalisation reads spans off a parse and has to see the text as
/// it will be written. The last pass is required because a rewrite changes a
/// line's length: `Array<Alpha | Beta>` is longer than `(Alpha | Beta)[]` and may
/// now cross the line width. Without it the output would not be a fixed point of
/// the formatter, so `dprint check` could never pass on a file this plugin had
/// just written — the failure would look like a formatting disagreement rather
/// than a missing pass.
///
/// Re-formatting cannot undo the canonical form: no formatting option rewrites
/// `Array<T>` back to `T[]`, so the two passes converge rather than fight.
fn format_once(path: &Path, source: &str, config: &Configuration) -> anyhow::Result<Option<String>> {
  Ok(dprint_plugin_typescript::format_text(dprint_plugin_typescript::FormatTextOptions {
    path,
    extension: None,
    text: source.to_string(),
    config: &config.typescript,
    external_formatter: None,
  })?)
}

pub fn format_text(path: &Path, source: &str, config: &Configuration) -> anyhow::Result<Option<String>> {
  let formatted = format_once(path, source, config)?;
  let text = formatted.as_deref().unwrap_or(source);
  let Some(canonical) = canonicalize(path, text, config.array_type, config.max_passes)? else {
    // Nothing to canonicalise, so the answer is whatever the formatter decided.
    return Ok(formatted);
  };
  let settled = format_once(path, &canonical, config)?.unwrap_or(canonical);
  Ok(if settled == source { None } else { Some(settled) })
}
