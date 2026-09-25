use crate::domain::{FixtureOutcome, Outcome};
use serde::Serialize;

#[derive(Serialize)]
struct JsonFinding {
    rule: String,
    path: String,
    line: u32,
    message: String,
}

#[derive(Serialize)]
struct JsonRuleCount {
    rule: String,
    files: usize,
}

#[derive(Serialize)]
struct JsonSummary {
    files_selected: usize,
    findings: usize,
    rules: Vec<JsonRuleCount>,
}

#[derive(Serialize)]
struct JsonReport {
    findings: Vec<JsonFinding>,
    summary: JsonSummary,
}

pub fn render_json(outcome: &Outcome) -> Result<String, serde_json::Error> {
    let report = JsonReport {
        findings: outcome
            .findings()
            .iter()
            .map(|finding| JsonFinding {
                rule: finding.rule_id().as_string(),
                path: finding.path().as_str().to_owned(),
                line: finding.line(),
                message: finding.message().to_owned(),
            })
            .collect(),
        summary: JsonSummary {
            files_selected: outcome.files_selected(),
            findings: outcome.findings().len(),
            rules: outcome
                .counts()
                .iter()
                .map(|count| JsonRuleCount {
                    rule: count.rule_id().as_string(),
                    files: count.files(),
                })
                .collect(),
        },
    };
    let mut rendered = serde_json::to_string_pretty(&report)?;
    rendered.push('\n');
    Ok(rendered)
}

#[must_use]
pub fn render_human(outcome: &Outcome) -> String {
    let mut lines: Vec<String> = outcome
        .findings()
        .iter()
        .map(|finding| {
            format!(
                "{}:{}: {}: {}",
                finding.path(),
                finding.line(),
                finding.rule_id(),
                finding.message()
            )
        })
        .collect();

    lines.extend(
        outcome
            .counts()
            .iter()
            .map(|count| format!("{}: evaluated {} file(s)", count.rule_id(), count.files())),
    );

    lines.push(match outcome.verdict() {
        crate::domain::Verdict::Clean => {
            let zero = outcome.zero_file_rules();
            let zero = if zero.is_empty() {
                "none".to_owned()
            } else {
                zero.join(", ")
            };
            format!(
                "clean: {} file(s) selected; zero-file rules: {zero}",
                outcome.files_selected()
            )
        }
        crate::domain::Verdict::Findings | crate::domain::Verdict::Refused => format!(
            "{} finding(s) in {} file(s) selected",
            outcome.findings().len(),
            outcome.files_selected()
        ),
    });
    lines.join("\n") + "\n"
}

#[must_use]
pub fn render_fixtures(outcome: &FixtureOutcome) -> String {
    let mut lines: Vec<String> = outcome
        .results()
        .iter()
        .map(|result| {
            let state = if result.passed() { "ok" } else { "FAIL" };
            let kind = result.kind().directory();
            if result.passed() {
                format!("{state} {kind} {} {}", result.rule_id(), result.case())
            } else {
                format!(
                    "{state} {kind} {} {}: {}",
                    result.rule_id(),
                    result.case(),
                    result.detail()
                )
            }
        })
        .collect();
    let passed = outcome.passed();
    let count = if passed {
        outcome.results().len()
    } else {
        outcome.failures().len()
    };
    let verdict = if passed { "passed" } else { "failed" };
    lines.push(format!("{count} case(s) {verdict}"));
    lines.join("\n") + "\n"
}
