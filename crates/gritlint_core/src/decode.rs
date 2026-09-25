use crate::domain::{
    EmbeddedFile, FixtureCase, FixtureLayout, FixtureRule, FixtureUnit, IgnoreGlobs, Language,
    NonEmpty, Pack, PackName, ParamName, ParsedRule, RawFile, RawTree, RelPath, RuleId, RuleName,
    RuleSource, SelectedFile, SelectedFiles, SourcePath,
};
use crate::engine::{self, EngineRequest};
use crate::error::GritlintError;
use globset::{Glob, GlobSetBuilder};
use regex::Regex;
use schemars::{JsonSchema, Schema, schema_for};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

const MANIFEST: &str = "pack.json";
const RULES_DIR: &str = "rules";

static FILE_ARGUMENT: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"file\(\s*(\$[A-Za-z_][A-Za-z0-9_]*)").ok());

#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
#[schemars(description = "Configuration read from gritlint.json at the scan root.")]
pub struct GritlintConfig {
    #[serde(rename = "$schema", default)]
    #[schemars(description = "Path or URL of this schema, for editors.")]
    pub schema: Option<String>,
    #[serde(default)]
    #[schemars(
        description = "Bundled packs to enable, each mapped to its parameters. A pack that is not listed never runs."
    )]
    pub packs: BTreeMap<String, BTreeMap<String, String>>,
    #[serde(default)]
    #[schemars(
        description = "Consumer rule files or directories (.md or .grit), resolved against this file's directory. Their ids are local/<stem>."
    )]
    pub rules: Vec<PathBuf>,
    #[serde(default)]
    #[schemars(description = "Gitignore-style globs of paths the scan skips.")]
    pub ignore: Vec<String>,
}

impl GritlintConfig {
    pub fn parse(text: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(text)
    }

    #[must_use]
    pub fn schema() -> Schema {
        schema_for!(Self)
    }

    #[must_use]
    pub fn schema_for_packs(packs: &[Pack]) -> Schema {
        let mut schema = Self::schema();
        let properties: serde_json::Map<String, Value> = packs
            .iter()
            .map(|pack| {
                let params: serde_json::Map<String, Value> = pack
                    .required_params()
                    .iter()
                    .map(|param| (param.as_str().to_owned(), json!({ "type": "string" })))
                    .collect();
                let required: Vec<&str> = pack
                    .required_params()
                    .iter()
                    .map(ParamName::as_str)
                    .collect();
                let entry = json!({
                    "type": "object",
                    "properties": params,
                    "required": required,
                    "additionalProperties": false,
                });
                (pack.name().as_str().to_owned(), entry)
            })
            .collect();
        if let Some(packs_schema) = schema
            .as_object_mut()
            .and_then(|root| root.get_mut("properties"))
            .and_then(|root_properties| root_properties.get_mut("packs"))
            .and_then(Value::as_object_mut)
        {
            packs_schema.insert("properties".into(), Value::Object(properties));
            packs_schema.insert("additionalProperties".into(), Value::Bool(false));
        }
        schema
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Manifest {
    #[serde(default)]
    required_params: Vec<String>,
}

pub fn enabled_packs(
    config: &GritlintConfig,
    config_path: &Path,
) -> Result<BTreeMap<PackName, BTreeMap<ParamName, String>>, GritlintError> {
    config
        .packs
        .iter()
        .map(|(pack, params)| {
            let typed = params
                .iter()
                .map(|(name, value)| {
                    ParamName::new(name)
                        .map(|name| (name, value.clone()))
                        .map_err(|_| GritlintError::InvalidParamName {
                            name: name.clone(),
                            config: config_path.to_owned(),
                        })
                })
                .collect::<Result<BTreeMap<_, _>, _>>()?;
            Ok((PackName::new(pack.clone()), typed))
        })
        .collect()
}

pub fn ignore_globs(patterns: &[String]) -> Result<IgnoreGlobs, GritlintError> {
    let mut builder = GlobSetBuilder::new();
    for glob in patterns {
        let compiled = Glob::new(glob).map_err(|error| GritlintError::InvalidIgnoreGlob {
            glob: glob.clone(),
            message: error.to_string(),
        })?;
        builder.add(compiled);
    }
    builder
        .build()
        .map(IgnoreGlobs::new)
        .map_err(|error| GritlintError::InvalidIgnoreGlob {
            glob: patterns.join(", "),
            message: error.to_string(),
        })
}

pub fn embedded_packs(files: &[EmbeddedFile]) -> Result<Vec<Pack>, GritlintError> {
    let grouped = files.iter().fold(
        BTreeMap::<String, Vec<&EmbeddedFile>>::new(),
        |mut grouped, file| {
            if let Some((name, _)) = file.path().split_once('/') {
                grouped.entry(name.to_owned()).or_default().push(file);
            }
            grouped
        },
    );

    grouped
        .into_iter()
        .map(|(name, files)| {
            let manifest_path = format!("{name}/{MANIFEST}");
            let manifest = files
                .iter()
                .find(|file| file.path() == manifest_path)
                .ok_or_else(|| GritlintError::PackManifestMissing {
                    path: PathBuf::from(&name),
                })?;
            let manifest = parse_manifest(manifest.contents(), Path::new(&manifest.path()))?;

            let prefix = format!("{name}/{RULES_DIR}/");
            let mut sources: Vec<RuleSource> = files
                .iter()
                .filter(|file| {
                    file.path().starts_with(&prefix) && is_rule_file(Path::new(file.path()))
                })
                .map(|file| {
                    RuleSource::new(
                        SourcePath::new(PathBuf::from(file.path())),
                        file.contents().to_owned(),
                    )
                })
                .collect();
            sources.sort_by(|left, right| left.path().as_path().cmp(right.path().as_path()));

            Ok(Pack::new(PackName::new(name), manifest, sources))
        })
        .collect()
}

pub fn parse_rule(
    scope: Option<&PackName>,
    source: &RuleSource,
) -> Result<ParsedRule, GritlintError> {
    let path = source.path().as_path();
    let stem = path
        .file_stem()
        .map_or_else(String::new, |stem| stem.to_string_lossy().into_owned());
    let name = RuleName::new(stem.clone());
    let id = scope.map_or_else(
        || RuleId::local(name.clone()),
        |pack| RuleId::in_pack(pack.clone(), name.clone()),
    );

    let (title, message, body) = if is_markdown(path) {
        let (title, description, body) = parse_markdown(source.text(), path)?;
        let message = if description.is_empty() {
            stem.clone()
        } else {
            description
        };
        (title, message, body)
    } else {
        (stem.clone(), stem.clone(), source.text().to_owned())
    };

    let language = Language::of_body(&body).ok_or_else(|| GritlintError::RuleNoLanguage {
        path: path.to_owned(),
    })?;
    let targets = file_targets(&body);

    Ok(ParsedRule::assemble(
        id,
        name,
        title,
        message,
        body,
        source.path().clone(),
        language,
        targets,
        BTreeMap::new(),
    ))
}

pub fn load_rules(
    packs: &[Pack],
    enabled: &BTreeMap<PackName, BTreeMap<ParamName, String>>,
    consumer: Vec<RuleSource>,
    config_path: &Path,
) -> Result<NonEmpty<crate::domain::CompiledRule>, GritlintError> {
    let known = packs
        .iter()
        .map(|pack| pack.name().as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let mut parsed: Vec<ParsedRule> = Vec::new();
    let mut owners: BTreeMap<RuleName, PathBuf> = BTreeMap::new();

    for (name, params) in enabled {
        let pack = packs
            .iter()
            .find(|pack| pack.name() == name)
            .ok_or_else(|| GritlintError::UnknownPack {
                name: name.as_str().to_owned(),
                config: config_path.to_owned(),
                known: known.clone(),
            })?;
        for param in pack.required_params() {
            if !params.contains_key(param) {
                return Err(GritlintError::MissingPackParam {
                    pack: name.as_str().to_owned(),
                    param: param.as_str().to_owned(),
                    config: config_path.to_owned(),
                });
            }
        }
        for source in pack.sources() {
            let mut rule = parse_rule(Some(name), source)?;
            rule.with_params(params.clone());
            push_unique(&mut parsed, &mut owners, rule)?;
        }
    }

    let mut consumer = consumer;
    consumer.sort_by(|left, right| left.path().as_path().cmp(right.path().as_path()));
    consumer.dedup_by(|left, right| left.path() == right.path());
    for source in &consumer {
        push_unique(&mut parsed, &mut owners, parse_rule(None, source)?)?;
    }

    if parsed.is_empty() {
        return Err(GritlintError::NoRulesEnabled {
            config: config_path.to_owned(),
        });
    }

    let compiled = compile_all(&parsed)?;
    NonEmpty::new(compiled).ok_or_else(|| GritlintError::NoRulesEnabled {
        config: config_path.to_owned(),
    })
}

pub fn select_files(raw: Vec<RawFile>, root: &Path) -> Result<SelectedFiles, GritlintError> {
    let files = raw
        .into_iter()
        .map(|file| -> Result<Option<SelectedFile>, GritlintError> {
            match language_of(file.path()) {
                None => Ok(None),
                Some(language) => RelPath::from_root(root, file.path())
                    .map(|relative| {
                        Some(SelectedFile::new(
                            language,
                            relative,
                            file.contents().to_owned(),
                        ))
                    })
                    .map_err(|reason| GritlintError::RelPath {
                        path: file.path().display().to_string(),
                        reason,
                    }),
            }
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect();
    SelectedFiles::new(files, root)
}

pub fn pack_from_tree(tree: &RawTree, directory: &Path) -> Result<Pack, GritlintError> {
    let name = PackName::new(
        directory
            .file_name()
            .map_or_else(String::new, |name| name.to_string_lossy().into_owned()),
    );
    let manifest_path = directory.join(MANIFEST);
    let manifest = tree
        .file(&manifest_path)
        .ok_or_else(|| GritlintError::PackManifestMissing {
            path: directory.to_owned(),
        })?;
    let required = parse_manifest(manifest.contents(), &manifest_path)?;
    let sources = rule_sources_in(tree, &directory.join(RULES_DIR))?;
    Ok(Pack::new(name, required, sources))
}

fn rule_sources_in(tree: &RawTree, directory: &Path) -> Result<Vec<RuleSource>, GritlintError> {
    let mut files = direct_children(tree, directory)
        .into_iter()
        .filter(|path| tree.has_file(path) && is_rule_file(path))
        .collect::<Vec<_>>();
    files.sort();
    files
        .iter()
        .map(|path| source_of(tree, path))
        .collect::<Result<Vec<_>, _>>()
}

pub fn fixture_layout(tree: &RawTree) -> Result<FixtureLayout, GritlintError> {
    let root = tree.root();
    let mut packs = direct_children(tree, root)
        .into_iter()
        .filter(|path| tree.directories().contains(path) && tree.has_file(&path.join(MANIFEST)))
        .collect::<Vec<_>>();
    packs.sort();

    if packs.is_empty() {
        consumer_layout(tree, root)
    } else {
        packs
            .iter()
            .map(|directory| pack_layout(tree, directory))
            .collect::<Result<Vec<_>, _>>()
            .map(FixtureLayout::new)
    }
}

#[must_use]
pub fn is_scannable(path: &Path) -> bool {
    language_of(path).is_some()
}

#[must_use]
pub fn is_rule_file(path: &Path) -> bool {
    path.extension().is_some_and(|extension| {
        extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("grit")
    })
}

fn compile_all(parsed: &[ParsedRule]) -> Result<Vec<crate::domain::CompiledRule>, GritlintError> {
    parsed
        .iter()
        .map(|rule| compile_rule(rule, parsed))
        .collect()
}

pub fn compile_rule(
    rule: &ParsedRule,
    all: &[ParsedRule],
) -> Result<crate::domain::CompiledRule, GritlintError> {
    let libraries: Vec<&ParsedRule> = all.iter().collect();
    let request = EngineRequest {
        body: rule.body().to_owned(),
        library: rule.library_against(&libraries),
        language: rule.language().engine(),
        parameters: rule.engine_parameters(),
        files: Vec::new(),
    };
    engine::run(&request)
        .map(|_| crate::domain::CompiledRule::sealed(rule.clone()))
        .map_err(|error| GritlintError::RuleCompile {
            id: rule.id().as_string(),
            path: rule.path().as_path().to_owned(),
            message: error.to_string(),
        })
}

fn push_unique(
    rules: &mut Vec<ParsedRule>,
    owners: &mut BTreeMap<RuleName, PathBuf>,
    rule: ParsedRule,
) -> Result<(), GritlintError> {
    let Some(first) = owners.get(rule.name()) else {
        owners.insert(rule.name().clone(), rule.path().as_path().to_owned());
        rules.push(rule);
        return Ok(());
    };
    Err(GritlintError::RuleCollision {
        id: rule.id().as_string(),
        first: first.clone(),
        second: rule.path().as_path().to_owned(),
    })
}

fn parse_manifest(text: &str, path: &Path) -> Result<Vec<ParamName>, GritlintError> {
    let manifest: Manifest =
        serde_json::from_str(text).map_err(|source| GritlintError::PackManifestParse {
            path: path.to_owned(),
            source,
        })?;
    manifest
        .required_params
        .iter()
        .map(|name| {
            ParamName::new(name).map_err(|_| GritlintError::InvalidParamName {
                name: name.clone(),
                config: path.to_owned(),
            })
        })
        .collect()
}

fn consumer_layout(tree: &RawTree, root: &Path) -> Result<FixtureLayout, GritlintError> {
    let mut rule_files = direct_children(tree, root)
        .into_iter()
        .filter(|path| tree.has_file(path) && is_rule_file(path))
        .collect::<Vec<_>>();
    rule_files.sort();
    let rules = rule_files
        .iter()
        .map(|path| parse_rule(None, &source_of(tree, path)?))
        .collect::<Result<Vec<_>, _>>()?;
    if rules.is_empty() {
        return Err(GritlintError::NoRulesFound {
            path: root.to_owned(),
        });
    }
    let unit = FixtureUnit {
        base: root.to_owned(),
        rules: rules
            .iter()
            .map(|rule| {
                let fixture = root.join("fixtures").join(rule.name().as_str());
                fixture_rule(tree, rule, &fixture)
            })
            .collect::<Result<Vec<_>, _>>()?,
    };
    Ok(FixtureLayout::new(vec![unit]))
}

fn pack_layout(tree: &RawTree, directory: &Path) -> Result<FixtureUnit, GritlintError> {
    let pack = pack_from_tree(tree, directory)?;
    let rules = pack
        .sources()
        .iter()
        .map(|source| parse_rule(Some(pack.name()), source))
        .collect::<Result<Vec<_>, _>>()?;
    if rules.is_empty() {
        return Err(GritlintError::NoRulesFound {
            path: directory.to_owned(),
        });
    }

    Ok(FixtureUnit {
        base: directory.to_owned(),
        rules: rules
            .iter()
            .map(|rule| {
                let fixture = directory.join("fixtures").join(rule.name().as_str());
                fixture_rule(tree, rule, &fixture)
            })
            .collect::<Result<Vec<_>, _>>()?,
    })
}

fn fixture_rule(
    tree: &RawTree,
    rule: &ParsedRule,
    fixture_directory: &Path,
) -> Result<FixtureRule, GritlintError> {
    Ok(FixtureRule {
        rule: rule.clone(),
        fixture_directory: fixture_directory.to_owned(),
        bad: case_directories(tree, &fixture_directory.join("bad"))
            .into_iter()
            .map(|directory| fixture_case(tree, crate::domain::CaseKind::Bad, &directory))
            .collect::<Result<Vec<_>, _>>()?,
        good: case_directories(tree, &fixture_directory.join("good"))
            .into_iter()
            .map(|directory| fixture_case(tree, crate::domain::CaseKind::Good, &directory))
            .collect::<Result<Vec<_>, _>>()?,
    })
}

fn fixture_case(
    tree: &RawTree,
    kind: crate::domain::CaseKind,
    case_directory: &Path,
) -> Result<FixtureCase, GritlintError> {
    let config_path = case_directory.join("gritlint.json");
    let (params, ignore) = match tree.file(&config_path) {
        None => (BTreeMap::new(), ignore_globs(&[])?),
        Some(file) => {
            let config = GritlintConfig::parse(file.contents()).map_err(|source| {
                GritlintError::ConfigParse {
                    path: config_path.clone(),
                    source,
                }
            })?;
            let params = config
                .packs
                .values()
                .flat_map(|values| values.iter())
                .map(|(name, value)| {
                    ParamName::new(name)
                        .map(|name| (name, value.clone()))
                        .map_err(|_| GritlintError::InvalidParamName {
                            name: name.clone(),
                            config: config_path.clone(),
                        })
                })
                .collect::<Result<BTreeMap<_, _>, _>>()?;
            (params, ignore_globs(&config.ignore)?)
        }
    };

    let files = select_case_files(tree, case_directory, &ignore)?;
    Ok(FixtureCase {
        kind,
        directory: case_directory.to_owned(),
        files,
        params,
    })
}

fn select_case_files(
    tree: &RawTree,
    case_directory: &Path,
    ignore: &IgnoreGlobs,
) -> Result<SelectedFiles, GritlintError> {
    let files = tree
        .files()
        .iter()
        .filter(|file| file.path().starts_with(case_directory))
        .filter(|file| !skipped(file.path(), case_directory))
        .map(|file| -> Result<Option<SelectedFile>, GritlintError> {
            match language_of(file.path()) {
                None => Ok(None),
                Some(language) => RelPath::from_root(case_directory, file.path())
                    .map(|relative| {
                        let selected = relative.as_str().to_owned();
                        let keep = !ignore.matches(&selected);
                        keep.then(|| {
                            SelectedFile::new(language, relative, file.contents().to_owned())
                        })
                    })
                    .map_err(|reason| GritlintError::RelPath {
                        path: file.path().display().to_string(),
                        reason,
                    }),
            }
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect();
    SelectedFiles::new(files, case_directory)
}

fn skipped(path: &Path, case_directory: &Path) -> bool {
    path.strip_prefix(case_directory).is_ok_and(|relative| {
        relative.components().any(|component| {
            let text = component.as_os_str().to_string_lossy();
            text.starts_with('.') || text == "node_modules"
        })
    })
}

fn source_of(tree: &RawTree, path: &Path) -> Result<RuleSource, GritlintError> {
    tree.file(path)
        .map(|file| RuleSource::new(SourcePath::new(path.to_owned()), file.contents().to_owned()))
        .ok_or_else(|| GritlintError::RulePathMissing {
            path: path.to_owned(),
        })
}

fn case_directories(tree: &RawTree, directory: &Path) -> Vec<PathBuf> {
    let mut directories = direct_children(tree, directory)
        .into_iter()
        .filter(|path| tree.directories().contains(path))
        .collect::<Vec<_>>();
    directories.sort();
    directories
}

fn direct_children(tree: &RawTree, directory: &Path) -> Vec<PathBuf> {
    tree.directories()
        .iter()
        .filter(|path| path.parent() == Some(directory))
        .cloned()
        .chain(
            tree.files()
                .iter()
                .map(|file| file.path().to_owned())
                .filter(|path| path.parent() == Some(directory)),
        )
        .collect()
}

fn language_of(path: &Path) -> Option<Language> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Language::from_extension(&extension)
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

fn parse_markdown(text: &str, path: &Path) -> Result<(String, String, String), GritlintError> {
    let lines: Vec<&str> = text.lines().collect();
    let start = first_content(&lines);

    let mut cursor = start;
    let mut title: Option<(usize, String)> = None;
    let mut grit: Option<(usize, usize)> = None;
    while let Some(line) = lines.get(cursor) {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            let is_grit = trimmed.starts_with("```grit");
            let open = cursor + 1;
            let close = (open..lines.len())
                .find(|index| lines.get(*index).is_some_and(|line| line.trim() == "```"))
                .unwrap_or(lines.len());
            if is_grit {
                if grit.is_some() {
                    return Err(GritlintError::RuleNoGritBlock {
                        path: path.to_owned(),
                    });
                }
                grit = Some((cursor, close));
            }
            cursor = close + 1;
            continue;
        }
        if title.is_none() {
            if let Some(heading) = trimmed.strip_prefix("# ") {
                title = Some((cursor, heading.trim().to_owned()));
            }
        }
        cursor += 1;
    }

    let (fence, close) = grit.ok_or_else(|| GritlintError::RuleNoGritBlock {
        path: path.to_owned(),
    })?;
    let body = lines
        .iter()
        .skip(fence + 1)
        .take(close.saturating_sub(fence + 1))
        .copied()
        .collect::<Vec<_>>()
        .join("\n");
    let (title_line, title_text) =
        title.map_or((None, String::new()), |(line, text)| (Some(line), text));
    let description = lines
        .iter()
        .enumerate()
        .skip(start)
        .take(fence.saturating_sub(start))
        .filter(|(line, _)| Some(*line) != title_line)
        .map(|(_, line)| *line)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned();
    Ok((title_text, description, body))
}

fn first_content(lines: &[&str]) -> usize {
    let Some(mut start) = lines.iter().position(|line| !line.trim().is_empty()) else {
        return lines.len();
    };
    if lines.get(start).is_some_and(|line| line.trim() == "---") {
        if let Some(offset) = lines
            .iter()
            .skip(start + 1)
            .position(|line| line.trim() == "---")
        {
            start += offset + 2;
        }
    }
    start.min(lines.len())
}

fn file_targets(body: &str) -> Vec<Regex> {
    let variables = FILE_ARGUMENT
        .iter()
        .flat_map(|detector| detector.captures_iter(body))
        .filter_map(|captures| captures.get(1).map(|capture| capture.as_str().to_owned()))
        .fold(Vec::<String>::new(), |mut variables, variable| {
            if !variables.contains(&variable) {
                variables.push(variable);
            }
            variables
        });

    variables
        .iter()
        .flat_map(|variable| {
            let detector = Regex::new(&format!(
                r#"{}\s*<:\s*r"((?:[^"\\]|\\.)*)""#,
                regex::escape(variable)
            ));
            detector.into_iter().flat_map(move |detector| {
                detector
                    .captures_iter(body)
                    .filter_map(|captures| {
                        captures.get(1).map(|capture| capture.as_str().to_owned())
                    })
                    .filter_map(|pattern| Regex::new(&pattern).ok())
                    .collect::<Vec<_>>()
            })
        })
        .fold(Vec::<Regex>::new(), |mut targets, target| {
            if !targets
                .iter()
                .any(|known| known.as_str() == target.as_str())
            {
                targets.push(target);
            }
            targets
        })
}
