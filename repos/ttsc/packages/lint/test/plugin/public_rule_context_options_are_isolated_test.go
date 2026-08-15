package linthost

import (
  "encoding/json"
  "testing"

  shimast "github.com/microsoft/typescript-go/shim/ast"

  publicrule "github.com/samchon/ttsc/packages/lint/rule"
)

// TestPublicRuleContextOptionsAreIsolated verifies both public constructors
// give contributors their own option bytes. A contributor is free to decode or
// retain its Context, but mutating that Context must never corrupt the host's
// resolver state or another invocation.
func TestPublicRuleContextOptionsAreIsolated(t *testing.T) {
  constructors := []struct {
    name string
    make func(json.RawMessage) *publicrule.Context
  }{
    {
      name: "NewContext",
      make: func(options json.RawMessage) *publicrule.Context {
        return publicrule.NewContext(nil, nil, publicrule.SeverityError, options, nil)
      },
    },
    {
      name: "NewContextWithProjectResults",
      make: func(options json.RawMessage) *publicrule.Context {
        return publicrule.NewContextWithProjectResults(
          nil,
          nil,
          publicrule.SeverityError,
          options,
          nil,
          nil,
        )
      },
    },
  }

  for _, constructor := range constructors {
    t.Run(constructor.name+"/input mutation", func(t *testing.T) {
      options := json.RawMessage(`{"mode":"loud"}`)
      ctx := constructor.make(options)
      options[0] = '['
      if got, want := string(ctx.Options), `{"mode":"loud"}`; got != want {
        t.Fatalf("Context options alias constructor input: got %q, want %q", got, want)
      }
    })

    t.Run(constructor.name+"/context mutation", func(t *testing.T) {
      options := json.RawMessage(`{"mode":"loud"}`)
      ctx := constructor.make(options)
      ctx.Options[0] = '['
      if got, want := string(options), `{"mode":"loud"}`; got != want {
        t.Fatalf("constructor input aliases Context options: got %q, want %q", got, want)
      }
    })

    t.Run(constructor.name+"/invocation isolation", func(t *testing.T) {
      options := json.RawMessage(`{"mode":"loud"}`)
      first := constructor.make(options)
      second := constructor.make(options)
      first.Options[0] = '['
      if got, want := string(second.Options), `{"mode":"loud"}`; got != want {
        t.Fatalf("public Contexts share option bytes: got %q, want %q", got, want)
      }
    })

    t.Run(constructor.name+"/nil and empty", func(t *testing.T) {
      if got := constructor.make(nil).Options; got != nil {
        t.Fatalf("nil options became non-nil: %#v", got)
      }
      if got := constructor.make(json.RawMessage{}).Options; len(got) != 0 {
        t.Fatalf("empty options changed length: %d", len(got))
      }
    })
  }
}

// TestContributorCannotMutateLaterInvocationOptions exercises the host adapter,
// not only the public constructors. The first file deliberately corrupts its
// public Context; the second file and the resolver must still observe the
// original JSON document.
func TestContributorCannotMutateLaterInvocationOptions(t *testing.T) {
  contributor := &optionMutatingContributor{}
  metadata, err := inspectContributor(contributor)
  if err != nil {
    t.Fatalf("inspect contributor: %v", err)
  }
  registered.rules[metadata.name] = newContributorAdapter(metadata)
  t.Cleanup(func() { delete(registered.rules, metadata.name) })

  raw := json.RawMessage(`{"mode":"loud"}`)
  resolver := InlineRuleResolver{
    Rules: RuleConfig{metadata.name: SeverityError},
    Options: RuleOptionsMap{
      metadata.name: raw,
    },
  }
  engine := NewEngineWithResolver(resolver)
  engine.SetSerial(true)
  engine.Run([]*shimast.SourceFile{
    parseTS(t, "const first = 1;\n"),
    parseTS(t, "const second = 2;\n"),
  }, nil)

  if got, want := len(contributor.observed), 2; got != want {
    t.Fatalf("contributor invocation count = %d, want %d", got, want)
  }
  for i, got := range contributor.observed {
    if want := "loud"; got != want {
      t.Fatalf("invocation %d decoded mode %q, want %q", i, got, want)
    }
  }
  if got, want := string(raw), `{"mode":"loud"}`; got != want {
    t.Fatalf("contributor corrupted resolver options: got %q, want %q", got, want)
  }
}

type optionMutatingContributor struct {
  observed []string
}

func (*optionMutatingContributor) Name() string { return "demo/option-mutator" }
func (*optionMutatingContributor) Visits() []shimast.Kind {
  return []shimast.Kind{shimast.KindSourceFile}
}
func (c *optionMutatingContributor) Check(ctx *publicrule.Context, _ *shimast.Node) {
  var options struct {
    Mode string `json:"mode"`
  }
  _ = ctx.DecodeOptions(&options)
  c.observed = append(c.observed, options.Mode)
  if len(ctx.Options) != 0 {
    ctx.Options[0] = '['
  }
}
