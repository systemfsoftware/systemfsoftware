//! The rewrites themselves.
//!
//! Each one turns two spellings of the same thing into one. That is the whole
//! reason this plugin is a formatter and not a lint rule: a rule reports the
//! spelling it dislikes and leaves both in the language, so a declaration
//! upstream still has to record which one an author chose. A formatter deletes
//! the choice — after `dprint fmt` only one spelling exists on disk, so there
//! is nothing left for a declaration to say.

use oxc_allocator::Allocator;
use oxc_ast::ast::TSType;
use oxc_ast::ast::TSTypeOperatorOperator;
use oxc_ast_visit::Visit;
use oxc_ast_visit::walk;
use oxc_parser::Parser;
use oxc_span::GetSpan;
use oxc_span::SourceType;
use oxc_span::Span;

use crate::configuration::ArrayTypeStyle;

/// One rewrite: replace `span` with `text`.
struct Edit {
  span: Span,
  text: String,
}

/// A type spelled two ways.
///
/// `readonly T[]` and `ReadonlyArray<T>` are the same type, and so are `T[]`
/// and `Array<T>`. The shorthand carries a precedence trap the generic form
/// does not: `[]` binds tighter than `|`, so `A | B[]` is `A | (B[])` and reads
/// like `(A | B)[]`. Canonicalising removes the trap rather than documenting it.
///
/// The two forms are not freely interchangeable in one direction: `readonly`
/// is only legal in front of an array or tuple type, so rewriting the element
/// of a `readonly T[]` without also rewriting the operator produces `readonly
/// Array<T>`, which does not compile. The operator case is therefore handled as
/// one unit rather than as two independent edits.
struct ArrayTypes<'a> {
  source: &'a str,
  style: ArrayTypeStyle,
  edits: Vec<Edit>,
  /// Spans already claimed by an enclosing rewrite this pass, so an inner node
  /// does not also emit an overlapping edit.
  claimed: Vec<Span>,
}

impl<'a> ArrayTypes<'a> {
  fn slice(&self, span: Span) -> &'a str {
    &self.source[span.start as usize..span.end as usize]
  }

  fn is_claimed(&self, span: Span) -> bool {
    self.claimed.iter().any(|c| c.start <= span.start && span.end <= c.end)
  }

  /// The element of an array type, as written.
  ///
  /// Taken from the source rather than re-printed, so a comment or a line break
  /// inside the element survives the rewrite: this plugin decides one spelling
  /// and leaves every other formatting decision to the plugin that owns it.
  ///
  /// Parentheses are the exception, because they are not the author's: `(A | B)[]`
  /// needs them only because `[]` binds tighter than `|`. A type argument has no
  /// such precedence, so carrying them into `Array<(A | B)>` would preserve a
  /// workaround for a problem the rewrite just removed.
  fn element_text(&self, array_span: Span, element: &TSType<'a>) -> &'a str {
    let mut inner = element;
    while let TSType::TSParenthesizedType(paren) = inner {
      inner = &paren.type_annotation;
    }
    let span = inner.span();
    debug_assert!(array_span.start <= span.start && span.end <= array_span.end);
    self.slice(span)
  }
}

impl<'a> Visit<'a> for ArrayTypes<'a> {
  fn visit_ts_type(&mut self, ty: &TSType<'a>) {
    match self.style {
      ArrayTypeStyle::Generic => self.to_generic(ty),
      ArrayTypeStyle::Shorthand => self.to_shorthand(ty),
    }
    walk::walk_ts_type(self, ty);
  }
}

impl<'a> ArrayTypes<'a> {
  /// `readonly T[]` -> `ReadonlyArray<T>`, `T[]` -> `Array<T>`.
  fn to_generic(&mut self, ty: &TSType<'a>) {
    match ty {
      // The operator and the array are one edit, because `readonly Array<T>`
      // is not a type.
      TSType::TSTypeOperatorType(op) if op.operator == TSTypeOperatorOperator::Readonly => {
        if let TSType::TSArrayType(inner) = &op.type_annotation {
          if self.is_claimed(op.span) {
            return;
          }
          let element = self.element_text(inner.span, &inner.element_type).to_string();
          self.claimed.push(op.span);
          self.edits.push(Edit {
            span: op.span,
            text: format!("ReadonlyArray<{element}>"),
          });
        }
      }
      TSType::TSArrayType(arr) => {
        if self.is_claimed(arr.span) {
          return;
        }
        let element = self.element_text(arr.span, &arr.element_type).to_string();
        self.claimed.push(arr.span);
        self.edits.push(Edit {
          span: arr.span,
          text: format!("Array<{element}>"),
        });
      }
      _ => {}
    }
  }

  /// `ReadonlyArray<T>` -> `readonly T[]`, `Array<T>` -> `T[]`.
  ///
  /// Only a single type argument is rewritten. `Array` with none is the bare
  /// constructor type and has no shorthand at all, and more than one is not
  /// this `Array`.
  fn to_shorthand(&mut self, ty: &TSType<'a>) {
    let TSType::TSTypeReference(reference) = ty else { return };
    let Some(args) = &reference.type_arguments else { return };
    if args.params.len() != 1 {
      return;
    }
    let name = reference.type_name.get_identifier_reference().map(|id| id.name.as_str());
    let prefix = match name {
      Some("Array") => "",
      Some("ReadonlyArray") => "readonly ",
      _ => return,
    };
    if self.is_claimed(reference.span) {
      return;
    }
    let element = args.params[0].span();
    // An element that is itself a union, a function or a conditional binds
    // looser than `[]`, so the shorthand needs the parentheses the generic form
    // made unnecessary.
    let needs_parens = matches!(
      &args.params[0],
      TSType::TSUnionType(_)
        | TSType::TSIntersectionType(_)
        | TSType::TSFunctionType(_)
        | TSType::TSConstructorType(_)
        | TSType::TSConditionalType(_)
        | TSType::TSInferType(_)
        | TSType::TSTypeOperatorType(_)
    );
    let element = self.slice(element);
    let element = if needs_parens {
      format!("({element})")
    } else {
      element.to_string()
    };
    self.claimed.push(reference.span);
    self.edits.push(Edit {
      span: reference.span,
      text: format!("{prefix}{element}[]"),
    });
  }
}

/// Apply one pass of edits, right to left so earlier offsets stay valid.
fn apply(source: &str, mut edits: Vec<Edit>) -> String {
  edits.sort_by_key(|e| std::cmp::Reverse(e.span.start));
  let mut out = source.to_string();
  for edit in edits {
    out.replace_range(edit.span.start as usize..edit.span.end as usize, &edit.text);
  }
  out
}

/// Rewrite until nothing changes.
///
/// A nested `T[][]` yields the outer array first; rewriting it produces
/// `Array<T[]>`, whose inner shorthand is only reachable on the next parse. The
/// loop is what makes nesting depth irrelevant, and the cap is what makes a
/// rewrite that fails to converge a reported failure rather than a hang.
/// Takes the two values it actually uses rather than the plugin's whole
/// configuration: the rewrite is a pure function of text, style and a pass cap,
/// so it is testable without constructing the upstream formatter's config.
pub fn canonicalize(
  path: &std::path::Path,
  source: &str,
  style: ArrayTypeStyle,
  max_passes: u32,
) -> anyhow::Result<Option<String>> {
  let Ok(source_type) = SourceType::from_path(path) else {
    return Ok(None);
  };
  let mut current = source.to_string();
  for _ in 0..max_passes {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &current, source_type).parse();
    // A file the parser cannot read is not this plugin's to repair: return it
    // untouched and let the type checker report it.
    if parsed.panicked || !parsed.diagnostics.is_empty() {
      return Ok(None);
    }
    let mut pass = ArrayTypes {
      source: &current,
      style,
      edits: Vec::new(),
      claimed: Vec::new(),
    };
    pass.visit_program(&parsed.program);
    if pass.edits.is_empty() {
      return Ok(if current == source { None } else { Some(current) });
    }
    let edits = std::mem::take(&mut pass.edits);
    current = apply(&current, edits);
  }
  anyhow::bail!(
    "canonical: {} still changing after {} passes",
    path.display(),
    max_passes
  )
}

#[cfg(test)]
mod tests {
  use super::*;
  use ArrayTypeStyle::Generic;
  use ArrayTypeStyle::Shorthand;

  /// One type written two ways. The type checker cannot tell the pair apart,
  /// which is why something upstream used to record which one an author picked,
  /// and what this rewrite removes.
  ///
  /// The parenthesis rows are the asymmetric ones: `[]` binds tighter than
  /// `|`, so the shorthand of a union needs parentheses the generic form does
  /// not. A direction that forgets them changes the type, which is what the
  /// round trip catches.
  const PAIRS: &[(&str, &str)] = &[
    ("Array<Alpha>", "Alpha[]"),
    ("ReadonlyArray<Alpha>", "readonly Alpha[]"),
    ("Array<Array<Alpha>>", "Alpha[][]"),
    ("ReadonlyArray<Array<Alpha>>", "readonly Alpha[][]"),
    ("Array<Alpha | Beta>", "(Alpha | Beta)[]"),
    ("Array<Alpha & Beta>", "(Alpha & Beta)[]"),
    ("Array<(x: Alpha) => Beta>", "((x: Alpha) => Beta)[]"),
    ("Array<keyof Alpha>", "(keyof Alpha)[]"),
    ("Array<Map<Alpha, Beta>>", "Map<Alpha, Beta>[]"),
  ];

  /// Neither spelling applies: a tuple has no generic form and `Map` is not an
  /// array. A rewrite that touches these is over-reaching.
  const UNTOUCHED: &[&str] = &[
    "readonly [Alpha, Beta]",
    "Map<Alpha, Beta>",
    "Alpha",
  ];

  fn decl(spelling: &str) -> String {
    format!("export type T = {spelling}")
  }

  fn run(source: &str, style: ArrayTypeStyle) -> Option<String> {
    canonicalize(std::path::Path::new("t.ts"), source, style, 16).expect("converges")
  }

  /// What comes out is the configured spelling, entered from the other one, so a
  /// rewrite that does nothing cannot pass.
  #[test]
  fn rewrites_each_pair_both_directions() {
    for (generic, shorthand) in PAIRS {
      assert_eq!(run(&decl(shorthand), Generic).as_deref(), Some(decl(generic).as_str()), "{shorthand} -> generic");
      assert_eq!(run(&decl(generic), Shorthand).as_deref(), Some(decl(shorthand).as_str()), "{generic} -> shorthand");
    }
  }

  /// A second pass changes nothing. Without this the output is not a fixed point,
  /// so `dprint check` could never pass on a file the plugin just wrote.
  #[test]
  fn already_canonical_is_left_alone() {
    for (generic, shorthand) in PAIRS {
      assert_eq!(run(&decl(generic), Generic), None, "{generic} under generic");
      assert_eq!(run(&decl(shorthand), Shorthand), None, "{shorthand} under shorthand");
    }
  }

  /// There and back is identity. This is the law that catches a direction which
  /// loses `readonly`, drops a nesting level, or eats a parenthesis: such a
  /// rewrite still looks plausible on its own and cannot come back.
  #[test]
  fn round_trip_is_identity() {
    for (generic, _) in PAIRS {
      let there = run(&decl(generic), Shorthand).expect("rewrites");
      let back = run(&there, Generic).expect("rewrites back");
      assert_eq!(back, decl(generic), "round trip via shorthand");
    }
  }

  #[test]
  fn leaves_types_with_no_second_spelling() {
    for spelling in UNTOUCHED {
      assert_eq!(run(&decl(spelling), Generic), None, "{spelling} under generic");
      assert_eq!(run(&decl(spelling), Shorthand), None, "{spelling} under shorthand");
    }
  }

  /// The payoff of parsing rather than matching text: the same characters inside
  /// a string or a comment are not a type.
  #[test]
  fn leaves_array_syntax_that_is_not_a_type() {
    let source = "const s = 'Alpha[] in a string'
// Alpha[] in a comment
";
    assert_eq!(run(source, Generic), None);
  }

  /// A file the parser cannot read is not this plugin's to repair.
  #[test]
  fn declines_unparseable_source() {
    assert_eq!(run("export type T = ", Generic), None);
  }

  /// Nesting is what consumes passes, so the cap is a real bound and not
  /// decoration: one pass cannot finish a doubly nested rewrite, and the failure
  /// is reported rather than silently truncated.
  #[test]
  fn pass_cap_reports_rather_than_truncates() {
    let deep = decl("Alpha[][][]");
    let one = canonicalize(std::path::Path::new("t.ts"), &deep, Generic, 1);
    assert!(one.is_err(), "one pass should not converge on triple nesting");
    let enough = canonicalize(std::path::Path::new("t.ts"), &deep, Generic, 16).expect("converges");
    assert_eq!(enough.as_deref(), Some(decl("Array<Array<Array<Alpha>>>").as_str()));
  }
}
