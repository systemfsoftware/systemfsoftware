---
title: A failure state tells the person what happened in their terms and what they can do next, never raw error text
applies_when:
  - designing or rendering an error, failure, offline or timeout state on a user-facing screen
  - catching an error in code whose result a person sees
  - showing a person the result of a failed request, job or tool call
tags: [content, error-states, failure]
---

Render every error branch a person can see with a message chosen by the kind of failure. It says what did not happen in the person's terms and gives the one action they can take next (try again, change the input, sign in again, contact support), or says nothing is needed from them.

Never render the error's own text (its message, a serialised error, a stack trace, a status or error code, failed tool-call output) or a bare "Error", "Unavailable" or "Something went wrong". Diagnostic detail goes to logs, never to the screen.

```tsx
// WRONG
{
  error && <Alert>{error.message}</Alert>
}
// RIGHT
{
  error?.kind === 'card-declined' && (
    <Alert>
      Your card was declined, so the order was not placed. <Button onClick={chooseAnotherCard}>Use another card</Button>
    </Alert>
  )
}
```
