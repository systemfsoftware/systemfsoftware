use crate::domain::{
    CaseKind, CaseResult, CompiledRule, DirectoryBatch, Evaluation, Finding, FixtureCase,
    FixtureLayout, FixtureOutcome, FixtureRule, NonEmpty, Outcome, ParsedRule, RelPath, RuleCount,
    RuleKind, RuleStep, ScanPlan, SelectedFile, SelectedFiles, Verdict,
};
use crate::engine::{self, EngineMatch, EngineOutcome, EngineRequest, InputFile};
use crate::error::GritlintError;
use std::collections::BTreeMap;
use std::path::Path;

type Diagnostics = Vec<(String, String)>;
type RuleRun = (Vec<Finding>, usize, Diagnostics);

#[must_use]
pub fn plan(rules: &NonEmpty<CompiledRule>, files: &SelectedFiles) -> ScanPlan {
    let steps = rules
        .iter()
        .map(|compiled| {
            let rule = compiled.rule();
            let key = rule.language().key().to_owned();
            let batch: Vec<SelectedFile> = files.batch(&key).cloned().collect();
            let evaluation = match rule.kind() {
                RuleKind::SingleFile => Evaluation::SingleFile { batch },
                RuleKind::MultiFile => {
                    let mut input = batch;
                    input.extend(participants(rule, files, &key));
                    let directories = partition_multifile(rule, &input);
                    let evaluated = directories
                        .iter()
                        .map(|directory| directory.files().len())
                        .sum();
                    Evaluation::MultiFile {
                        directories,
                        evaluated,
                    }
                }
            };
            RuleStep {
                rule: compiled.clone(),
                evaluation,
            }
        })
        .collect();
    ScanPlan::new(steps, files.total())
}

#[must_use]
pub fn partition_multifile(rule: &ParsedRule, batch: &[SelectedFile]) -> Vec<DirectoryBatch> {
    batch
        .iter()
        .filter(|file| in_scope(rule, file))
        .fold(
            BTreeMap::<Option<RelPath>, Vec<SelectedFile>>::new(),
            |mut directories, file| {
                directories
                    .entry(file.path().parent())
                    .or_default()
                    .push(file.clone());
                directories
            },
        )
        .into_iter()
        .map(|(directory, files)| DirectoryBatch { directory, files })
        .collect()
}

pub fn scan(plan: &ScanPlan) -> Result<Outcome, GritlintError> {
    let all: Vec<&ParsedRule> = plan.steps.iter().map(|step| step.rule.rule()).collect();
    let runs = plan
        .steps
        .iter()
        .map(|step| run_step(step, &all))
        .collect::<Result<Vec<_>, _>>()?;
    let (findings, counts, diagnostics) = runs.into_iter().fold(
        (
            Vec::<Finding>::new(),
            Vec::<RuleCount>::new(),
            Vec::<(String, String)>::new(),
        ),
        |(mut findings, mut counts, mut diagnostics), run| {
            findings.extend(run.findings);
            counts.push(run.count);
            diagnostics.extend(run.diagnostics);
            (findings, counts, diagnostics)
        },
    );
    match diagnostics.into_iter().next() {
        Some((file, message)) => Err(GritlintError::TargetParse { file, message }),
        None => Ok(canonicalize(findings, counts, plan.files_selected)),
    }
}

#[must_use]
pub fn canonicalize(
    findings: Vec<Finding>,
    counts: Vec<RuleCount>,
    files_selected: usize,
) -> Outcome {
    Outcome::new(
        canonicalize_findings(findings),
        canonicalize_counts(counts),
        files_selected,
    )
}

pub fn run_fixtures(layout: &FixtureLayout) -> Result<FixtureOutcome, GritlintError> {
    let mut results = layout
        .units
        .iter()
        .flat_map(|unit| {
            unit.rules
                .iter()
                .flat_map(|rule| fixture_results(rule, &unit.base))
        })
        .collect::<Result<Vec<_>, _>>()?;
    results.sort_by(|left, right| {
        (
            left.rule_id().as_string(),
            left.case().as_str().to_owned(),
            left.kind(),
        )
            .cmp(&(
                right.rule_id().as_string(),
                right.case().as_str().to_owned(),
                right.kind(),
            ))
    });
    Ok(FixtureOutcome::new(results))
}

#[must_use]
pub fn exit_code(verdict: Verdict) -> u8 {
    match verdict {
        Verdict::Refused => 2,
        Verdict::Findings => 1,
        Verdict::Clean => 0,
    }
}

struct StepRun {
    findings: Vec<Finding>,
    count: RuleCount,
    diagnostics: Vec<(String, String)>,
}

fn run_step(step: &RuleStep, all: &[&ParsedRule]) -> Result<StepRun, GritlintError> {
    let rule = step.rule.rule();
    let library = rule.library_against(all);
    let (findings, evaluated, diagnostics) = match &step.evaluation {
        Evaluation::SingleFile { batch } => run_single(rule, &library, batch)?,
        Evaluation::MultiFile {
            directories,
            evaluated,
        } => run_multi(rule, &library, directories, *evaluated)?,
    };
    Ok(StepRun {
        findings,
        count: RuleCount::new(rule.id().clone(), evaluated),
        diagnostics,
    })
}

fn run_single(
    rule: &ParsedRule,
    library: &[engine::NamedPattern],
    batch: &[SelectedFile],
) -> Result<RuleRun, GritlintError> {
    let files: Vec<InputFile> = batch.iter().map(input_file).collect();
    let outcome = execute(rule, library, files)?;
    let findings = outcome
        .matches
        .iter()
        .map(|matched| finding_for(rule, matched))
        .collect::<Result<Vec<_>, _>>()?;
    Ok((findings, batch.len(), collect_diagnostics(&outcome, batch)))
}

fn run_multi(
    rule: &ParsedRule,
    library: &[engine::NamedPattern],
    directories: &[DirectoryBatch],
    evaluated: usize,
) -> Result<RuleRun, GritlintError> {
    let runs = directories
        .iter()
        .map(|directory| run_directory(rule, library, directory))
        .collect::<Result<Vec<_>, _>>()?;
    let _empty = directories
        .is_empty()
        .then(|| {
            run_directory(
                rule,
                library,
                &DirectoryBatch {
                    directory: None,
                    files: Vec::new(),
                },
            )
        })
        .transpose()?;
    let (findings, diagnostics) = runs.into_iter().fold(
        (Vec::<Finding>::new(), Diagnostics::new()),
        |(mut findings, mut diagnostics), (directory_findings, directory_diagnostics)| {
            findings.extend(directory_findings);
            diagnostics.extend(directory_diagnostics);
            (findings, diagnostics)
        },
    );
    Ok((findings, evaluated, diagnostics))
}

fn run_directory(
    rule: &ParsedRule,
    library: &[engine::NamedPattern],
    directory: &DirectoryBatch,
) -> Result<(Vec<Finding>, Diagnostics), GritlintError> {
    let files: Vec<InputFile> = directory.files.iter().map(input_file).collect();
    let outcome = execute(rule, library, files)?;
    let diagnostics = collect_diagnostics(&outcome, &directory.files);
    let message = format!(
        "{} (directory `{}`)",
        rule.message(),
        directory.directory.as_ref().map_or("", RelPath::as_str)
    );
    let finding = (!outcome.matches.is_empty())
        .then(|| first_match(&outcome, &directory.files))
        .transpose()?
        .flatten()
        .map(|(path, line)| Finding::new(rule.id().clone(), path, line, message));
    Ok((finding.into_iter().collect(), diagnostics))
}

fn execute(
    rule: &ParsedRule,
    library: &[engine::NamedPattern],
    files: Vec<InputFile>,
) -> Result<EngineOutcome, GritlintError> {
    let request = EngineRequest {
        body: rule.body().to_owned(),
        library: library.to_vec(),
        language: rule.language().engine(),
        parameters: rule.engine_parameters(),
        files,
    };
    engine::run(&request).map_err(|error| GritlintError::RuleCompile {
        id: rule.id().as_string(),
        path: rule.path().as_path().to_owned(),
        message: error.to_string(),
    })
}

fn collect_diagnostics(outcome: &EngineOutcome, files: &[SelectedFile]) -> Vec<(String, String)> {
    outcome
        .diagnostics
        .iter()
        .filter(|diagnostic| {
            files
                .iter()
                .any(|file| file.path().as_str() == diagnostic.path)
        })
        .map(|diagnostic| (diagnostic.path.clone(), diagnostic.message.clone()))
        .collect()
}

fn first_match(
    outcome: &EngineOutcome,
    files: &[SelectedFile],
) -> Result<Option<(RelPath, u32)>, GritlintError> {
    let mut matched: Vec<&EngineMatch> = outcome.matches.iter().collect();
    matched.sort_by(|left, right| left.path.cmp(&right.path));
    let chosen = matched
        .iter()
        .find(|matched| !matched.ranges.is_empty())
        .or_else(|| matched.first());
    match chosen {
        Some(matched) => {
            let path = RelPath::new(&matched.path).map_err(|reason| GritlintError::RelPath {
                path: matched.path.clone(),
                reason,
            })?;
            Ok(Some((
                path,
                matched.ranges.first().map_or(1, |range| range.start_line),
            )))
        }
        None => Ok(files.first().map(|file| (file.path().clone(), 1))),
    }
}

fn finding_for(rule: &ParsedRule, matched: &EngineMatch) -> Result<Finding, GritlintError> {
    let path = RelPath::new(&matched.path).map_err(|reason| GritlintError::RelPath {
        path: matched.path.clone(),
        reason,
    })?;
    let line = matched.ranges.first().map_or(1, |range| range.start_line);
    Ok(Finding::new(
        rule.id().clone(),
        path,
        line,
        rule.message().to_owned(),
    ))
}

fn input_file(file: &SelectedFile) -> InputFile {
    InputFile {
        path: file.path().as_str().to_owned(),
        contents: file.contents().to_owned(),
    }
}

fn in_scope(rule: &ParsedRule, file: &SelectedFile) -> bool {
    rule.targets().is_empty()
        || rule
            .targets()
            .iter()
            .any(|target| target.is_match(file.path().as_str()))
}

fn participants(rule: &ParsedRule, files: &SelectedFiles, own_key: &str) -> Vec<SelectedFile> {
    files
        .language_keys()
        .filter(|key| *key != own_key)
        .flat_map(|key| files.batch(key))
        .filter(|file| {
            rule.targets()
                .iter()
                .any(|target| target.is_match(file.path().as_str()))
        })
        .map(|file| SelectedFile::new(file.language().clone(), file.path().clone(), String::new()))
        .collect()
}

fn canonicalize_findings(mut findings: Vec<Finding>) -> Vec<Finding> {
    findings.sort_by(|left, right| {
        (
            left.rule_id().as_string(),
            left.path().as_str().to_owned(),
            left.line(),
            left.message().to_owned(),
        )
            .cmp(&(
                right.rule_id().as_string(),
                right.path().as_str().to_owned(),
                right.line(),
                right.message().to_owned(),
            ))
    });
    findings
}

fn canonicalize_counts(mut counts: Vec<RuleCount>) -> Vec<RuleCount> {
    counts.sort_by_key(|count| count.rule_id().as_string());
    counts
}

fn fixture_results(rule: &FixtureRule, base: &Path) -> Vec<Result<CaseResult, GritlintError>> {
    let mut results = Vec::new();
    results.extend(
        rule.bad
            .is_empty()
            .then(|| untested(rule, base, CaseKind::Bad)),
    );
    results.extend(
        rule.good
            .is_empty()
            .then(|| untested(rule, base, CaseKind::Good)),
    );
    results.extend(rule.bad.iter().map(|case| evaluate(rule, case, base)));
    results.extend(rule.good.iter().map(|case| evaluate(rule, case, base)));
    results
}

fn untested(rule: &FixtureRule, base: &Path, kind: CaseKind) -> Result<CaseResult, GritlintError> {
    let directory = kind.directory();
    let case =
        RelPath::from_root(base, &rule.fixture_directory.join(directory)).map_err(|reason| {
            GritlintError::RelPath {
                path: rule.fixture_directory.join(directory).display().to_string(),
                reason,
            }
        })?;
    Ok(CaseResult::new(
        rule.rule.id().clone(),
        case,
        kind,
        false,
        format!("no known-{directory} case"),
    ))
}

fn evaluate(
    rule: &FixtureRule,
    case: &FixtureCase,
    base: &Path,
) -> Result<CaseResult, GritlintError> {
    let mut scoped = rule.rule.clone();
    scoped.with_params(case.params.clone());
    let rules = NonEmpty::from_head(CompiledRule::sealed(scoped), Vec::new());
    let plan = plan(&rules, &case.files);
    let outcome = scan(&plan)?;
    let verdict = outcome.verdict();
    let passed = match case.kind {
        CaseKind::Bad => verdict == Verdict::Findings,
        CaseKind::Good => verdict == Verdict::Clean,
    };
    let detail = match (case.kind, verdict) {
        (CaseKind::Bad, Verdict::Findings) | (CaseKind::Good, Verdict::Clean) => String::new(),
        (CaseKind::Bad, Verdict::Clean | Verdict::Refused)
        | (CaseKind::Good, Verdict::Findings | Verdict::Refused) => describe(&outcome, case.kind),
    };
    let case_path =
        RelPath::from_root(base, &case.directory).map_err(|reason| GritlintError::RelPath {
            path: case.directory.display().to_string(),
            reason,
        })?;
    Ok(CaseResult::new(
        rule.rule.id().clone(),
        case_path,
        case.kind,
        passed,
        detail,
    ))
}

fn describe(outcome: &Outcome, kind: CaseKind) -> String {
    match kind {
        CaseKind::Bad => "the known-bad case produced no finding".to_owned(),
        CaseKind::Good => outcome
            .findings()
            .first()
            .map_or_else(String::new, |finding| {
                format!(
                    "the known-good case produced {}:{}: {}",
                    finding.path(),
                    finding.line(),
                    finding.message()
                )
            }),
    }
}
