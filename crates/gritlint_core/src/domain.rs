use crate::engine::TargetLanguage;
use crate::error::GritlintError;
use globset::GlobSet;
use regex::Regex;
use std::collections::BTreeMap;
use std::fmt;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NonEmpty<T> {
    head: T,
    tail: Vec<T>,
}

impl<T> NonEmpty<T> {
    #[must_use]
    pub fn new(items: Vec<T>) -> Option<Self> {
        let mut items = items.into_iter();
        let head = items.next()?;
        Some(Self {
            head,
            tail: items.collect(),
        })
    }

    #[must_use]
    pub fn from_head(head: T, tail: Vec<T>) -> Self {
        Self { head, tail }
    }

    #[must_use]
    pub fn first(&self) -> &T {
        &self.head
    }

    pub fn iter(&self) -> impl Iterator<Item = &T> {
        std::iter::once(&self.head).chain(self.tail.iter())
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.tail.len() + 1
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PackName(String);

impl PackName {
    #[must_use]
    pub fn new(name: impl Into<String>) -> Self {
        Self(name.into())
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for PackName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ParamName(String);

impl ParamName {
    pub fn new(name: &str) -> Result<Self, ParamNameRefusal> {
        let mut characters = name.chars();
        let first = characters.next().ok_or(ParamNameRefusal::Empty)?;
        let rest_ok = characters.all(|character| character.is_alphanumeric() || character == '_');
        if (first.is_alphabetic() || first == '_') && rest_ok {
            Ok(Self(name.to_owned()))
        } else {
            Err(ParamNameRefusal::NotAnIdentifier)
        }
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ParamName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParamNameRefusal {
    Empty,
    NotAnIdentifier,
}

impl fmt::Display for ParamNameRefusal {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::Empty => "the name is empty",
            Self::NotAnIdentifier => "the name is not a GritQL identifier",
        };
        formatter.write_str(message)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RuleName(String);

impl RuleName {
    #[must_use]
    pub fn new(name: impl Into<String>) -> Self {
        Self(name.into())
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RuleName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RuleNamespace {
    Pack(PackName),
    Local,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleKind {
    SingleFile,
    MultiFile,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RuleId {
    namespace: RuleNamespace,
    name: RuleName,
}

impl RuleId {
    #[must_use]
    pub fn in_pack(pack: PackName, name: RuleName) -> Self {
        Self {
            namespace: RuleNamespace::Pack(pack),
            name,
        }
    }

    #[must_use]
    pub fn local(name: RuleName) -> Self {
        Self {
            namespace: RuleNamespace::Local,
            name,
        }
    }

    #[must_use]
    pub fn name(&self) -> &RuleName {
        &self.name
    }

    #[must_use]
    pub fn namespace(&self) -> &RuleNamespace {
        &self.namespace
    }

    #[must_use]
    pub fn scope(&self) -> &str {
        match &self.namespace {
            RuleNamespace::Pack(pack) => pack.as_str(),
            RuleNamespace::Local => "local",
        }
    }

    #[must_use]
    pub fn as_string(&self) -> String {
        match &self.namespace {
            RuleNamespace::Pack(pack) => format!("{pack}/{}", self.name),
            RuleNamespace::Local => format!("local/{}", self.name),
        }
    }
}

impl fmt::Display for RuleId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.as_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RelPath(String);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelPathRefusal {
    Empty,
    Absolute,
    ParentSegment,
}

impl fmt::Display for RelPathRefusal {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::Empty => "the path is empty",
            Self::Absolute => "the path is absolute",
            Self::ParentSegment => "the path contains a `..` segment",
        };
        formatter.write_str(message)
    }
}

impl RelPath {
    pub fn new(raw: &str) -> Result<Self, RelPathRefusal> {
        let normalized = raw.replace('\\', "/");
        let trimmed = normalized.strip_prefix("./").unwrap_or(&normalized);
        if trimmed.is_empty() {
            return Err(RelPathRefusal::Empty);
        }
        if trimmed.starts_with('/') {
            return Err(RelPathRefusal::Absolute);
        }
        if trimmed.split('/').any(|segment| segment == "..") {
            return Err(RelPathRefusal::ParentSegment);
        }
        Ok(Self(trimmed.to_owned()))
    }

    pub fn from_root(root: &Path, path: &Path) -> Result<Self, RelPathRefusal> {
        let relative = path
            .strip_prefix(root)
            .map_err(|_| RelPathRefusal::Absolute)?;
        Self::new(&relative.to_string_lossy().replace('\\', "/"))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    #[must_use]
    pub fn parent(&self) -> Option<Self> {
        self.0
            .rsplit_once('/')
            .and_then(|(directory, _)| Self::new(directory).ok())
    }
}

impl fmt::Display for RelPath {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Debug, Clone)]
pub struct Language {
    engine: TargetLanguage,
    key: String,
}

impl Language {
    #[must_use]
    pub fn from_extension(extension: &str) -> Option<Self> {
        TargetLanguage::from_extension(extension).map(Self::of)
    }

    #[must_use]
    pub fn of_body(body: &str) -> Option<Self> {
        TargetLanguage::get_language(body).map(Self::of)
    }

    fn of(engine: TargetLanguage) -> Self {
        Self {
            engine,
            key: format!("{engine:?}"),
        }
    }

    #[must_use]
    pub fn key(&self) -> &str {
        &self.key
    }

    #[must_use]
    pub fn engine(&self) -> TargetLanguage {
        self.engine
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourcePath(PathBuf);

impl SourcePath {
    #[must_use]
    pub fn new(path: PathBuf) -> Self {
        Self(path)
    }

    #[must_use]
    pub fn as_path(&self) -> &Path {
        &self.0
    }
}

impl fmt::Display for SourcePath {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.0.display())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleSource {
    path: SourcePath,
    text: String,
}

impl RuleSource {
    #[must_use]
    pub fn new(path: SourcePath, text: String) -> Self {
        Self { path, text }
    }

    #[must_use]
    pub fn path(&self) -> &SourcePath {
        &self.path
    }

    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }
}

#[derive(Debug, Clone)]
pub struct ParsedRule {
    id: RuleId,
    name: RuleName,
    title: String,
    message: String,
    body: String,
    path: SourcePath,
    language: Language,
    targets: Vec<Regex>,
    params: BTreeMap<ParamName, String>,
    kind: RuleKind,
}

impl ParsedRule {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn assemble(
        id: RuleId,
        name: RuleName,
        title: String,
        message: String,
        body: String,
        path: SourcePath,
        language: Language,
        targets: Vec<Regex>,
        params: BTreeMap<ParamName, String>,
    ) -> Self {
        let kind = rule_kind(&body);
        Self {
            id,
            name,
            title,
            message,
            body,
            path,
            language,
            targets,
            params,
            kind,
        }
    }

    #[must_use]
    pub fn id(&self) -> &RuleId {
        &self.id
    }

    #[must_use]
    pub fn name(&self) -> &RuleName {
        &self.name
    }

    #[must_use]
    pub fn title(&self) -> &str {
        &self.title
    }

    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }

    #[must_use]
    pub fn body(&self) -> &str {
        &self.body
    }

    #[must_use]
    pub fn path(&self) -> &SourcePath {
        &self.path
    }

    #[must_use]
    pub fn language(&self) -> &Language {
        &self.language
    }

    #[must_use]
    pub fn targets(&self) -> &[Regex] {
        &self.targets
    }

    #[must_use]
    pub fn params(&self) -> &BTreeMap<ParamName, String> {
        &self.params
    }

    #[must_use]
    pub fn kind(&self) -> RuleKind {
        self.kind
    }

    pub(crate) fn with_params(&mut self, params: BTreeMap<ParamName, String>) {
        self.params = params;
    }

    #[must_use]
    pub fn engine_parameters(&self) -> BTreeMap<String, String> {
        self.params
            .iter()
            .map(|(name, value)| (name.as_str().to_owned(), value.clone()))
            .collect()
    }

    #[must_use]
    pub fn library_against(&self, all: &[&Self]) -> Vec<crate::engine::NamedPattern> {
        let scope = self.id.scope();
        all.iter()
            .filter(|other| other.id != self.id && other.id.scope() == scope)
            .map(|other| crate::engine::NamedPattern {
                name: other.name.as_str().to_owned(),
                body: other.body.clone(),
            })
            .collect()
    }
}

#[derive(Debug, Clone)]
pub struct CompiledRule(ParsedRule);

impl CompiledRule {
    #[must_use]
    pub(crate) fn sealed(parsed: ParsedRule) -> Self {
        Self(parsed)
    }

    #[must_use]
    pub fn rule(&self) -> &ParsedRule {
        &self.0
    }
}

#[derive(Debug, Clone)]
pub struct SelectedFile {
    language: Language,
    path: RelPath,
    contents: String,
}

impl SelectedFile {
    #[must_use]
    pub fn new(language: Language, path: RelPath, contents: String) -> Self {
        Self {
            language,
            path,
            contents,
        }
    }

    #[must_use]
    pub fn language(&self) -> &Language {
        &self.language
    }

    #[must_use]
    pub fn path(&self) -> &RelPath {
        &self.path
    }

    #[must_use]
    pub fn contents(&self) -> &str {
        &self.contents
    }
}

#[derive(Debug, Clone)]
pub struct SelectedFiles {
    by_language: BTreeMap<String, NonEmpty<SelectedFile>>,
}

impl SelectedFiles {
    pub fn new(files: Vec<SelectedFile>, root: &Path) -> Result<Self, GritlintError> {
        let grouped = files.into_iter().fold(
            BTreeMap::<String, Vec<SelectedFile>>::new(),
            |mut map, file| {
                map.entry(file.language.key().to_owned())
                    .or_default()
                    .push(file);
                map
            },
        );
        let by_language = grouped
            .into_iter()
            .filter_map(|(key, files)| NonEmpty::new(files).map(|files| (key, files)))
            .collect::<BTreeMap<_, _>>();
        if by_language.is_empty() {
            return Err(GritlintError::NoFilesSelected {
                root: root.to_owned(),
            });
        }
        Ok(Self { by_language })
    }

    pub fn batch(&self, language_key: &str) -> impl Iterator<Item = &SelectedFile> {
        self.by_language
            .get(language_key)
            .into_iter()
            .flat_map(NonEmpty::iter)
    }

    #[must_use]
    pub fn total(&self) -> usize {
        self.by_language.values().map(NonEmpty::len).sum()
    }

    pub fn language_keys(&self) -> impl Iterator<Item = &str> {
        self.by_language.keys().map(String::as_str)
    }
}

#[derive(Debug, Clone)]
pub struct IgnoreGlobs(GlobSet);

impl IgnoreGlobs {
    #[must_use]
    pub fn new(globs: GlobSet) -> Self {
        Self(globs)
    }

    #[must_use]
    pub fn matches(&self, relative: &str) -> bool {
        self.0.is_match(relative)
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct DirectoryBatch {
    pub(crate) directory: Option<RelPath>,
    pub(crate) files: Vec<SelectedFile>,
}

impl DirectoryBatch {
    #[must_use]
    pub fn directory(&self) -> Option<&RelPath> {
        self.directory.as_ref()
    }

    #[must_use]
    pub fn files(&self) -> &[SelectedFile] {
        &self.files
    }
}

#[derive(Debug, Clone)]
pub(crate) enum Evaluation {
    SingleFile {
        batch: Vec<SelectedFile>,
    },
    MultiFile {
        directories: Vec<DirectoryBatch>,
        evaluated: usize,
    },
}

#[derive(Debug, Clone)]
pub(crate) struct RuleStep {
    pub(crate) rule: CompiledRule,
    pub(crate) evaluation: Evaluation,
}

#[derive(Debug, Clone)]
pub struct ScanPlan {
    pub(crate) steps: Vec<RuleStep>,
    pub(crate) files_selected: usize,
}

impl ScanPlan {
    #[must_use]
    pub(crate) fn new(steps: Vec<RuleStep>, files_selected: usize) -> Self {
        Self {
            steps,
            files_selected,
        }
    }

    #[must_use]
    pub fn files_selected(&self) -> usize {
        self.files_selected
    }

    #[must_use]
    pub fn rule_count(&self) -> usize {
        self.steps.len()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    rule_id: RuleId,
    path: RelPath,
    line: u32,
    message: String,
}

impl Finding {
    #[must_use]
    pub fn new(rule_id: RuleId, path: RelPath, line: u32, message: String) -> Self {
        Self {
            rule_id,
            path,
            line,
            message,
        }
    }

    #[must_use]
    pub fn rule_id(&self) -> &RuleId {
        &self.rule_id
    }

    #[must_use]
    pub fn path(&self) -> &RelPath {
        &self.path
    }

    #[must_use]
    pub fn line(&self) -> u32 {
        self.line
    }

    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleCount {
    rule_id: RuleId,
    files: usize,
}

impl RuleCount {
    #[must_use]
    pub fn new(rule_id: RuleId, files: usize) -> Self {
        Self { rule_id, files }
    }

    #[must_use]
    pub fn rule_id(&self) -> &RuleId {
        &self.rule_id
    }

    #[must_use]
    pub fn files(&self) -> usize {
        self.files
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Refused,
    Findings,
    Clean,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    findings: Vec<Finding>,
    counts: Vec<RuleCount>,
    files_selected: usize,
}

impl Outcome {
    #[must_use]
    pub fn new(findings: Vec<Finding>, counts: Vec<RuleCount>, files_selected: usize) -> Self {
        Self {
            findings,
            counts,
            files_selected,
        }
    }

    #[must_use]
    pub fn findings(&self) -> &[Finding] {
        &self.findings
    }

    #[must_use]
    pub fn counts(&self) -> &[RuleCount] {
        &self.counts
    }

    #[must_use]
    pub fn files_selected(&self) -> usize {
        self.files_selected
    }

    #[must_use]
    pub fn verdict(&self) -> Verdict {
        if self.findings.is_empty() {
            Verdict::Clean
        } else {
            Verdict::Findings
        }
    }

    #[must_use]
    pub fn zero_file_rules(&self) -> Vec<String> {
        self.counts
            .iter()
            .filter(|count| count.files == 0)
            .map(|count| count.rule_id.as_string())
            .collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum CaseKind {
    Bad,
    Good,
}

impl CaseKind {
    #[must_use]
    pub fn directory(self) -> &'static str {
        match self {
            Self::Bad => "bad",
            Self::Good => "good",
        }
    }
}

#[derive(Debug, Clone)]
pub struct CaseResult {
    rule_id: RuleId,
    case: RelPath,
    kind: CaseKind,
    passed: bool,
    detail: String,
}

impl CaseResult {
    #[must_use]
    pub fn new(
        rule_id: RuleId,
        case: RelPath,
        kind: CaseKind,
        passed: bool,
        detail: String,
    ) -> Self {
        Self {
            rule_id,
            case,
            kind,
            passed,
            detail,
        }
    }

    #[must_use]
    pub fn rule_id(&self) -> &RuleId {
        &self.rule_id
    }

    #[must_use]
    pub fn case(&self) -> &RelPath {
        &self.case
    }

    #[must_use]
    pub fn kind(&self) -> CaseKind {
        self.kind
    }

    #[must_use]
    pub fn passed(&self) -> bool {
        self.passed
    }

    #[must_use]
    pub fn detail(&self) -> &str {
        &self.detail
    }
}

#[derive(Debug, Clone)]
pub struct FixtureOutcome {
    results: Vec<CaseResult>,
}

impl FixtureOutcome {
    #[must_use]
    pub fn new(results: Vec<CaseResult>) -> Self {
        Self { results }
    }

    #[must_use]
    pub fn results(&self) -> &[CaseResult] {
        &self.results
    }

    #[must_use]
    pub fn passed(&self) -> bool {
        self.results.iter().all(CaseResult::passed)
    }

    #[must_use]
    pub fn failures(&self) -> Vec<&CaseResult> {
        self.results
            .iter()
            .filter(|result| !result.passed)
            .collect()
    }

    #[must_use]
    pub fn verdict(&self) -> Verdict {
        if self.passed() {
            Verdict::Clean
        } else {
            Verdict::Findings
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pack {
    name: PackName,
    required_params: Vec<ParamName>,
    sources: Vec<RuleSource>,
}

impl Pack {
    #[must_use]
    pub fn new(name: PackName, required_params: Vec<ParamName>, sources: Vec<RuleSource>) -> Self {
        Self {
            name,
            required_params,
            sources,
        }
    }

    #[must_use]
    pub fn name(&self) -> &PackName {
        &self.name
    }

    #[must_use]
    pub fn required_params(&self) -> &[ParamName] {
        &self.required_params
    }

    #[must_use]
    pub fn sources(&self) -> &[RuleSource] {
        &self.sources
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmbeddedFile {
    path: String,
    contents: String,
}

impl EmbeddedFile {
    #[must_use]
    pub fn new(path: String, contents: String) -> Self {
        Self { path, contents }
    }

    #[must_use]
    pub fn path(&self) -> &str {
        &self.path
    }

    #[must_use]
    pub fn contents(&self) -> &str {
        &self.contents
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawFile {
    path: PathBuf,
    contents: String,
}

impl RawFile {
    #[must_use]
    pub fn new(path: PathBuf, contents: String) -> Self {
        Self { path, contents }
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    #[must_use]
    pub fn contents(&self) -> &str {
        &self.contents
    }
}

#[derive(Debug, Clone)]
pub struct RawTree {
    root: PathBuf,
    files: Vec<RawFile>,
    directories: Vec<PathBuf>,
}

impl RawTree {
    #[must_use]
    pub fn new(root: PathBuf, files: Vec<RawFile>, directories: Vec<PathBuf>) -> Self {
        Self {
            root,
            files,
            directories,
        }
    }

    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    #[must_use]
    pub fn files(&self) -> &[RawFile] {
        &self.files
    }

    #[must_use]
    pub fn directories(&self) -> &[PathBuf] {
        &self.directories
    }

    #[must_use]
    pub fn file(&self, path: &Path) -> Option<&RawFile> {
        self.files.iter().find(|file| file.path == path)
    }

    #[must_use]
    pub fn has_file(&self, path: &Path) -> bool {
        self.file(path).is_some()
    }
}

#[derive(Debug, Clone)]
pub struct FixtureCase {
    pub(crate) kind: CaseKind,
    pub(crate) directory: PathBuf,
    pub(crate) files: SelectedFiles,
    pub(crate) params: BTreeMap<ParamName, String>,
}

#[derive(Debug, Clone)]
pub struct FixtureRule {
    pub(crate) rule: ParsedRule,
    pub(crate) fixture_directory: PathBuf,
    pub(crate) bad: Vec<FixtureCase>,
    pub(crate) good: Vec<FixtureCase>,
}

#[derive(Debug, Clone)]
pub struct FixtureUnit {
    pub(crate) base: PathBuf,
    pub(crate) rules: Vec<FixtureRule>,
}

#[derive(Debug, Clone)]
pub struct FixtureLayout {
    pub(crate) units: Vec<FixtureUnit>,
}

impl FixtureLayout {
    #[must_use]
    pub(crate) fn new(units: Vec<FixtureUnit>) -> Self {
        Self { units }
    }
}

fn rule_kind(body: &str) -> RuleKind {
    let first = body.lines().map(str::trim).find(|line| {
        !line.is_empty() && !line.starts_with("language") && !line.starts_with("engine")
    });
    if first.is_some_and(|line| line.starts_with("multifile")) {
        RuleKind::MultiFile
    } else {
        RuleKind::SingleFile
    }
}
