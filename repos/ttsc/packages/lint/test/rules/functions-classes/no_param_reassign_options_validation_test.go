package linthost

import (
  "encoding/json"
  "strings"
  "testing"
)

func noParamReassignValidationEngine(options json.RawMessage) *Engine {
  return NewEngineWithResolver(InlineRuleResolver{
    Rules: RuleConfig{"no-param-reassign": SeverityError},
    Options: RuleOptionsMap{
      "no-param-reassign": options,
    },
  })
}

func TestNoParamReassignOptionsValidatorAcceptsThePublicSchema(t *testing.T) {
  cases := []struct {
    name    string
    options json.RawMessage
  }{
    {name: "defaults", options: nil},
    {name: "empty object", options: json.RawMessage(`{}`)},
    {name: "props false", options: json.RawMessage(`{"props":false}`)},
    {
      name: "props true with both unique ignore lists",
      options: json.RawMessage(
        `{"props":true,"ignorePropertyModificationsFor":["first","second"],"ignorePropertyModificationsForRegex":["^safe$","^ignored\\d+$"]}`,
      ),
    },
    {
      name:    "ignore lists with props omitted",
      options: json.RawMessage(`{"ignorePropertyModificationsFor":["value"],"ignorePropertyModificationsForRegex":["^arg$"]}`),
    },
  }

  for _, tc := range cases {
    t.Run(tc.name, func(t *testing.T) {
      engine := noParamReassignValidationEngine(tc.options)
      if err := engine.ConfigError(); err != nil {
        t.Fatalf("valid no-param-reassign options were rejected: %v", err)
      }
      if engine.EnabledRules()["no-param-reassign"] != SeverityError {
        t.Fatalf("valid no-param-reassign options did not activate the rule: %v", engine.EnabledRules())
      }
      if !engine.NeedsTypeChecker() {
        t.Fatal("valid no-param-reassign options lost the rule's checker requirement")
      }
    })
  }
}

func TestNoParamReassignOptionsValidatorRejectsEveryInvalidSchemaBoundary(t *testing.T) {
  cases := []struct {
    name    string
    options json.RawMessage
    want    string
  }{
    {
      name:    "malformed JSON",
      options: json.RawMessage(`{"props":`),
      want:    "options must be valid JSON",
    },
    {
      name:    "null",
      options: json.RawMessage(`null`),
      want:    "options must be an object",
    },
    {
      name:    "array",
      options: json.RawMessage(`[]`),
      want:    "options must be an object",
    },
    {
      name:    "unknown keys are sorted",
      options: json.RawMessage(`{"z":true,"a":true}`),
      want:    `unknown option "a"`,
    },
    {
      name:    "props type",
      options: json.RawMessage(`{"props":null}`),
      want:    `option "props" must be a boolean`,
    },
    {
      name:    "exact ignores require an enabled props branch",
      options: json.RawMessage(`{"props":false,"ignorePropertyModificationsFor":["value"]}`),
      want:    `ignore options cannot be combined with "props" set to false`,
    },
    {
      name:    "empty regex ignores still violate the disabled props branch",
      options: json.RawMessage(`{"props":false,"ignorePropertyModificationsForRegex":[]}`),
      want:    `ignore options cannot be combined with "props" set to false`,
    },
    {
      name:    "exact ignore array type",
      options: json.RawMessage(`{"ignorePropertyModificationsFor":"value"}`),
      want:    `option "ignorePropertyModificationsFor" must be an array of strings`,
    },
    {
      name:    "exact ignore element type",
      options: json.RawMessage(`{"ignorePropertyModificationsFor":["value",1]}`),
      want:    `option "ignorePropertyModificationsFor"[1] must be a string`,
    },
    {
      name:    "duplicate exact ignore",
      options: json.RawMessage(`{"ignorePropertyModificationsFor":["value","value"]}`),
      want:    `option "ignorePropertyModificationsFor" contains duplicate value "value"`,
    },
    {
      name:    "duplicate regex ignore",
      options: json.RawMessage(`{"ignorePropertyModificationsForRegex":["^value$","^value$"]}`),
      want:    `option "ignorePropertyModificationsForRegex" contains duplicate value "^value$"`,
    },
    {
      name:    "invalid regex",
      options: json.RawMessage(`{"ignorePropertyModificationsForRegex":["["]}`),
      want:    `option "ignorePropertyModificationsForRegex"[0] must be a valid regular expression`,
    },
  }

  for _, tc := range cases {
    t.Run(tc.name, func(t *testing.T) {
      engine := noParamReassignValidationEngine(tc.options)
      err := engine.ConfigError()
      if err == nil || !strings.Contains(err.Error(), tc.want) {
        t.Fatalf("invalid no-param-reassign options mismatch: want=%q got=%v", tc.want, err)
      }
      if _, active := engine.EnabledRules()["no-param-reassign"]; active {
        t.Fatalf("invalid no-param-reassign options entered the dispatch table: %v", engine.EnabledRules())
      }
      if engine.NeedsTypeChecker() {
        t.Fatal("an invalid no-param-reassign configuration requested a checker")
      }
    })
  }
}

func TestCommandCheckRejectsInvalidNoParamReassignOptionsBeforeLinting(t *testing.T) {
  cases := []struct {
    name    string
    options map[string]any
    want    string
  }{
    {
      name: "unknown option",
      options: map[string]any{
        "props":      true,
        "unexpected": true,
      },
      want: "@ttsc/lint: invalid options for rule \"no-param-reassign\": unknown option \"unexpected\"\n",
    },
    {
      name: "disabled props with ignore list",
      options: map[string]any{
        "props":                          false,
        "ignorePropertyModificationsFor": []string{"value"},
      },
      want: "@ttsc/lint: invalid options for rule \"no-param-reassign\": ignore options cannot be combined with \"props\" set to false\n",
    },
    {
      name: "invalid regex",
      options: map[string]any{
        "props": true,
        "ignorePropertyModificationsForRegex": []string{
          "[",
        },
      },
      want: "@ttsc/lint: invalid options for rule \"no-param-reassign\": option \"ignorePropertyModificationsForRegex\"[0] must be a valid regular expression: error parsing regexp: missing closing ]: `[`\n",
    },
  }

  for _, tc := range cases {
    t.Run(tc.name, func(t *testing.T) {
      root := seedLintProject(t, `function mutate(value: any): void {
  value.field = 1;
}
JSON.stringify(mutate);
`)
      seedLintConfig(t, root, map[string]any{
        "rules": map[string]any{
          "no-param-reassign": []any{"error", tc.options},
        },
      })
      code, stdout, stderr := captureCommandOutput(t, func() int {
        return run([]string{
          "check",
          "--cwd", root,
          "--plugins-json", lintManifest(t),
        })
      })
      if code != 2 || stdout != "" || stderr != tc.want || strings.Contains(stderr, "[no-param-reassign]") {
        t.Fatalf("invalid no-param-reassign command mismatch: code=%d stdout=%q stderr=%q", code, stdout, stderr)
      }
    })
  }
}
