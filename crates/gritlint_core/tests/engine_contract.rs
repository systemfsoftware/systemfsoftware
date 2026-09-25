#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::panic,
    clippy::disallowed_methods,
    clippy::disallowed_types
)]

use gritlint_core::engine::{
    self, EngineOutcome, EngineRequest, InputFile, NamedPattern, TargetLanguage,
};
use std::collections::BTreeMap;

const SINGLE_PACKAGE_JSON: &str = include_str!("fixtures/engine/single/package.json");
const SAME_DIR_TSCONFIG: &str = include_str!("fixtures/engine/same-dir/tsconfig.json");
const SAME_DIR_PACKAGE: &str = include_str!("fixtures/engine/same-dir/package.json");
const OTHER_DIR_TSCONFIG: &str = include_str!("fixtures/engine/other-dir-a/tsconfig.json");
const OTHER_DIR_PACKAGE: &str = include_str!("fixtures/engine/other-dir-b/package.json");
const EXPORTS_ORDERED: &str = include_str!("fixtures/engine/exports/ordered.json");
const EXPORTS_REVERSED: &str = include_str!("fixtures/engine/exports/reversed.json");
const JSONC_TSCONFIG: &str = include_str!("fixtures/engine/jsonc/tsconfig.json");
const BROKEN_PACKAGE_JSON: &str = include_str!("fixtures/engine/broken/package.json");
const VITE_CONFIG_TS: &str = include_str!("fixtures/engine/ts/vite.config.ts");
const VITE_CONFIG_JS: &str = include_str!("fixtures/engine/ts/vite.config.js");
const VITE_CONFIG_OTHER_TS: &str = include_str!("fixtures/engine/ts/vite.config.other.ts");
const PARAMS_APP_JSON: &str = include_str!("fixtures/engine/params/app.json");

const SINGLE_FILE_JSON_PATTERN: &str = r#"`"react": $_`"#;

const REACT_LIBRARY: &[(&str, &str)] = &[(
    "react_dependency",
    r#"pattern react_dependency() { `"react": $_` }"#,
)];

const SIBLING_JOIN_PATTERN: &str = r#"
multifile {
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)tsconfig\.json"($dir),
    $body <: contains `"compilerOptions"`
  },
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)package\.json"($package_dir),
    $package_dir <: $dir,
    $body <: contains `"vite": $_`
  }
}
"#;

const EXPORTS_TYPES_FIRST_PATTERN: &str = r#"`".": { "types": $_, "default": $_ }`"#;
const EXPORTS_DEFAULT_FIRST_PATTERN: &str = r#"`".": { "default": $_, "types": $_ }`"#;

const JSONC_PATTERN: &str = r#"`"compilerOptions": $_`"#;

const SSR_CONDITIONS_PATTERN: &str = r"
`defineConfig($config)` where {
  $config <: contains `ssr: $ssr`,
  $ssr <: contains `resolve: $resolve`,
  $resolve <: contains `conditions: [$_]`
}
";

const BOUND_CONDITION_PATTERN: &str =
    r#"`"conditions": [$condition]` where { $condition <: condition() }"#;

const POISONED_USER_PATTERN: &str = r#"---
title: User rule
---

# User rule

A user-level pattern that must never reach a gritlint run.

```grit
`"react": $_`
```
"#;

const POISONED_GRIT_YAML: &str = "patterns:\n  - name: user-rule\n    level: error\n";

fn json() -> TargetLanguage {
    TargetLanguage::from_extension("json").expect("the json grammar is compiled in")
}

fn tsx() -> TargetLanguage {
    TargetLanguage::from_extension("ts").expect("the typescript grammar is compiled in")
}

fn request(
    body: &str,
    language: TargetLanguage,
    library: &[(&str, &str)],
    parameters: &[(&str, &str)],
    files: &[(&str, &str)],
) -> EngineRequest {
    EngineRequest {
        body: body.to_owned(),
        library: library
            .iter()
            .map(|(name, definition)| NamedPattern {
                name: (*name).to_owned(),
                body: (*definition).to_owned(),
            })
            .collect(),
        language,
        parameters: parameters
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect::<BTreeMap<String, String>>(),
        files: files
            .iter()
            .map(|(path, contents)| InputFile {
                path: (*path).to_owned(),
                contents: (*contents).to_owned(),
            })
            .collect(),
    }
}

fn run(
    body: &str,
    language: TargetLanguage,
    library: &[(&str, &str)],
    parameters: &[(&str, &str)],
    files: &[(&str, &str)],
) -> EngineOutcome {
    let request = request(body, language, library, parameters, files);
    engine::run(&request).unwrap_or_else(|error| panic!("engine run failed: {error}"))
}

fn matched_paths(outcome: &EngineOutcome) -> Vec<&str> {
    let mut paths: Vec<&str> = outcome.matches.iter().map(|m| m.path.as_str()).collect();
    paths.sort_unstable();
    paths
}

#[test]
fn a_single_file_json_pattern_reports_the_path_and_line() {
    let outcome = run(
        SINGLE_FILE_JSON_PATTERN,
        json(),
        &[],
        &[],
        &[("single/package.json", SINGLE_PACKAGE_JSON)],
    );

    assert_eq!(
        matched_paths(&outcome),
        ["single/package.json"],
        "{outcome:#?}"
    );
    let found = &outcome.matches[0];
    assert!(
        found
            .ranges
            .iter()
            .any(|range| range.start_line == 4 && range.start_column == 5),
        "expected a range on the `\"react\"` pair at line 4: {found:#?}"
    );
    assert!(outcome.diagnostics.is_empty(), "{outcome:#?}");
}

#[test]
fn a_named_definition_from_the_library_is_callable_from_the_body() {
    let outcome = run(
        "react_dependency()",
        json(),
        REACT_LIBRARY,
        &[],
        &[("single/package.json", SINGLE_PACKAGE_JSON)],
    );

    assert_eq!(
        matched_paths(&outcome),
        ["single/package.json"],
        "{outcome:#?}"
    );
}

#[test]
fn a_multifile_sibling_join_reports_one_match_per_file_in_the_batch() {
    let together = run(
        SIBLING_JOIN_PATTERN,
        json(),
        &[],
        &[],
        &[
            ("same-dir/tsconfig.json", SAME_DIR_TSCONFIG),
            ("same-dir/package.json", SAME_DIR_PACKAGE),
        ],
    );

    assert_eq!(
        matched_paths(&together),
        ["same-dir/package.json", "same-dir/tsconfig.json"],
        "a successful multifile step is attributed to every file in the batch, not only to \
         the files its where clause touched (`exec_step` in marzano_context.rs sets \
         input_matches for each file pointer in the binding): {together:#?}"
    );
    assert!(
        together.diagnostics.is_empty(),
        "a clean join must not log diagnostics: {together:#?}"
    );

    let apart = run(
        SIBLING_JOIN_PATTERN,
        json(),
        &[],
        &[],
        &[
            ("other-dir-a/tsconfig.json", OTHER_DIR_TSCONFIG),
            ("other-dir-b/package.json", OTHER_DIR_PACKAGE),
        ],
    );

    assert!(
        apart.matches.is_empty(),
        "two files in different directories are not siblings: {apart:#?}"
    );
}

#[test]
fn an_object_pattern_detects_key_order_in_an_exports_subpath() {
    let ordered = run(
        EXPORTS_TYPES_FIRST_PATTERN,
        json(),
        &[],
        &[],
        &[("exports/ordered.json", EXPORTS_ORDERED)],
    );
    assert_eq!(
        matched_paths(&ordered),
        ["exports/ordered.json"],
        "{ordered:#?}"
    );

    let reversed = run(
        EXPORTS_TYPES_FIRST_PATTERN,
        json(),
        &[],
        &[],
        &[("exports/reversed.json", EXPORTS_REVERSED)],
    );
    assert!(
        reversed.matches.is_empty(),
        "the pattern demands `types` before `default`: {reversed:#?}"
    );

    let mirrored_reversed = run(
        EXPORTS_DEFAULT_FIRST_PATTERN,
        json(),
        &[],
        &[],
        &[("exports/reversed.json", EXPORTS_REVERSED)],
    );
    assert_eq!(
        matched_paths(&mirrored_reversed),
        ["exports/reversed.json"],
        "the mirrored pattern must be the one that matches the reversed file: {mirrored_reversed:#?}"
    );
}

#[test]
fn json_with_line_and_block_comments_parses_and_matches() {
    let outcome = run(
        JSONC_PATTERN,
        json(),
        &[],
        &[],
        &[("jsonc/tsconfig.json", JSONC_TSCONFIG)],
    );

    assert_eq!(
        matched_paths(&outcome),
        ["jsonc/tsconfig.json"],
        "this tree-sitter-json rev registers `//` and `/* */` comments as extras \
         (resources/language-metavariables/tree-sitter-json/grammar.js), so a commented \
         tsconfig parses and matches instead of erroring: {outcome:#?}"
    );
    assert!(
        outcome.matches[0]
            .ranges
            .iter()
            .any(|range| range.start_line == 4),
        "the matched pair begins on line 4: {outcome:#?}"
    );
    assert!(
        outcome.diagnostics.is_empty(),
        "a commented json file is not an instrument error: {outcome:#?}"
    );
}

#[test]
fn malformed_json_yields_a_parse_diagnostic_that_names_the_file() {
    let outcome = run(
        JSONC_PATTERN,
        json(),
        &[],
        &[],
        &[("broken/package.json", BROKEN_PACKAGE_JSON)],
    );

    let parse_diagnostics: Vec<_> = outcome
        .diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.message.contains("Error parsing source code"))
        .collect();
    assert!(
        !parse_diagnostics.is_empty(),
        "a file left with ERROR or MISSING nodes must be reported, so gritlint can exit 2 \
         instead of passing a file it could not read: {outcome:#?}"
    );
    assert!(
        parse_diagnostics
            .iter()
            .all(|diagnostic| diagnostic.path == "broken/package.json"),
        "the diagnostic names the file it could not parse: {outcome:#?}"
    );
    assert!(
        parse_diagnostics
            .iter()
            .all(|diagnostic| diagnostic.level < 400),
        "the engine reports these at error severity (`AnalysisLog::is_error` is level < 400): \
         {outcome:#?}"
    );
}

#[test]
fn a_typescript_pattern_finds_ssr_conditions_in_ts_and_js() {
    let typescript = run(
        SSR_CONDITIONS_PATTERN,
        tsx(),
        &[],
        &[],
        &[("ts/vite.config.ts", VITE_CONFIG_TS)],
    );
    assert_eq!(
        matched_paths(&typescript),
        ["ts/vite.config.ts"],
        "{typescript:#?}"
    );

    let javascript = run(
        SSR_CONDITIONS_PATTERN,
        tsx(),
        &[],
        &[],
        &[("ts/vite.config.js", VITE_CONFIG_JS)],
    );
    assert_eq!(
        matched_paths(&javascript),
        ["ts/vite.config.js"],
        "{javascript:#?}"
    );

    let elsewhere = run(
        SSR_CONDITIONS_PATTERN,
        tsx(),
        &[],
        &[],
        &[("ts/vite.config.other.ts", VITE_CONFIG_OTHER_TS)],
    );
    assert!(
        elsewhere.matches.is_empty(),
        "`conditions` outside `ssr.resolve` is not the configured condition: {elsewhere:#?}"
    );
}

#[test]
fn a_bound_parameter_changes_what_matches() {
    let browser = run(
        BOUND_CONDITION_PATTERN,
        json(),
        &[],
        &[("condition", r#"`"browser"`"#)],
        &[("params/app.json", PARAMS_APP_JSON)],
    );
    assert_eq!(matched_paths(&browser), ["params/app.json"], "{browser:#?}");

    let node = run(
        BOUND_CONDITION_PATTERN,
        json(),
        &[],
        &[("condition", r#"`"node"`"#)],
        &[("params/app.json", PARAMS_APP_JSON)],
    );
    assert!(
        node.matches.is_empty(),
        "the same pattern bound to another condition must not match: {node:#?}"
    );
}

#[test]
fn an_unbound_parameter_fails_to_compile_instead_of_matching_nothing() {
    let request = request(
        BOUND_CONDITION_PATTERN,
        json(),
        &[],
        &[],
        &[("params/app.json", PARAMS_APP_JSON)],
    );

    let error = engine::run(&request).unwrap_err();
    let message = error.to_string();
    assert!(
        message.contains("condition"),
        "the compile error must name the unbound parameter: {message}"
    );
}

#[test]
fn a_parameter_that_collides_with_a_library_pattern_is_rejected() {
    let request = request(
        "react_dependency()",
        json(),
        REACT_LIBRARY,
        &[("react_dependency", r#"`"react": $_`"#)],
        &[("single/package.json", SINGLE_PACKAGE_JSON)],
    );

    let error = engine::run(&request).unwrap_err();
    assert!(
        error.to_string().contains("react_dependency"),
        "the collision must name the parameter: {error}"
    );
}

const CHILD_OUTCOME_ENV: &str = "GRITLINT_ENGINE_CONTRACT_CHILD_OUTCOME";

#[test]
fn a_poisoned_home_and_cwd_change_nothing() {
    let outcome = run(
        SINGLE_FILE_JSON_PATTERN,
        json(),
        &[],
        &[],
        &[("single/package.json", SINGLE_PACKAGE_JSON)],
    );
    let clean = format!("{outcome:#?}");

    if let Some(path) = std::env::var_os(CHILD_OUTCOME_ENV) {
        std::fs::write(path, clean).expect("write the child outcome");
        return;
    }

    let sandbox = unique_temp_dir("poisoned");
    let home = sandbox.join("home");
    let scan_root = sandbox.join("scan-root");
    std::fs::create_dir_all(home.join(".grit/patterns")).expect("create the user grit directory");
    std::fs::create_dir_all(&scan_root).expect("create the scan root");
    std::fs::write(
        home.join(".grit/patterns/user-rule.md"),
        POISONED_USER_PATTERN,
    )
    .expect("write the user pattern");
    std::fs::write(home.join(".grit/grit.yaml"), POISONED_GRIT_YAML)
        .expect("write the user grit.yaml");
    std::fs::write(scan_root.join("grit.yaml"), POISONED_GRIT_YAML)
        .expect("write the cwd grit.yaml");
    let child_outcome = sandbox.join("child-outcome.txt");

    let output = std::process::Command::new(std::env::current_exe().expect("test binary path"))
        .args(["--exact", "a_poisoned_home_and_cwd_change_nothing"])
        .env("HOME", &home)
        .env("GRIT_CONFIG", home.join(".grit/grit.yaml"))
        .env(CHILD_OUTCOME_ENV, &child_outcome)
        .current_dir(&scan_root)
        .output()
        .expect("re-run this test in a child process");

    assert!(
        output.status.success(),
        "the child process failed: {}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let poisoned = std::fs::read_to_string(&child_outcome).expect("read the child outcome");
    assert_eq!(
        poisoned, clean,
        "a user-level grit config and a grit.yaml in the cwd must not change a run's results"
    );

    std::fs::remove_dir_all(&sandbox).expect("remove the sandbox");
}

fn unique_temp_dir(label: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "gritlint-engine-contract-{}-{label}",
        std::process::id()
    ));
    if dir.exists() {
        std::fs::remove_dir_all(&dir).expect("clear the sandbox");
    }
    std::fs::create_dir_all(&dir).expect("create the sandbox");
    dir
}
