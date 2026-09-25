#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::panic,
    clippy::disallowed_methods,
    clippy::disallowed_types
)]

use gritlint_core::GritlintError;
use gritlint_core::decide;
use gritlint_core::decode;
use gritlint_core::domain::{NonEmpty, Outcome, ParsedRule, RuleSource, SourcePath};
use gritlint_core::encode;
use gritlint_core::shell;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const SIBLING_JOIN: &str = r#"language json
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

const API_EXTRACTOR: &str = r#"language json
multifile {
  file($name, $body) where {
    $name <: r".*api-extractor\.json$"
  }
}
"#;

const REACT_PAIR: &str = "language json\n`\"react\": $_`\n";

fn write(base: &Path, path: &str, contents: &str) {
    let target = base.join(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).expect("create the parent directory");
    }
    fs::write(target, contents).expect("write the file");
}

fn rule(name: &str, body: &str) -> ParsedRule {
    let source = RuleSource::new(
        SourcePath::new(PathBuf::from(format!("{name}.grit"))),
        body.to_owned(),
    );
    decode::parse_rule(None, &source).expect("parse the rule")
}

fn markdown_rule(name: &str, description: &str, body: &str) -> ParsedRule {
    let source = RuleSource::new(
        SourcePath::new(PathBuf::from(format!("{name}.md"))),
        format!("# {name}\n\n{description}\n\n```grit\n{body}\n```\n"),
    );
    decode::parse_rule(None, &source).expect("parse the markdown rule")
}

fn scan(root: &Path, rules: &[ParsedRule], ignore: &[String]) -> Result<Outcome, GritlintError> {
    let globs = decode::ignore_globs(ignore)?;
    let walked = shell::walk(root, &globs)?;
    let files = decode::select_files(walked, root)?;
    let compiled = rules
        .iter()
        .map(|rule| decode::compile_rule(rule, rules))
        .collect::<Result<Vec<_>, _>>()?;
    let rules = NonEmpty::new(compiled).expect("at least one rule");
    let plan = decide::plan(&rules, &files);
    decide::scan(&plan)
}

fn snapshot(root: &Path) -> Vec<(String, String)> {
    let mut entries = Vec::new();
    collect(root, root, &mut entries);
    entries.sort();
    entries
}

fn collect(root: &Path, dir: &Path, entries: &mut Vec<(String, String)>) {
    for entry in fs::read_dir(dir).expect("read dir") {
        let path = entry.expect("entry").path();
        if path.is_dir() {
            collect(root, &path, entries);
        } else {
            entries.push((
                path.strip_prefix(root)
                    .expect("relative")
                    .to_string_lossy()
                    .replace('\\', "/"),
                fs::read_to_string(&path).expect("read file"),
            ));
        }
    }
}

#[test]
fn a_target_file_that_fails_to_parse_names_the_file() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "tsconfig.json", "{\"compilerOptions\": {");

    let error = scan(temp.path(), &[rule("json", REACT_PAIR)], &[])
        .expect_err("a malformed target file is an instrument error");

    assert!(
        matches!(error, GritlintError::TargetParse { .. }),
        "{error}"
    );
    assert!(error.to_string().contains("tsconfig.json"), "{error}");
}

#[test]
fn a_rule_that_evaluates_zero_files_is_named_on_the_success_line() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(
        temp.path(),
        "packages/app/package.json",
        "{\"name\": \"app\"}",
    );

    let outcome = scan(temp.path(), &[rule("api", API_EXTRACTOR)], &[]).expect("a clean scan");

    assert!(outcome.findings().is_empty(), "{outcome:#?}");
    assert_eq!(decide::exit_code(outcome.verdict()), 0);
    assert_eq!(outcome.zero_file_rules(), vec!["local/api".to_owned()]);
    let human = encode::render_human(&outcome);
    assert!(human.contains("local/api: evaluated 0 file(s)"), "{human}");
    assert!(human.contains("zero-file rules: local/api"), "{human}");
}

#[test]
fn a_violation_carries_the_rule_path_line_and_description() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(
        temp.path(),
        "package.json",
        "{\n  \"name\": \"app\",\n  \"console\": \"debug\"\n}\n",
    );
    let rule = markdown_rule(
        "no-console",
        "Remove the debug console call.",
        "language json\n`\"console\": $_`\n",
    );

    let outcome = scan(temp.path(), std::slice::from_ref(&rule), &[]).expect("scan");

    assert_eq!(decide::exit_code(outcome.verdict()), 1);
    assert_eq!(outcome.findings().len(), 1, "{outcome:#?}");
    let finding = &outcome.findings()[0];
    assert_eq!(finding.rule_id().as_string(), "local/no-console");
    assert_eq!(finding.path().as_str(), "package.json");
    assert_eq!(finding.line(), 3);
    assert_eq!(finding.message(), "Remove the debug console call.");
}

#[test]
fn a_tree_of_node_modules_and_gitignored_files_names_the_root() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), ".gitignore", "ignored.json\n");
    write(temp.path(), "node_modules/pkg.json", "{\"name\": \"dep\"}");
    write(temp.path(), "ignored.json", "{\"name\": \"ignored\"}");

    let error = scan(temp.path(), &[rule("json", REACT_PAIR)], &[])
        .expect_err("selecting no files is an instrument error");

    assert!(
        matches!(error, GritlintError::NoFilesSelected { .. }),
        "{error}"
    );
    assert!(error.to_string().contains(temp.path().to_str().unwrap()));
}

#[test]
fn no_enabled_pack_and_no_rule_path_is_an_instrument_error() {
    let error = decode::load_rules(
        &[],
        &BTreeMap::new(),
        Vec::new(),
        Path::new("gritlint.json"),
    )
    .expect_err("a run with no rules must not report a vacuous pass");

    assert!(
        matches!(error, GritlintError::NoRulesEnabled { .. }),
        "{error}"
    );
}

#[test]
fn json_output_holds_one_object_per_finding_and_a_summary() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "a/package.json", "{\"react\": \"18\"}\n");
    write(temp.path(), "b/package.json", "{\"react\": \"19\"}\n");

    let outcome = scan(temp.path(), &[rule("react", REACT_PAIR)], &[]).expect("scan");
    let rendered = encode::render_json(&outcome).expect("render json");
    let parsed: serde_json::Value = serde_json::from_str(&rendered).expect("parseable json");

    let findings = parsed["findings"].as_array().expect("a findings array");
    assert_eq!(findings.len(), 2);
    assert_eq!(findings[0]["rule"], "local/react");
    assert_eq!(parsed["summary"]["findings"], 2);
    assert_eq!(parsed["summary"]["files_selected"], 2);
    assert_eq!(parsed["summary"]["rules"][0]["rule"], "local/react");
    assert_eq!(parsed["summary"]["rules"][0]["files"], 2);
}

#[test]
fn the_same_tree_renders_byte_identical_output() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "package.json", "{\"react\": \"18\"}\n");

    let first = scan(temp.path(), &[rule("react", REACT_PAIR)], &[]).expect("first scan");
    let second = scan(temp.path(), &[rule("react", REACT_PAIR)], &[]).expect("second scan");

    assert_eq!(encode::render_human(&first), encode::render_human(&second));
    assert_eq!(
        encode::render_json(&first).expect("first json"),
        encode::render_json(&second).expect("second json")
    );
}

#[test]
fn a_scan_writes_nothing_to_the_tree() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "package.json", "{\"react\": \"18\"}\n");
    write(temp.path(), "nested/deep.json", "{\"react\": \"19\"}\n");
    let before = snapshot(temp.path());

    scan(temp.path(), &[rule("react", REACT_PAIR)], &[]).expect("scan");

    assert_eq!(before, snapshot(temp.path()));
}

#[test]
fn a_multifile_rule_reports_one_finding_per_directory() {
    let temp = tempfile::tempdir().expect("temp dir");
    for directory in ["a", "b"] {
        write(
            temp.path(),
            &format!("{directory}/tsconfig.json"),
            "{\"compilerOptions\": {}}",
        );
        write(
            temp.path(),
            &format!("{directory}/package.json"),
            "{\"vite\": \"1\"}",
        );
    }

    let outcome = scan(temp.path(), &[rule("join", SIBLING_JOIN)], &[]).expect("scan");

    assert_eq!(outcome.findings().len(), 2, "{outcome:#?}");
    assert_eq!(
        outcome
            .findings()
            .iter()
            .map(|finding| finding.path().as_str().to_owned())
            .collect::<Vec<_>>(),
        ["a/package.json", "b/package.json"]
    );
    assert!(outcome.findings()[0].message().contains("(directory `a`)"));
    assert!(outcome.findings()[1].message().contains("(directory `b`)"));
    assert_eq!(outcome.counts()[0].files(), 4);
}

#[test]
fn a_multifile_rule_does_not_join_files_from_different_directories() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "a/tsconfig.json", "{\"compilerOptions\": {}}");
    write(temp.path(), "b/package.json", "{\"vite\": \"1\"}");

    let outcome = scan(temp.path(), &[rule("join", SIBLING_JOIN)], &[]).expect("scan");

    assert!(outcome.findings().is_empty(), "{outcome:#?}");
    assert_eq!(decide::exit_code(outcome.verdict()), 0);
}

#[test]
fn a_multifile_rule_only_receives_the_files_its_name_patterns_match() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "a/tsconfig.json", "{\"compilerOptions\": {}}");
    write(temp.path(), "a/package.json", "{\"vite\": \"1\"}");
    write(temp.path(), "a/other.json", "{\"unrelated\": true}");

    let outcome = scan(temp.path(), &[rule("join", SIBLING_JOIN)], &[]).expect("scan");

    assert_eq!(outcome.counts()[0].files(), 2, "{outcome:#?}");
}

#[test]
fn a_single_file_rule_reports_each_match_at_its_file() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "a/package.json", "{\"react\": \"18\"}\n");
    write(temp.path(), "b/package.json", "{\"react\": \"19\"}\n");

    let outcome = scan(temp.path(), &[rule("react", REACT_PAIR)], &[]).expect("scan");

    assert_eq!(outcome.findings().len(), 2, "{outcome:#?}");
    assert_eq!(
        outcome
            .findings()
            .iter()
            .map(|finding| finding.path().as_str().to_owned())
            .collect::<Vec<_>>(),
        ["a/package.json", "b/package.json"]
    );
    assert_eq!(outcome.counts()[0].files(), 2);
}

#[test]
fn a_non_utf8_file_no_rule_can_target_is_never_read() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "package.json", "{\"react\": \"18\"}\n");
    fs::write(temp.path().join("fixture.tar.gz"), [0x1f, 0x8b, 0xff, 0xfe])
        .expect("write the archive");

    let outcome = scan(temp.path(), &[rule("react", REACT_PAIR)], &[]).expect("scan");

    assert_eq!(outcome.findings().len(), 1, "{outcome:#?}");
    assert_eq!(outcome.findings()[0].path().as_str(), "package.json");
}

#[test]
fn ignore_globs_drop_files_from_every_rule_batch() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "generated/skip.json", "{\"react\": \"18\"}");
    write(temp.path(), "real.json", "{\"react\": \"19\"}");

    let outcome = scan(
        temp.path(),
        &[rule("react", REACT_PAIR)],
        &["generated/**".to_owned()],
    )
    .expect("scan");

    assert_eq!(outcome.counts()[0].files(), 1, "{outcome:#?}");
    assert_eq!(outcome.findings().len(), 1);
    assert_eq!(outcome.findings()[0].path().as_str(), "real.json");
}

const TSDOWN_PRESENCE_JOIN: &str = r#"language json
multifile {
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)tsdown\.config\.ts"($dir)
  },
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)package\.json"($dir),
    $body <: contains `"react": $_`
  }
}
"#;

const PACKAGE_ONLY_JOIN: &str = r#"language json
multifile {
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)package\.json"($dir),
    $body <: contains `"react": $_`
  }
}
"#;

#[test]
fn a_multifile_rule_joins_a_name_matched_file_of_another_language() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "pkg/package.json", "{\"react\": \"18\"}");
    write(
        temp.path(),
        "pkg/tsdown.config.ts",
        "export default defineConfig({ entry: './src/index.ts' })\n",
    );

    let outcome = scan(temp.path(), &[rule("join", TSDOWN_PRESENCE_JOIN)], &[])
        .expect("a name-only participant must not be parsed as the rule's language");

    assert_eq!(outcome.findings().len(), 1, "{outcome:#?}");
    assert_eq!(outcome.findings()[0].path().as_str(), "pkg/package.json");
    assert_eq!(outcome.counts()[0].files(), 2, "{outcome:#?}");
}

#[test]
fn a_multifile_rule_pulls_in_only_the_other_language_files_its_names_match() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "pkg/package.json", "{\"react\": \"18\"}");
    write(temp.path(), "pkg/tsdown.config.ts", "export default {}\n");

    let outcome = scan(temp.path(), &[rule("join", PACKAGE_ONLY_JOIN)], &[]).expect("scan");

    assert_eq!(outcome.findings().len(), 1, "{outcome:#?}");
    assert_eq!(outcome.counts()[0].files(), 1, "{outcome:#?}");
}
