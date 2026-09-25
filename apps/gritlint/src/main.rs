use clap::{Args, Parser, Subcommand, ValueEnum};
use gritlint_core::decode::{self, GritlintConfig};
use gritlint_core::domain::{EmbeddedFile, Pack, Verdict};
use gritlint_core::error::GritlintError;
use gritlint_core::{decide, encode, shell};
use include_dir::{Dir, include_dir};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

static PACKS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../packs");

#[derive(Debug, Parser)]
#[command(
    name = "gritlint",
    version,
    about = "Run GritQL rule packs over the config files of a repository.",
    long_about = None
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    #[command(about = "Scan a tree and report findings.")]
    Check(CheckArgs),
    #[command(about = "Run a pack's fixtures against its rules.")]
    Test(TestArgs),
    #[command(hide = true, about = "Print the gritlint.json JSON schema.")]
    Schema,
}

#[derive(Debug, Args)]
struct CheckArgs {
    #[arg(long, value_name = "PATH")]
    config: Option<PathBuf>,
    #[arg(long = "rules", value_name = "PATH")]
    rules: Vec<PathBuf>,
    #[arg(long, value_enum, default_value_t = Format::Human)]
    format: Format,
    #[arg(default_value = ".")]
    root: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
enum Format {
    Human,
    Json,
}

#[derive(Debug, Args)]
struct TestArgs {
    #[arg(default_value = ".")]
    dir: PathBuf,
}

fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .without_time()
        .with_max_level(tracing::Level::WARN)
        .init();

    match Cli::parse().command {
        Command::Check(args) => report_exit(check(&args)),
        Command::Test(args) => report_exit(test(&args)),
        Command::Schema => report_exit(schema()),
    }
}

fn report_exit(result: Result<ExitCode, GritlintError>) -> ExitCode {
    match result {
        Ok(code) => code,
        Err(error) => {
            tracing::error!("gritlint: {error}");
            ExitCode::from(decide::exit_code(Verdict::Refused))
        }
    }
}

fn schema() -> Result<ExitCode, GritlintError> {
    let text = serde_json::to_string_pretty(&GritlintConfig::schema_for_packs(&embedded_packs()?))
        .map_err(|error| GritlintError::Render {
            message: error.to_string(),
        })?;
    emit(&format!("{text}\n"))?;
    Ok(ExitCode::SUCCESS)
}

fn check(args: &CheckArgs) -> Result<ExitCode, GritlintError> {
    let config_path = args
        .config
        .clone()
        .unwrap_or_else(|| args.root.join("gritlint.json"));
    let config = if args.config.is_some() || shell::is_file(&config_path) {
        let text =
            shell::read_to_string(&config_path).map_err(|source| GritlintError::ConfigRead {
                path: config_path.clone(),
                source,
            })?;
        GritlintConfig::parse(&text).map_err(|source| GritlintError::ConfigParse {
            path: config_path.clone(),
            source,
        })?
    } else {
        GritlintConfig::default()
    };

    let mut consumer: Vec<PathBuf> = config
        .rules
        .iter()
        .map(|path| resolve_against(&config_path, path))
        .collect();
    consumer.extend(args.rules.iter().cloned());

    let packs = embedded_packs()?;
    let enabled = decode::enabled_packs(&config, &config_path)?;
    let sources = shell::read_rule_sources(&consumer)?;
    let rules = decode::load_rules(&packs, &enabled, sources, &config_path)?;
    let ignore = decode::ignore_globs(&config.ignore)?;
    let walked = shell::walk(&args.root, &ignore)?;
    let files = decode::select_files(walked, &args.root)?;
    let plan = decide::plan(&rules, &files);
    let outcome = decide::scan(&plan)?;

    let rendered = match args.format {
        Format::Human => encode::render_human(&outcome),
        Format::Json => encode::render_json(&outcome).map_err(|error| GritlintError::Render {
            message: error.to_string(),
        })?,
    };
    emit(&rendered)?;
    Ok(ExitCode::from(decide::exit_code(outcome.verdict())))
}

fn test(args: &TestArgs) -> Result<ExitCode, GritlintError> {
    let tree = shell::read_tree(&args.dir)?;
    let layout = decode::fixture_layout(&tree)?;
    let outcome = decide::run_fixtures(&layout)?;
    emit(&encode::render_fixtures(&outcome))?;
    Ok(ExitCode::from(decide::exit_code(outcome.verdict())))
}

fn emit(text: &str) -> Result<(), GritlintError> {
    let mut stdout = std::io::stdout().lock();
    stdout
        .write_all(text.as_bytes())
        .and_then(|()| stdout.flush())
        .map_err(|source| GritlintError::Io {
            path: PathBuf::from("<stdout>"),
            source,
        })
}

fn embedded_packs() -> Result<Vec<Pack>, GritlintError> {
    let mut files = Vec::new();
    collect_embedded(&PACKS, &mut files);
    decode::embedded_packs(&files)
}

fn collect_embedded(dir: &Dir<'_>, files: &mut Vec<EmbeddedFile>) {
    files.extend(dir.files().map(|file| {
        EmbeddedFile::new(
            file.path().to_string_lossy().replace('\\', "/"),
            file.contents_utf8()
                .map_or_else(String::new, ToOwned::to_owned),
        )
    }));
    for sub in dir.dirs() {
        collect_embedded(sub, files);
    }
}

fn resolve_against(config: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_owned()
    } else {
        config.parent().unwrap_or_else(|| Path::new(".")).join(path)
    }
}
