---
title: Every repository, package, product, organization, service, host, domain, tracker id or link a public repository names is reachable signed out or a reserved placeholder
applies_when:
  - naming a repository, package, product, organization, service, host or domain in code, tests, fixtures, docs, plans, packs, commit messages or a pull request's title and body
  - referring to a ticket, issue, pull request, CI run, chat thread or agent session
  - writing an example, a fixture or a doc that mentions a third-party service or a deployment
  - stating which tools or services the organization uses
tags: [public-repository, privacy, names, hosts, domains, tracker-ids, links]
---

Name a repository, package, product, organization, service, host or domain in a public repository only when a signed-out reader can reach it: the repository opens on its forge, the package is on a public registry, the service has a public page, the host resolves publicly. Otherwise describe it generically ("an inventory service") or use a reserved placeholder: `example.com`, `example.org`, `example.net` or a name under `.example`, `.test` or `.invalid`, and `192.0.2.0/24`, `198.51.100.0/24` or `203.0.113.0/24` for IPv4. An invented brand cannot be told apart from a private one, so it is not a placeholder. A private-network host, private address range or machine name is never committed.

Cite an issue, pull request, ticket, CI run, chat thread or session (in a file, commit message, or pull request title and body) only when a signed-out reader can open it: this repository's own, or a public upstream's. Replace a private tracker key (team prefix and number), another private repository's issue, a private CI run, a chat or meeting link or an agent session link with the fact it stood for.

Name a third-party service as one the organization uses only when this repository's own code or configuration uses it; state a customer, supplier or partner relationship only when announced on a public page.

```
WRONG  // retries three times, per ABC-412; mirrors <private-org>/<private-repo> at build-07.<private-zone>
RIGHT  // three retries: a fourth adds latency without recovering more refused writes
       const api = 'https://inventory.example/v1'
```
