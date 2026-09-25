#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::panic
)]

use gritlint_core::decide;
use gritlint_core::decode;
use gritlint_core::domain::{
    Finding, Language, Outcome, ParsedRule, RelPath, RuleCount, RuleId, RuleName, RuleSource,
    SelectedFile, SourcePath, Verdict,
};
use gritlint_core::encode;
use proptest::prelude::*;
use std::path::PathBuf;

fn rel_path() -> impl Strategy<Value = String> {
    prop::collection::vec("[a-z0-9_-]{1,8}", 1..5).prop_map(|segments| segments.join("/"))
}

fn pattern() -> impl Strategy<Value = String> {
    prop_oneof![
        Just(".*".to_owned()),
        Just(r".*\.json".to_owned()),
        Just(r"[a-z0-9_-]+\.json".to_owned()),
    ]
}

fn rule_with(pattern: &str) -> ParsedRule {
    let body = format!(
        "language json\nmultifile {{\n  file($name, $body) where {{ $name <: r\"{pattern}\" }}\n}}\n"
    );
    let source = RuleSource::new(SourcePath::new(PathBuf::from("generated.grit")), body);
    decode::parse_rule(None, &source).expect("the generated rule parses")
}

fn selected(path: &str) -> SelectedFile {
    let language = Language::from_extension("json").expect("the json grammar is compiled in");
    SelectedFile::new(
        language,
        RelPath::new(path).expect("a normalized path"),
        String::new(),
    )
}

fn finding() -> impl Strategy<Value = Finding> {
    (
        prop_oneof![Just("alpha"), Just("beta"), Just("local")],
        rel_path(),
        0u32..10,
        "[a-z ]{0,8}",
    )
        .prop_map(|(rule, path, line, message)| {
            Finding::new(
                RuleId::local(RuleName::new(rule)),
                RelPath::new(&path).expect("a normalized path"),
                line,
                message,
            )
        })
}

fn rule_count() -> impl Strategy<Value = RuleCount> {
    (
        prop_oneof![Just("alpha"), Just("beta"), Just("local")],
        0usize..10,
    )
        .prop_map(|(rule, files)| RuleCount::new(RuleId::local(RuleName::new(rule)), files))
}

proptest! {
    #[test]
    fn partition_assigns_each_scoped_file_to_one_directory(
        pattern in pattern(),
        paths in prop::collection::vec(rel_path(), 0..8),
    ) {
        let rule = rule_with(&pattern);
        let batch: Vec<SelectedFile> = paths.iter().map(|path| selected(path)).collect();
        let directories = decide::partition_multifile(&rule, &batch);
        let pattern = regex::Regex::new(&pattern).expect("the generated pattern compiles");

        let mut seen = std::collections::BTreeSet::new();
        for directory in &directories {
            for file in directory.files() {
                let parent = file.path().parent();
                prop_assert_eq!(parent.as_ref(), directory.directory());
                prop_assert!(seen.insert(file.path().as_str().to_owned()));
            }
        }
        for file in &batch {
            let expected = pattern.is_match(file.path().as_str());
            let present = seen.contains(file.path().as_str());
            prop_assert_eq!(present, expected);
        }
    }

    #[test]
    fn encoding_is_order_independent(
        findings in prop::collection::vec(finding(), 0..8),
        counts in prop::collection::vec(rule_count(), 0..4),
        rotation in any::<usize>(),
    ) {
        let mut reversed = findings.clone();
        reversed.reverse();
        let len = reversed.len();
        let by = len.checked_rem(rotation.max(1)).unwrap_or(0);
        let shuffled: Vec<Finding> = reversed.iter().cycle().skip(by).take(len).cloned().collect();

        let canonical = decide::canonicalize(findings, counts.clone(), 0);
        let permuted = decide::canonicalize(shuffled, counts, 0);
        let human_canonical = encode::render_human(&canonical);
        let human_permuted = encode::render_human(&permuted);
        let json_canonical = encode::render_json(&canonical).expect("json");
        let json_permuted = encode::render_json(&permuted).expect("json");
        prop_assert_eq!(human_canonical, human_permuted);
        prop_assert_eq!(json_canonical, json_permuted);
    }

    #[test]
    fn exit_code_follows_findings(
        findings in prop::collection::vec(finding(), 0..6),
        counts in prop::collection::vec(rule_count(), 0..4),
        files_selected in 0usize..5,
    ) {
        let outcome = Outcome::new(findings.clone(), counts, files_selected);
        let expected = u8::from(!findings.is_empty());
        prop_assert_eq!(decide::exit_code(outcome.verdict()), expected);
        prop_assert_eq!(decide::exit_code(Verdict::Refused), 2);
    }

    #[test]
    fn relpath_round_trips_produced_paths(path in rel_path()) {
        let parsed = RelPath::new(&path).expect("a constructed relative path decodes");
        prop_assert_eq!(parsed.as_str(), path.as_str());
        let again = RelPath::new(parsed.as_str()).expect("re-decodes");
        prop_assert_eq!(again.as_str(), parsed.as_str());
    }

    #[test]
    fn relpath_refuses_absolute(path in rel_path()) {
        let absolute = format!("/{path}");
        prop_assert!(RelPath::new(&absolute).is_err());
    }

    #[test]
    fn relpath_refuses_parent_segments(path in rel_path()) {
        let trailing = format!("{path}/..");
        let leading = format!("../{path}");
        prop_assert!(RelPath::new(&trailing).is_err());
        prop_assert!(RelPath::new(&leading).is_err());
    }
}
