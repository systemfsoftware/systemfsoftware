---
name: requirements
description: Defines how to read the immutable requirement set under docs/analysis without omission or invention. Read before implementation and during completeness review.
---

# Requirements

## Contract

Every file under `docs/analysis/` is authoritative, immutable input. Read the complete directory. Do not assume filenames, skip navigation-looking files, edit the documents to match code, or add behavior because similar products usually have it.

One behavior may be split across actor, domain, operation, policy, and quality sections. Reconcile every mention. The operation may be named in one file while its authorization, refusal, threshold, or retention rule appears in another.

## Extract The Facts

For each requirement, capture every stated:

- actor or concept;
- circumstance, state, permission, input, or time;
- required behavior or prohibition;
- observable result or refusal;
- named value, unit, threshold, relationship, or boundary; and
- cross-reference to another section.

Do not fill an unstated category. Absence is not permission to invent.

```markdown
### Coupon Stacking

A customer may combine at most one seller-issued coupon with at most one
platform-issued coupon on one order. A second coupon from the same issuer is
refused. An expired coupon is refused even when no other coupon is present.
```

| Fact | Extracted requirement |
| --- | --- |
| actor | customer |
| circumstance | applying coupons to an order |
| behavior | allow at most one coupon per issuer |
| refusals | duplicate issuer and expired coupon |
| named values | seller, platform, maximum one each, validity window |

The issuer kinds need representation, the limits need enforcement, and the two refusals need distinct tests. Reading only “coupon stacking” would miss them.

## Walk Each Concept

Check every stated creation, inspection, change, transition, completion, recovery, authority, ownership, visibility, effect, conflict, and negative path. A prohibition is a requirement and needs an implementation and executable refusal proof.

Walk from requirements to artifacts to find missing work. Then walk from artifacts back to requirements to find inventions. The active arm's review skill defines the qualifying review procedure.
