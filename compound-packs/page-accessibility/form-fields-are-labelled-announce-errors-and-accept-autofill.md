---
title: Every form field on a page has a visible label, announces its error, declares autocomplete, and accepts paste and password managers
applies_when:
  - adding a signup, contact, waitlist, newsletter, login or checkout form to a page
  - adding or changing a form field, its validation or its error messages
  - adding a CAPTCHA or a multi-step form
tags: [accessibility, forms, labels, errors, autocomplete, authentication, page-suite]
---

axe fails a field with no name (`label`), a field named only by a hidden label or title (`label-title-only`), and an invalid autocomplete token (`autocomplete-valid`), but accepts a placeholder as a name. The page suite's `forms` test adds, for every form on every page:

- Label: each field's accessible name comes from visible text: a `<label>`, or text it references with `aria-labelledby`. Never a placeholder, `title` or `aria-label` alone.
- Errors: pressing Enter in the empty form's first field leaves each required field either natively `required` with the browser's message shown, or `aria-invalid="true"` with the error in its accessible description (`toHaveAccessibleDescription`) or in a `role="alert"` or `aria-live` region. Focus moves to the first invalid field or to an error summary.
- Autocomplete: every `input`, `select` and `textarea` has an `autocomplete` attribute. A field asking for the person's own data uses its HTML token (`name`, `email`, `tel`, `organization`, `street-address`, `postal-code`); others say `off`.
- Authentication (WCAG 3.3.8): a password field says `current-password` or `new-password` and a one-time code `one-time-code`; the test pastes text into each field from the keyboard and the value arrives.

Review (judge) checks that each token matches its label, that no CAPTCHA puzzle stands without a non-puzzle route, and that a multi-step form never asks again for what an earlier step collected (WCAG 3.3.7).

```html
<!-- WRONG -->
<input type="email" placeholder="Email" onpaste="return false">
<!-- RIGHT -->
<label for="email">Work email</label>
<input id="email" type="email" autocomplete="email" required aria-describedby="email-error">
<p id="email-error" hidden>Enter an email address, like name@example.com</p>
```

Gate: the page suite's `forms` test; review (judge) for token choice, CAPTCHA and repeated entry.
