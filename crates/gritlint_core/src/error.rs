use crate::domain::RelPathRefusal;
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum GritlintError {
    #[error("cannot read `{path}`: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot read config `{path}`: {source}")]
    ConfigRead {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot parse config `{path}`: {source}")]
    ConfigParse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("pack `{name}` is not known to gritlint (config `{config}`); known packs: {known}")]
    UnknownPack {
        name: String,
        config: PathBuf,
        known: String,
    },
    #[error("pack `{pack}` needs parameter `{param}` bound in `{config}`")]
    MissingPackParam {
        pack: String,
        param: String,
        config: PathBuf,
    },
    #[error("pack parameter `{name}` in `{config}` is not a GritQL identifier")]
    InvalidParamName { name: String, config: PathBuf },
    #[error("rule path `{path}` does not exist")]
    RulePathMissing { path: PathBuf },
    #[error("rule `{path}` carries no single ```grit block")]
    RuleNoGritBlock { path: PathBuf },
    #[error(
        "rule `{path}` declares no GritQL language; add e.g. `language json` inside its grit block"
    )]
    RuleNoLanguage { path: PathBuf },
    #[error("rule id `{id}` is defined by both `{first}` and `{second}`")]
    RuleCollision {
        id: String,
        first: PathBuf,
        second: PathBuf,
    },
    #[error("rule `{id}` ({path}) does not compile: {message}")]
    RuleCompile {
        id: String,
        path: PathBuf,
        message: String,
    },
    #[error("no rules are enabled: `{config}` enables no packs and no rule path was given")]
    NoRulesEnabled { config: PathBuf },
    #[error("no rules or packs were found in `{path}`")]
    NoRulesFound { path: PathBuf },
    #[error("the scan root `{root}` selected no files")]
    NoFilesSelected { root: PathBuf },
    #[error("path `{path}` is not a usable relative path: {reason}")]
    RelPath {
        path: String,
        reason: RelPathRefusal,
    },
    #[error("target file `{file}` does not parse: {message}")]
    TargetParse { file: String, message: String },
    #[error("ignore glob `{glob}` is invalid: {message}")]
    InvalidIgnoreGlob { glob: String, message: String },
    #[error("cannot render the report: {message}")]
    Render { message: String },
    #[error("pack `{path}` has no `pack.json` manifest")]
    PackManifestMissing { path: PathBuf },
    #[error("cannot parse pack manifest `{path}`: {source}")]
    PackManifestParse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}
