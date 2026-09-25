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
use gritlint_core::domain::{CaseKind, FixtureOutcome};
use gritlint_core::shell;
use std::fs;
use std::path::Path;

const NO_CONSOLE: &str = "language json\n`\"console\": $_`\n";
const CONDITION_RULE: &str = "language json\ncondition()\n";

fn write(base: &Path, path: &str, contents: &str) {
    let target = base.join(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).expect("create the parent directory");
    }
    fs::write(target, contents).expect("write the file");
}

fn write_pack(base: &Path, name: &str, required: &[&str], rule_file: &str, rule_body: &str) {
    let required: Vec<String> = required
        .iter()
        .map(|param| format!("\"{param}\""))
        .collect();
    write(
        base,
        &format!("{name}/pack.json"),
        &format!("{{\"requiredParams\": [{}]}}", required.join(", ")),
    );
    write(base, &format!("{name}/rules/{rule_file}"), rule_body);
}

fn run_fixtures(dir: &Path) -> Result<FixtureOutcome, GritlintError> {
    let tree = shell::read_tree(dir)?;
    let layout = decode::fixture_layout(&tree)?;
    decide::run_fixtures(&layout)
}

#[test]
fn a_pack_with_a_bad_and_a_good_case_passes() {
    let temp = tempfile::tempdir().expect("temp dir");
    write_pack(temp.path(), "pack-one", &[], "no-console.grit", NO_CONSOLE);
    write(
        temp.path(),
        "pack-one/fixtures/no-console/bad/basic/package.json",
        "{\"console\": \"debug\"}",
    );
    write(
        temp.path(),
        "pack-one/fixtures/no-console/good/basic/package.json",
        "{\"name\": \"app\"}",
    );

    let outcome = run_fixtures(temp.path()).expect("run the fixtures");

    assert!(outcome.passed(), "{outcome:#?}");
    assert_eq!(outcome.results().len(), 2);
}

#[test]
fn a_bad_case_that_yields_no_finding_names_the_rule_and_the_case() {
    let temp = tempfile::tempdir().expect("temp dir");
    write_pack(temp.path(), "pack-one", &[], "no-console.grit", NO_CONSOLE);
    write(
        temp.path(),
        "pack-one/fixtures/no-console/bad/basic/package.json",
        "{\"name\": \"app\"}",
    );
    write(
        temp.path(),
        "pack-one/fixtures/no-console/good/basic/package.json",
        "{\"name\": \"app\"}",
    );

    let outcome = run_fixtures(temp.path()).expect("run the fixtures");

    assert!(!outcome.passed());
    let failures = outcome.failures();
    assert_eq!(failures.len(), 1, "{outcome:#?}");
    assert_eq!(failures[0].rule_id().as_string(), "pack-one/no-console");
    assert_eq!(failures[0].case().as_str(), "fixtures/no-console/bad/basic");
    assert_eq!(failures[0].kind(), CaseKind::Bad);
    assert!(
        failures[0].detail().contains("no finding"),
        "{}",
        failures[0].detail()
    );
}

#[test]
fn a_good_case_that_yields_a_finding_names_the_finding() {
    let temp = tempfile::tempdir().expect("temp dir");
    write_pack(temp.path(), "pack-one", &[], "no-console.grit", NO_CONSOLE);
    write(
        temp.path(),
        "pack-one/fixtures/no-console/bad/basic/package.json",
        "{\"console\": \"debug\"}",
    );
    write(
        temp.path(),
        "pack-one/fixtures/no-console/good/basic/package.json",
        "{\"console\": \"debug\"}",
    );

    let outcome = run_fixtures(temp.path()).expect("run the fixtures");

    let failures = outcome.failures();
    assert_eq!(failures.len(), 1, "{outcome:#?}");
    assert_eq!(failures[0].kind(), CaseKind::Good);
    assert!(
        failures[0].detail().contains("package.json")
            && failures[0].detail().contains("no-console"),
        "{}",
        failures[0].detail()
    );
}

#[test]
fn a_rule_with_only_good_cases_fails_as_untested() {
    let temp = tempfile::tempdir().expect("temp dir");
    write_pack(temp.path(), "pack-one", &[], "no-console.grit", NO_CONSOLE);
    write(
        temp.path(),
        "pack-one/fixtures/no-console/good/basic/package.json",
        "{\"name\": \"app\"}",
    );

    let outcome = run_fixtures(temp.path()).expect("run the fixtures");

    assert!(!outcome.passed());
    let failures = outcome.failures();
    assert_eq!(failures.len(), 1, "{outcome:#?}");
    assert_eq!(failures[0].kind(), CaseKind::Bad);
    assert!(
        failures[0].detail().contains("no known-bad case"),
        "{}",
        failures[0].detail()
    );
}

#[test]
fn a_consumer_rules_directory_follows_the_same_contract() {
    let temp = tempfile::tempdir().expect("temp dir");
    write(temp.path(), "no-console.grit", NO_CONSOLE);
    write(
        temp.path(),
        "fixtures/no-console/good/basic/package.json",
        "{\"name\": \"app\"}",
    );

    let outcome = run_fixtures(temp.path()).expect("run the fixtures");

    let failures = outcome.failures();
    assert_eq!(failures.len(), 1, "{outcome:#?}");
    assert_eq!(failures[0].rule_id().as_string(), "local/no-console");
    assert!(
        failures[0].detail().contains("no known-bad case"),
        "{}",
        failures[0].detail()
    );
}

#[test]
fn a_case_config_supplies_pack_parameters() {
    let temp = tempfile::tempdir().expect("temp dir");
    write_pack(
        temp.path(),
        "pack-one",
        &["condition"],
        "react.grit",
        CONDITION_RULE,
    );
    let config = "{\"packs\": {\"pack-one\": {\"condition\": \"`\\\"react\\\": $_`\"}}}";
    write(
        temp.path(),
        "pack-one/fixtures/react/bad/basic/package.json",
        "{\"react\": \"18\"}",
    );
    write(
        temp.path(),
        "pack-one/fixtures/react/bad/basic/gritlint.json",
        config,
    );
    write(
        temp.path(),
        "pack-one/fixtures/react/good/basic/package.json",
        "{\"name\": \"app\"}",
    );
    write(
        temp.path(),
        "pack-one/fixtures/react/good/basic/gritlint.json",
        config,
    );

    let outcome = run_fixtures(temp.path()).expect("run the fixtures");

    assert!(outcome.passed(), "{outcome:#?}");
}
