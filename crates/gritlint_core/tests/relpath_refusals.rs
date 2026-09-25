#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::panic
)]

use gritlint_core::domain::{RelPath, RelPathRefusal};

#[test]
fn relpath_states_its_refusal_boundary() {
    let refused = [
        ("", RelPathRefusal::Empty),
        ("./", RelPathRefusal::Empty),
        ("/absolute/path", RelPathRefusal::Absolute),
        ("\\windows\\path", RelPathRefusal::Absolute),
        ("..", RelPathRefusal::ParentSegment),
        ("a/../b", RelPathRefusal::ParentSegment),
        ("a/b/..", RelPathRefusal::ParentSegment),
    ];
    for (raw, expected) in refused {
        assert_eq!(RelPath::new(raw).unwrap_err(), expected, "refused: {raw}");
    }

    let accepted = [
        "a",
        "a/b/c",
        "./a/b",
        "a-b_c.json",
        "a//b",
        "packages/app/package.json",
    ];
    for raw in accepted {
        assert!(RelPath::new(raw).is_ok(), "accepted: {raw}");
    }
}
