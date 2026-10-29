---
title: A failure state tells the person what happened in their terms and what they can do next, never raw error text
applies_when:
  - designing or rendering an error, failure, offline or timeout state on a user-facing screen
  - catching an error in code whose result a person sees
  - showing a person the result of a failed request, job or tool call
tags: [content, error-states, failure]
---

Every error branch a person can see renders a message chosen by the kind of failure. It says what did not happen in the person's terms and gives the one action they can take next (try again, change the input, sign in again, contact support), or says that nothing is needed from them. It never renders the error's own text (its message, a serialised error, a stack trace, a status or error code, failed tool-call output) or a bare 'Error', 'Unavailable' or 'Something went wrong'. Diagnostic detail goes to logs, never to the screen.

Review test: for each error branch the diff renders, read what the person would see. The change fails when that text is passed through from the error, when it is generic, or when it names no next step and does not say that none is needed.

Prevents: a person stranded at a failure they cannot understand or recover from, and internal detail leaking onto the screen.

```tsx
// WRONG: raw error text, and a bare status word
{
  error && <Alert>{error.message}</Alert>
}
{
  failed && <p>Unavailable</p>
}
```

```tsx
// RIGHT: the message is chosen by the failure's kind and offers the next step
{
  error?.kind === 'card-declined' && (
    <Alert>
      Your card was declined, so the order was not placed.
      <Button onClick={chooseAnotherCard}>Use another card</Button>
    </Alert>
  )
}
```

Source: Nielsen Norman Group, Error-Message Guidelines (Neusesser and Sunwall): 'Use human-readable language', 'Hide or minimize the use of obscure error codes', 'Generic messages such as An error occurred lack context' and 'Offer constructive advice': https://www.nngroup.com/articles/error-message-guidelines/

The review judge decides from the diff, never from the author's description; an uncertain verdict escalates to a person and never passes.

Gate: judge
