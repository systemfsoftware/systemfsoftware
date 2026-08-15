import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The frontend baseline: the shared workspace rules plus the rule sets that
 * only make sense where JSX renders and a browser suite runs.
 *
 * The selection follows the same philosophy as the shared configuration:
 * concrete defects, not style policy. React rules catch hook and render
 * mistakes that compile cleanly and misbehave at runtime; accessibility rules
 * are correctness for the users assistive technology serves; query rules keep
 * cache keys honest; Playwright rules keep the browser suite from waiting,
 * skipping, or pausing its way to a green that proves nothing. `react-perf` is
 * deliberately omitted: rejecting every inline prop is optimization policy, not
 * defect detection.
 */
export default {
  extends: "./lint.config.ts",
  rules: {
    // React: hook discipline and render-time mistakes.
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "error",
    "react/component-hook-factories": "error",
    "react/immutability": "error",
    "react/refs": "error",
    "react/set-state-in-effect": "error",
    "react/set-state-in-render": "error",
    "react/use-memo": "error",
    // React: JSX shapes that break rendering or leak markup hazards.
    "react/jsx-key": "error",
    "react/no-array-index-key": "error",
    "react/jsx-no-duplicate-props": "error",
    "react/jsx-no-undef": "error",
    "react/no-children-prop": "error",
    "react/no-danger": "error",
    "react/no-danger-with-children": "error",
    "react/void-dom-elements-no-children": "error",
    "react/jsx-no-script-url": "error",
    "react/jsx-no-target-blank": "error",
    "react/button-has-type": "error",
    "react/style-prop-object": "error",
    "react/only-export-components": "error",

    // Accessibility: the interface is correct only if every user can drive it.
    "jsx-a11y/alt-text": "error",
    "jsx-a11y/anchor-has-content": "error",
    "jsx-a11y/anchor-is-valid": "error",
    "jsx-a11y/aria-activedescendant-has-tabindex": "error",
    "jsx-a11y/aria-props": "error",
    "jsx-a11y/aria-proptypes": "error",
    "jsx-a11y/aria-role": "error",
    "jsx-a11y/aria-unsupported-elements": "error",
    "jsx-a11y/autocomplete-valid": "error",
    "jsx-a11y/click-events-have-key-events": "error",
    "jsx-a11y/control-has-associated-label": "error",
    "jsx-a11y/heading-has-content": "error",
    "jsx-a11y/iframe-has-title": "error",
    "jsx-a11y/img-redundant-alt": "error",
    "jsx-a11y/interactive-supports-focus": "error",
    "jsx-a11y/label-has-associated-control": "error",
    "jsx-a11y/media-has-caption": "error",
    "jsx-a11y/mouse-events-have-key-events": "error",
    "jsx-a11y/no-access-key": "error",
    "jsx-a11y/no-aria-hidden-on-focusable": "error",
    "jsx-a11y/no-autofocus": "error",
    "jsx-a11y/no-distracting-elements": "error",
    "jsx-a11y/no-interactive-element-to-noninteractive-role": "error",
    "jsx-a11y/no-noninteractive-element-interactions": "error",
    "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
    "jsx-a11y/no-noninteractive-tabindex": "error",
    "jsx-a11y/no-redundant-roles": "error",
    "jsx-a11y/no-static-element-interactions": "error",
    "jsx-a11y/prefer-tag-over-role": "error",
    "jsx-a11y/role-has-required-aria-props": "error",
    "jsx-a11y/role-supports-aria-props": "error",
    "jsx-a11y/scope": "error",
    "jsx-a11y/tabindex-no-positive": "error",

    // TanStack Query: the cache is only as honest as its keys.
    "tanstack-query/exhaustive-deps": "error",
    "tanstack-query/infinite-query-property-order": "error",
    "tanstack-query/mutation-property-order": "error",
    "tanstack-query/no-rest-destructuring": "error",
    "tanstack-query/no-unstable-deps": "error",
    "tanstack-query/no-void-query-fn": "error",
    "tanstack-query/prefer-query-options": "error",
    "tanstack-query/stable-query-client": "error",

    // Playwright: a browser suite that waits, skips, or pauses proves nothing.
    "playwright/no-focused-test": "error",
    "playwright/no-skipped-test": "error",
    "playwright/no-page-pause": "error",
    "playwright/no-wait-for-timeout": "error",
    "playwright/no-wait-for-selector": "error",
    "playwright/no-wait-for-navigation": "error",
    "playwright/no-networkidle": "error",
    "playwright/no-element-handle": "error",
    "playwright/no-eval": "error",
    "playwright/no-force-option": "error",
    "playwright/no-conditional-expect": "error",
    "playwright/no-conditional-in-test": "error",
    "playwright/no-standalone-expect": "error",
    "playwright/no-duplicate-hooks": "error",
    "playwright/prefer-locator": "error",
    "playwright/prefer-web-first-assertions": "error",
    "playwright/prefer-to-have-count": "error",
    "playwright/prefer-to-have-length": "error",
    "playwright/require-to-throw-message": "error",
    "playwright/valid-describe-callback": "error",
    "playwright/valid-expect": "error",
    "playwright/valid-title": "error",
  },
} satisfies ITtscLintConfig;
