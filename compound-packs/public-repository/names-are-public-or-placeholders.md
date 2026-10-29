---
title: Every repository, package, product, organization, service, host or domain a public repository names is publicly reachable or a reserved placeholder
applies_when:
  - naming a repository, package, product, organization, service, host or domain in code, tests, fixtures, docs, plans, packs, commit messages or a pull request's title and body
  - writing an example, a fixture or a doc that mentions a third-party service or a deployment
  - stating which tools or services the organization uses
tags: [public-repository, privacy, names, hosts, domains]
---

A public repository names a repository, package, product, organization, service, host or domain only when a reader who is signed out can reach it: the repository opens on its forge, the package is on a public registry, the product, organization or service has a public page, the host resolves publicly. Everything else is described generically ("an inventory service", "the payments adapter") or uses a reserved placeholder: example.com, example.org, example.net or a name under .example, .test or .invalid for domains and hosts, and 192.0.2.0/24, 198.51.100.0/24 or 203.0.113.0/24 for IPv4 addresses.

A third-party service is named as one the organization uses only when this repository's own code or configuration uses it; a customer, supplier or partner relationship is stated only when it is announced on a public page.

Decision test: for each proper name, host, domain or address the diff adds to a file, a commit message or the pull request's title and body, the reviewer reaches it while signed out (forge, registry, public page, public DNS), finds it in this repository's code or configuration, or sees a reserved placeholder or a generic description. A name, host or address that is none of these fails, including one the author says is invented: an invented brand cannot be told apart from a private one. A host on a private network, a private address range or a machine name fails.

Defect: the existence of a private repository, unreleased product, internal host or business relationship is published, and once pushed it stays readable in every fork, clone and cached view.

```
WRONG
// mirrors the retry policy in <private-org>/<private-repo>, deployed at build-07.<private-zone>
const api = 'https://staging.<private-product>.io/v1'
```

```
RIGHT
// an inventory service retries a refused write three times
const api = 'https://inventory.example/v1'
```

Source: RFC 2606 and RFC 6761 section 6.5 reserve .test, .example, .invalid and example.com/.net/.org for testing and documentation; RFC 5737 sets aside 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24 for documentation; GitHub's "Removing sensitive data from a repository" says commits stay accessible in forks, clones and cached views after a force-push.

The review judge decides; an uncertain case escalates and never passes.

Gate: judge
