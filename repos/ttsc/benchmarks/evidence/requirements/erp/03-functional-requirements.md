# Operations, Reports, and End-to-End Journeys

Authorized Users work through lifecycle commands, searches, reports, approvals, postings, and preserving correction paths. Every operation is evaluated in the active organization, and the named cross-module journeys expose their final inventory, accounting, budget, payroll, asset, production, quality, service, audit, and closing effects.

## REQ-FUN-ORG: Organization Administration

For Organization, an Owner administers one organization while not gaining access to any other organization. Creation establishes the first Owner and required accounting, tax, inventory, approval, and numbering configuration.

Together, configuration changes affect future work while posted documents retain the values used. Deletion is a sensitive terminal command with explicit business blockers and audit effects.

### REQ-FUN-ORG-001: Creates an organization and becomes its first Owner

A user creates an organization and becomes its first Owner.

An Owner administers one organization while not gaining access to any other organization.

Creation establishes the first Owner and required accounting, tax, inventory, approval, and numbering configuration.

### REQ-FUN-ORG-002: Views the active organization's identity and configuration

An authorized member views the active organization's identity and configuration.

An Owner administers one organization while not gaining access to any other organization.

Creation establishes the first Owner and required accounting, tax, inventory, approval, and numbering configuration.

### REQ-FUN-ORG-003: Updates organization identity, accounting, inventory, approval

An Owner updates organization identity, accounting, inventory, approval, and numbering settings.

Creation establishes the first Owner and required accounting, tax, inventory, approval, and numbering configuration.

An Owner administers one organization while not gaining access to any other organization.

### REQ-FUN-ORG-004: Explain blockers for an organization deletion request

An Owner requests organization deletion and receives the exact blocking obligations when deletion is not allowed.

The result lists every present blocker among pending approvals, active employee contracts, unresolved documents in open periods, and posted financial or inventory records still under retention.

When any blocker exists, the organization, memberships, configuration, documents, postings, and history remain unchanged.

### REQ-FUN-ORG-005: An eligible organization is deleted with a retained sensitive audit event

An eligible organization is deleted with a retained sensitive audit event.

Deletion is a sensitive terminal command with explicit business blockers and audit effects.

An Owner administers one organization while not gaining access to any other organization.

## REQ-FUN-ADDRESS: Address Operations

For Address, authorized users work only with addresses in the currently selected organization. Creation and revision keep a reusable identity while document relationships retain their purpose.

Together, discovery supports selecting an address for billing, shipping, or physical-location use. Retirement prevents new selection while not breaking history.

### REQ-FUN-ADDRESS-001: Creates an address for the active organization

An authorized user creates an address for the active organization.

Authorized users work only with addresses in the currently selected organization.

Discovery supports selecting an address for billing, shipping, or physical-location use.

### REQ-FUN-ADDRESS-002: Finds addresses available for a named relationship purpose

An authorized user finds addresses available for a named relationship purpose.

Authorized users work only with addresses in the currently selected organization.

Creation and revision keep a reusable identity while document relationships retain their purpose.

### REQ-FUN-ADDRESS-003: Updates a reusable address without changing historical document address selections

An authorized user updates a reusable address without changing historical document address selections.

Creation and revision keep a reusable identity while document relationships retain their purpose.

Authorized users work only with addresses in the currently selected organization.

### REQ-FUN-ADDRESS-004: An authorized user deactivates an address so it cannot be selected for new relationships

An authorized user deactivates an address so it cannot be selected for new relationships.

Authorized users work only with addresses in the currently selected organization.

Creation and revision keep a reusable identity while document relationships retain their purpose.

## REQ-FUN-CONTACT: Contact Operations

For Contact, authorized users maintain contacts inside the currently selected organization. Party assignment and primary designation are explicit operations instead of properties inferred from order.

Together, discovery supports selecting contacts by party and communication identity. Retirement keeps prior party and document history.

### REQ-FUN-CONTACT-001: Creates a contact

An authorized user creates a contact.

Authorized users maintain contacts inside the currently selected organization.

Party assignment and primary designation are explicit operations instead of properties inferred from order.

### REQ-FUN-CONTACT-002: Finds contacts by party, name, email, phone

An authorized user finds contacts by party, name, email, phone, and active status.

Authorized users maintain contacts inside the currently selected organization.

Discovery supports selecting contacts by party and communication identity.

### REQ-FUN-CONTACT-003: Updates a contact's communication details

An authorized user updates a contact's communication details.

Authorized users maintain contacts inside the currently selected organization.

Discovery supports selecting contacts by party and communication identity.

### REQ-FUN-CONTACT-004: Assigns a contact to a vendor or customer and designates the party's single primary contact

An authorized user assigns a contact to a vendor or customer and designates the party's single primary contact.

Party assignment and primary designation are explicit operations instead of properties inferred from order.

Authorized users maintain contacts inside the currently selected organization.

### REQ-FUN-CONTACT-005: Deactivates a contact without erasing historical relationships

An authorized user deactivates a contact without erasing historical relationships.

Authorized users maintain contacts inside the currently selected organization.

Party assignment and primary designation are explicit operations instead of properties inferred from order.

## REQ-FUN-ATTACHMENT: Attachment Operations

For Attachment, attachment authority follows the currently selected organization and target record visibility. Adding a file never creates or changes the target's business lifecycle.

Together, inspection returns the target relationship, descriptive metadata, and uploader. Removal is allowed only where retention and posted-record policies permit it.

### REQ-FUN-ATTACHMENT-001: Adds an attachment to a concrete business record

An authorized user adds an attachment to a concrete business record.

Attachment authority follows the currently selected organization and target record visibility.

Adding a file never creates or changes the target's business lifecycle.

### REQ-FUN-ATTACHMENT-002: Lists and retrieves attachments visible through a target record

An authorized user lists and retrieves attachments visible through a target record.

Attachment authority follows the currently selected organization and target record visibility.

Adding a file never creates or changes the target's business lifecycle.

### REQ-FUN-ATTACHMENT-003: Removes an attachment only when the target's retention and immutability policy allows it

An authorized user removes an attachment only when the target's retention and immutability policy allows it.

Attachment authority follows the currently selected organization and target record visibility.

Removal is allowed only where retention and posted-record policies permit it.

## REQ-FUN-COMMENT: Comment Operations

For Comment, comment visibility follows the target record and currently selected organization. Creation attributes the author and time independently of the target's audit trail.

Together, authors can correct their own comment while the target stays visible. Removal does not alter business history or approval evidence.

### REQ-FUN-COMMENT-001: Adds a comment to a visible business record

An authorized user adds a comment to a visible business record.

Comment visibility follows the target record and currently selected organization.

Authors can correct their own comment while the target stays visible.

### REQ-FUN-COMMENT-002: Lists comments on a visible target in chronological order

An authorized user lists comments on a visible target in chronological order.

Authors can correct their own comment while the target stays visible.

Comment visibility follows the target record and currently selected organization.

### REQ-FUN-COMMENT-003: Edits their own comment

An author edits their own comment while preserving edit attribution.

Comment visibility follows the target record and currently selected organization.

Creation attributes the author and time independently of the target's audit trail.

### REQ-FUN-COMMENT-004: Removes their own comment when target-retention policy permits it

An author removes their own comment when target-retention policy permits it.

Comment visibility follows the target record and currently selected organization.

Creation attributes the author and time independently of the target's audit trail.

## REQ-FUN-TAG: Tag Operations

For Tag, tags exist only inside the currently selected organization. Creation and revision affect classification language instead of target lifecycle.

Together, assignment and removal change a target's labels while not changing its category or status. Discovery supports filtering visible records by tag.

### REQ-FUN-TAG-001: Creates a tag

An authorized user creates a tag.

Tags exist only inside the currently selected organization.

Creation and revision affect classification language instead of target lifecycle.

### REQ-FUN-TAG-002: Updates a tag label or description

An authorized user updates a tag label or description.

Tags exist only inside the currently selected organization.

Creation and revision affect classification language instead of target lifecycle.

### REQ-FUN-TAG-003: Assigns or removes a tag on a visible business record

An authorized user assigns or removes a tag on a visible business record.

Discovery supports filtering visible records by tag.

Tags exist only inside the currently selected organization.

### REQ-FUN-TAG-004: Finds visible records by tag

An authorized user finds visible records by tag.

Discovery supports filtering visible records by tag.

Tags exist only inside the currently selected organization.

### REQ-FUN-TAG-005: Deactivates an unused tag

An authorized user deactivates an unused tag while historical assignments remain inspectable.

Tags exist only inside the currently selected organization.

Creation and revision affect classification language instead of target lifecycle.

## REQ-FUN-CUSTOMFIELD: Custom Field Operations

For Custom Field, only Owners configure definitions because a definition changes organization-wide business capture. Definitions target an explicit concept and value kind.

Together, authorized operational users set values only on records they can edit. Deactivation prevents new values while preserving existing interpretation.

### REQ-FUN-CUSTOMFIELD-001: Creates a custom-field definition for a named business concept

An Owner creates a custom-field definition for a named business concept.

Only Owners configure definitions because a definition changes organization-wide business capture.

Definitions target an explicit concept and value kind.

### REQ-FUN-CUSTOMFIELD-002: Updates a custom-field definition without changing the meaning of retained values

An Owner updates a custom-field definition without changing the meaning of retained values.

Only Owners configure definitions because a definition changes organization-wide business capture.

Authorized operational users set values only on records they can edit.

### REQ-FUN-CUSTOMFIELD-003: An authorized user sets or clears a custom-field value on an editable target

An authorized user sets or clears a custom-field value on an editable target.

Definitions target an explicit concept and value kind.

Authorized operational users set values only on records they can edit.

### REQ-FUN-CUSTOMFIELD-004: Views custom-field values on a visible target

An authorized user views custom-field values on a visible target.

Authorized operational users set values only on records they can edit.

Definitions target an explicit concept and value kind.

### REQ-FUN-CUSTOMFIELD-005: Deactivates a definition

An Owner deactivates a definition while preserving existing values.

Deactivation prevents new values while preserving existing interpretation.

Only Owners configure definitions because a definition changes organization-wide business capture.

## REQ-FUN-CURRENCY: Currency Operations

For Currency, currency administration is scoped to the currently selected organization. Activation controls future selection while not invalidating retained monetary values.

Together, discovery supports code and active-status selection. The organization base currency is changed only through organization configuration.

### REQ-FUN-CURRENCY-001: Adds a supported currency

A Finance Manager adds a supported currency.

Currency administration is scoped to the currently selected organization.

The organization base currency is changed only through organization configuration.

### REQ-FUN-CURRENCY-002: Updates descriptive currency information

A Finance Manager updates descriptive currency information.

Currency administration is scoped to the currently selected organization.

The organization base currency is changed only through organization configuration.

### REQ-FUN-CURRENCY-003: Finds active currencies by code or name

An authorized user finds active currencies by code or name.

Discovery supports code and active-status selection.

Currency administration is scoped to the currently selected organization.

### REQ-FUN-CURRENCY-004: Deactivates a non-base currency

A Finance Manager deactivates a non-base currency while historical amounts remain readable.

The organization base currency is changed only through organization configuration.

Currency administration is scoped to the currently selected organization.

## REQ-FUN-EXCHANGE-RATE: Exchange Rate Operations

For Exchange Rate, rate operations keep organization, ordered pair, effective date, and origin. A Finance Manager can record a manual rate when authorized.

Together, the System principal refreshes configured rate sources under the same audit boundary. Posting discovers the applicable rate and keeps the chosen value.

### REQ-FUN-EXCHANGE-RATE-001: Records or corrects a dated exchange rate

A Finance Manager records or corrects a dated exchange rate.

A Finance Manager can record a manual rate when authorized.

Rate operations keep organization, ordered pair, effective date, and origin.

### REQ-FUN-EXCHANGE-RATE-002: Searches exchange rates by currency pair and effective date

An authorized user searches exchange rates by currency pair and effective date.

Rate operations keep organization, ordered pair, effective date, and origin.

A Finance Manager can record a manual rate when authorized.

### REQ-FUN-EXCHANGE-RATE-003: The organization System principal refreshes exchange rates from configured sources

The organization System principal refreshes exchange rates from configured sources.

The System principal refreshes configured rate sources under the same audit boundary.

Rate operations keep organization, ordered pair, effective date, and origin.

### REQ-FUN-EXCHANGE-RATE-004: Selects the applicable rate for a foreign-currency document and records it on the posting

Posting selects the applicable rate for a foreign-currency document and records it on the posting.

Posting discovers the applicable rate and keeps the chosen value.

Rate operations keep organization, ordered pair, effective date, and origin.

## REQ-FUN-PAYMENT-TERM: Payment Term Operations

For Payment Term, terms are organization-scoped and reusable across purchasing and sales. Creation and update make due-date behavior explicit.

Together, discovery supports party defaults and document selection. Deactivation stops new use while preserving documents.

### REQ-FUN-PAYMENT-TERM-001: Creates a payment term

An authorized Finance, Procurement, or Sales Manager creates a payment term.

Terms are organization-scoped and reusable across purchasing and sales.

Creation and update make due-date behavior explicit.

### REQ-FUN-PAYMENT-TERM-002: Updates a payment term

An authorized manager updates a payment term.

Terms are organization-scoped and reusable across purchasing and sales.

Creation and update make due-date behavior explicit.

### REQ-FUN-PAYMENT-TERM-003: Finds active payment terms by name and due-date convention

An authorized user finds active payment terms by name and due-date convention.

Terms are organization-scoped and reusable across purchasing and sales.

Creation and update make due-date behavior explicit.

### REQ-FUN-PAYMENT-TERM-004: Deactivates a payment term

An authorized manager deactivates a payment term while retained documents keep it.

Deactivation stops new use while preserving documents.

Terms are organization-scoped and reusable across purchasing and sales.

## REQ-FUN-TAX-JURISDICTION: Tax Jurisdiction Operations

For Tax Jurisdiction, jurisdictions belong to the currently selected organization. Creation and revision support tax-code and return setup.

Together, discovery supports organization configuration, party treatment, and filing. Deactivation prevents future selection while not changing posted tax.

### REQ-FUN-TAX-JURISDICTION-001: Creates a tax jurisdiction

A Finance Manager creates a tax jurisdiction.

Jurisdictions belong to the currently selected organization.

Creation and revision support tax-code and return setup.

### REQ-FUN-TAX-JURISDICTION-002: Updates jurisdiction identity and filing context

A Finance Manager updates jurisdiction identity and filing context.

Discovery supports organization configuration, party treatment, and filing.

Jurisdictions belong to the currently selected organization.

### REQ-FUN-TAX-JURISDICTION-003: Finds active jurisdictions by territorial identity

An authorized user finds active jurisdictions by territorial identity.

Jurisdictions belong to the currently selected organization.

Creation and revision support tax-code and return setup.

### REQ-FUN-TAX-JURISDICTION-004: Deactivates a jurisdiction with historical tax records retained

A Finance Manager deactivates a jurisdiction with historical tax records retained.

Jurisdictions belong to the currently selected organization.

Creation and revision support tax-code and return setup.

## REQ-FUN-TAX-CODE: Tax Code Operations

For Tax Code, codes and rates stay scoped to one jurisdiction and organization. Creation selects a source-defined tax type and posting accounts.

Together, effective-dated rate changes keep past calculation meaning. Discovery supports transaction-date and party/item tax resolution.

### REQ-FUN-TAX-CODE-001: Creates a tax code with type and account relationships

A Finance Manager creates a tax code with type and account relationships.

Creation selects a source-defined tax type and posting accounts.

Codes and rates stay scoped to one jurisdiction and organization.

### REQ-FUN-TAX-CODE-002: Adds a new effective tax rate without rewriting earlier rates

A Finance Manager adds a new effective tax rate without rewriting earlier rates.

Effective-dated rate changes keep past calculation meaning.

Codes and rates stay scoped to one jurisdiction and organization.

### REQ-FUN-TAX-CODE-003: An Tax Code for posting user resolves

An authorized posting user resolves the applicable tax code and rate from party location, item taxability, transaction date, and selected code.

Discovery supports transaction-date and party/item tax resolution.

Creation selects a source-defined tax type and posting accounts.

### REQ-FUN-TAX-CODE-004: Deactivates a tax code

A Finance Manager deactivates a tax code while posted tax remains reproducible.

Codes and rates stay scoped to one jurisdiction and organization.

Creation selects a source-defined tax type and posting accounts.

## REQ-FUN-UOM: Unit of Measure Operations

For Unit of Measure, units are organization-scoped and reusable across modules. Creation and revision keep code and category meaning.

Together, discovery supports item and document-line selection. Deactivation blocks new use while not invalidating historical quantities.

### REQ-FUN-UOM-001: Creates a unit of measure

An authorized master-data manager creates a unit of measure.

Units are organization-scoped and reusable across modules.

Creation and revision keep code and category meaning.

### REQ-FUN-UOM-002: Updates a unit's name or category

An authorized master-data manager updates a unit's name or category.

Creation and revision keep code and category meaning.

Units are organization-scoped and reusable across modules.

### REQ-FUN-UOM-003: Finds active units by code, name

An authorized user finds active units by code, name, and category.

Creation and revision keep code and category meaning.

Units are organization-scoped and reusable across modules.

### REQ-FUN-UOM-004: Deactivates a unit

An authorized master-data manager deactivates a unit while retained quantities preserve it.

Creation and revision keep code and category meaning.

Deactivation blocks new use while not invalidating historical quantities.

## REQ-FUN-DOC-NUMBER: Document Number Operations

For Document Number Sequence, one sequence is scoped to one organization and document type. Owners configure conventions while issuance advances atomically for a concrete document.

Together, the System principal can advance scheduled or generated numbering under organization attribution. Discovery shows current conventions while not exposing numbers from another organization.

### REQ-FUN-DOC-NUMBER-001: Creates or updates a numbering convention for one document type

An Owner creates or updates a numbering convention for one document type.

One sequence is scoped to one organization and document type.

Owners configure conventions while issuance advances atomically for a concrete document.

### REQ-FUN-DOC-NUMBER-002: Views numbering conventions in the active organization

An authorized user views numbering conventions in the active organization.

The System principal can advance scheduled or generated numbering under organization attribution.

Discovery shows current conventions while not exposing numbers from another organization.

### REQ-FUN-DOC-NUMBER-003: Creating a numbered document obtains the next unique number from its document-type sequence

Creating a numbered document obtains the next unique number from its document-type sequence.

One sequence is scoped to one organization and document type.

Owners configure conventions while issuance advances atomically for a concrete document.

### REQ-FUN-DOC-NUMBER-004: The Document Number Sequence for system principal advances

The System principal advances a sequence for automated document creation without issuing duplicates.

One sequence is scoped to one organization and document type.

Owners configure conventions while issuance advances atomically for a concrete document.

## REQ-FUN-FISCAL-CALENDAR: Fiscal Calendar Operations

For Fiscal Calendar, the fiscal start month controls period generation for one organization. Creating a year establishes ordered periods for posting, budgets, depreciation, tax, and reporting.

Together, inspection shows dates and lifecycle states while not mixing organizations. Historical calendars stay stable after posted activity exists.

### REQ-FUN-FISCAL-CALENDAR-001: Creates a fiscal year and its periods from the organization's fiscal start month

A Finance Manager creates a fiscal year and its periods from the organization's fiscal start month.

The fiscal start month controls period generation for one organization.

Creating a year establishes ordered periods for posting, budgets, depreciation, tax, and reporting.

### REQ-FUN-FISCAL-CALENDAR-002: Views fiscal years and periods by date and status

An authorized user views fiscal years and periods by date and status.

The fiscal start month controls period generation for one organization.

Creating a year establishes ordered periods for posting, budgets, depreciation, tax, and reporting.

### REQ-FUN-FISCAL-CALENDAR-003: A Fiscal Calendar for finance corrects future

A Finance Manager corrects future unposted period dates without changing periods that contain posted activity.

Inspection shows dates and lifecycle states while not mixing organizations.

Historical calendars stay stable after posted activity exists.

## REQ-FUN-NOTIFICATION-PREFERENCE: Notification Preference Operations

For Notification Preference, a user owns preferences separately in each organization membership. Viewing preferences explains ordinary categories and mandatory risk notices.

Together, updating preferences affects future delivery choices. High-risk owner and manager notices stay enabled by policy.

### REQ-FUN-NOTIFICATION-PREFERENCE-001: Views their notification preferences for the active organization

A user views their notification preferences for the active organization.

A user owns preferences separately in each organization membership.

Viewing preferences explains ordinary categories and mandatory risk notices.

### REQ-FUN-NOTIFICATION-PREFERENCE-002: Updates ordinary notification categories and delivery choices

A user updates ordinary notification categories and delivery choices.

Viewing preferences explains ordinary categories and mandatory risk notices.

Updating preferences affects future delivery choices.

### REQ-FUN-NOTIFICATION-PREFERENCE-003: Refuses a preference change that would suppress mandatory high-risk notices

The product refuses a preference change that would suppress mandatory high-risk notices.

Viewing preferences explains ordinary categories and mandatory risk notices.

High-risk owner and manager notices stay enabled by policy.

## REQ-FUN-ACCOUNT: Ledger Account Operations

For Ledger Account, organization setup seeds the standard account catalog before operational posting. Finance Managers create, inspect, revise, activate, and deactivate accounts inside the currently selected organization.

Together, hierarchy and code search support account selection and reporting. Used accounts leave service only through deactivation or an approved merge.

### REQ-FUN-ACCOUNT-001: Organization setup seeds the standard asset, liability, equity, revenue

Organization setup seeds the standard asset, liability, equity, revenue, and expense accounts.

Organization setup seeds the standard account catalog before operational posting.

Finance Managers create, inspect, revise, activate, and deactivate accounts inside the currently selected organization.

### REQ-FUN-ACCOUNT-002: Creates a ledger account and optional parent relationship

A Finance Manager creates a ledger account and optional parent relationship.

Organization setup seeds the standard account catalog before operational posting.

Finance Managers create, inspect, revise, activate, and deactivate accounts inside the currently selected organization.

### REQ-FUN-ACCOUNT-003: Searches accounts by code, name, type, currency, parent

An authorized user searches accounts by code, name, type, currency, parent, and active status.

Finance Managers create, inspect, revise, activate, and deactivate accounts inside the currently selected organization.

Hierarchy and code search support account selection and reporting.

### REQ-FUN-ACCOUNT-004: Updates an unused or active account's descriptive information

A Finance Manager updates an unused or active account's descriptive information.

Finance Managers create, inspect, revise, activate, and deactivate accounts inside the currently selected organization.

Organization setup seeds the standard account catalog before operational posting.

### REQ-FUN-ACCOUNT-005: Deactivates or reactivates an account

A Finance Manager deactivates or reactivates an account.

Organization setup seeds the standard account catalog before operational posting.

Finance Managers create, inspect, revise, activate, and deactivate accounts inside the currently selected organization.

### REQ-FUN-ACCOUNT-006: Receives approval for

A Finance Manager requests, receives approval for, and executes a merge of an account with posted history.

Organization setup seeds the standard account catalog before operational posting.

Finance Managers create, inspect, revise, activate, and deactivate accounts inside the currently selected organization.

### REQ-FUN-ACCOUNT-007: Deletes an account that has no posted entries

A Finance Manager deletes an account that has no posted entries.

Organization setup seeds the standard account catalog before operational posting.

Finance Managers create, inspect, revise, activate, and deactivate accounts inside the currently selected organization.

## REQ-FUN-JOURNAL: Journal Entry Operations

For Journal Entry, draft operations stay distinct from approval and irreversible posting. Posting validates base-currency balance and source attribution before creating accounting history.

Together, search exposes source, status, amounts, dimensions, parties, items, and period. Reversal, void, and adjustment are distinct correction paths that retain the original.

### REQ-FUN-JOURNAL-001: Creates a draft manual journal with source context, memo, date, currency

A Finance user creates a draft manual journal with source context, memo, date, currency, and lines.

Posting validates base-currency balance and source attribution before creating accounting history.

Draft operations stay distinct from approval and irreversible posting.

### REQ-FUN-JOURNAL-002: Edits a draft journal and its lines

An authorized creator edits a draft journal and its lines.

Draft operations stay distinct from approval and irreversible posting.

Posting validates base-currency balance and source attribution before creating accounting history.

### REQ-FUN-JOURNAL-003: Deletes a draft journal

An authorized creator deletes a draft journal.

Draft operations stay distinct from approval and irreversible posting.

Posting validates base-currency balance and source attribution before creating accounting history.

### REQ-FUN-JOURNAL-004: Submits a manual journal for configured approval

An authorized user submits a manual journal for configured approval.

Draft operations stay distinct from approval and irreversible posting.

Posting validates base-currency balance and source attribution before creating accounting history.

### REQ-FUN-JOURNAL-005: Changes on a journal approval

An assigned approver approves, rejects, or requests changes on a journal approval.

Draft operations stay distinct from approval and irreversible posting.

Posting validates base-currency balance and source attribution before creating accounting history.

### REQ-FUN-JOURNAL-006: Posts an eligible balanced journal

A Finance Manager posts an eligible balanced journal.

Draft operations stay distinct from approval and irreversible posting.

Posting validates base-currency balance and source attribution before creating accounting history.

### REQ-FUN-JOURNAL-007: Searches journal entries across the source-defined filters

An authorized user searches journal entries across the source-defined filters.

Posting validates base-currency balance and source attribution before creating accounting history.

Search exposes source, status, amounts, dimensions, parties, items, and period.

### REQ-FUN-JOURNAL-008: A Finance Manager reverses a posted journal with a reason

A Finance Manager reverses a posted journal with a reason.

Draft operations stay distinct from approval and irreversible posting.

Posting validates base-currency balance and source attribution before creating accounting history.

### REQ-FUN-JOURNAL-009: A Finance Manager voids an eligible journal

A Finance Manager voids an eligible journal while preserving its history.

Posting validates base-currency balance and source attribution before creating accounting history.

Draft operations stay distinct from approval and irreversible posting.

### REQ-FUN-JOURNAL-010: Creates a new adjustment journal linked to the corrected entry

A Finance Manager creates a new adjustment journal linked to the corrected entry.

Reversal, void, and adjustment are distinct correction paths that retain the original.

Draft operations stay distinct from approval and irreversible posting.

## REQ-FUN-PERIOD-CLOSE: Fiscal Period Close and Reopen

For Fiscal Period, Finance Managers move a period through soft close and hard close while module owners resolve named blockers. Validation exposes every unresolved receipt, shipment, valuation, reconciliation, journal, approval, payroll, depreciation, production, and tax item.

Together, hard close freezes the named report snapshots and blocks later posting. Only an Owner can initiate a reasoned approval workflow to reopen.

### REQ-FUN-PERIOD-CLOSE-001: A Finance Manager soft-closes an open fiscal period

A Finance Manager soft-closes an open fiscal period.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Validation exposes every unresolved receipt, shipment, valuation, reconciliation, journal, approval, payroll, depreciation, production, and tax item.

### REQ-FUN-PERIOD-CLOSE-002: Runs close validation and receives the complete blocker list

A Finance Manager runs close validation and receives the complete blocker list.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Validation exposes every unresolved receipt, shipment, valuation, reconciliation, journal, approval, payroll, depreciation, production, and tax item.

### REQ-FUN-PERIOD-CLOSE-003: Responsible module users resolve close blockers and rerun validation

Responsible module users resolve close blockers and rerun validation.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Validation exposes every unresolved receipt, shipment, valuation, reconciliation, journal, approval, payroll, depreciation, production, and tax item.

### REQ-FUN-PERIOD-CLOSE-004: A Finance Manager hard-closes a blocker-free period and freezes all named snapshots

A Finance Manager hard-closes a blocker-free period and freezes all named snapshots.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Hard close freezes the named report snapshots and blocks later posting.

### REQ-FUN-PERIOD-CLOSE-005: An authorized user reproduces a hard-closed period report from its closing snapshot

An authorized user reproduces a hard-closed period report from its closing snapshot.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Hard close freezes the named report snapshots and blocks later posting.

### REQ-FUN-PERIOD-CLOSE-006: An Owner requests period reopening with a reason

An Owner requests period reopening with a reason.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Only an Owner can initiate a reasoned approval workflow to reopen.

### REQ-FUN-PERIOD-CLOSE-007: Assigned approvers approve or reject a period-reopen request

Assigned approvers approve or reject a period-reopen request.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Only an Owner can initiate a reasoned approval workflow to reopen.

### REQ-FUN-PERIOD-CLOSE-008: Reopens the period with an audit event

An approved Owner reopens the period with an audit event.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Only an Owner can initiate a reasoned approval workflow to reopen.

### REQ-FUN-PERIOD-CLOSE-009: A Finance Manager recloses a corrected reopened period as a new close cycle

A Finance Manager recloses a corrected reopened period as a new close cycle.

Finance Managers move a period through soft close and hard close while module owners resolve named blockers.

Hard close freezes the named report snapshots and blocks later posting.

## REQ-FUN-BANK-ACCOUNT: Bank Account Operations

For Bank Account, bank accounts are visible only in the currently selected organization. Creation and revision retain currency, opening balance, ledger account, and reconciliation state.

Together, discovery supports payment, import, matching, and reconciliation selection. Deactivation prevents new cash activity while preserving history.

### REQ-FUN-BANK-ACCOUNT-001: Creates a bank account linked to a ledger account

A Finance Manager creates a bank account linked to a ledger account.

Creation and revision retain currency, opening balance, ledger account, and reconciliation state.

Bank accounts are visible only in the currently selected organization.

### REQ-FUN-BANK-ACCOUNT-002: Views bank-account balances and reconciliation state

An authorized Finance user views bank-account balances and reconciliation state.

Creation and revision retain currency, opening balance, ledger account, and reconciliation state.

Bank accounts are visible only in the currently selected organization.

### REQ-FUN-BANK-ACCOUNT-003: Updates descriptive bank-account information

A Finance Manager updates descriptive bank-account information.

Bank accounts are visible only in the currently selected organization.

Creation and revision retain currency, opening balance, ledger account, and reconciliation state.

### REQ-FUN-BANK-ACCOUNT-004: Deactivates a bank account with historical activity retained

A Finance Manager deactivates a bank account with historical activity retained.

Bank accounts are visible only in the currently selected organization.

Creation and revision retain currency, opening balance, ledger account, and reconciliation state.

## REQ-FUN-BANK-TRANSACTION: Bank Transaction Operations

For Bank Transaction, import and manual recording are distinct entry paths with the same organization boundary. Discovery shows unresolved and matched activity for a bank account and date range.

Together, matching selects one of the source-defined eligible payment or journal targets. Ignore and reconcile are explicit terminal decisions that keep evidence.

### REQ-FUN-BANK-TRANSACTION-001: Imports bank transactions for one bank account

A Finance user imports bank transactions for one bank account.

Discovery shows unresolved and matched activity for a bank account and date range.

Import and manual recording are distinct entry paths with the same organization boundary.

### REQ-FUN-BANK-TRANSACTION-002: Records a bank transaction manually

A Finance user records a bank transaction manually.

Discovery shows unresolved and matched activity for a bank account and date range.

Import and manual recording are distinct entry paths with the same organization boundary.

### REQ-FUN-BANK-TRANSACTION-003: Searches bank transactions by bank account, statement date, amount, reference

An authorized Finance user searches bank transactions by bank account, statement date, amount, reference, and status.

Discovery shows unresolved and matched activity for a bank account and date range.

Import and manual recording are distinct entry paths with the same organization boundary.

### REQ-FUN-BANK-TRANSACTION-004: Matches Bank Transaction for finance user matches

A Finance user matches a transaction to an eligible customer payment, vendor payment, payroll payment, journal, transfer, or adjustment.

Matching selects one of the source-defined eligible payment or journal targets.

Import and manual recording are distinct entry paths with the same organization boundary.

### REQ-FUN-BANK-TRANSACTION-005: Marks an irrelevant transaction ignored

A Finance user marks an irrelevant transaction ignored.

Import and manual recording are distinct entry paths with the same organization boundary.

Discovery shows unresolved and matched activity for a bank account and date range.

### REQ-FUN-BANK-TRANSACTION-006: Marks its included transactions reconciled

Completing a reconciliation marks its included transactions reconciled.

Import and manual recording are distinct entry paths with the same organization boundary.

Discovery shows unresolved and matched activity for a bank account and date range.

## REQ-FUN-RECONCILIATION: Bank Reconciliation Operations

For Bank Reconciliation, a reconciliation begins with one bank account, statement period, and opening and ending balances. Line selection and matching explain the difference between statement and ledger cash.

Together, completion freezes the statement result and operator attribution. Reopening is a distinguish approval-controlled correction command.

### REQ-FUN-RECONCILIATION-001: Creates a reconciliation for a bank statement period

A Finance user creates a reconciliation for a bank statement period.

A reconciliation begins with one bank account, statement period, and opening and ending balances.

Line selection and matching explain the difference between statement and ledger cash.

### REQ-FUN-RECONCILIATION-002: Adds or resolves reconciliation lines and transaction matches

A Finance user adds or resolves reconciliation lines and transaction matches.

A reconciliation begins with one bank account, statement period, and opening and ending balances.

Line selection and matching explain the difference between statement and ledger cash.

### REQ-FUN-RECONCILIATION-003: Completes a balanced reconciliation

A Finance user completes a balanced reconciliation.

A reconciliation begins with one bank account, statement period, and opening and ending balances.

Line selection and matching explain the difference between statement and ledger cash.

### REQ-FUN-RECONCILIATION-004: A Finance Manager requests approval to reopen a completed reconciliation

A Finance Manager requests approval to reopen a completed reconciliation.

A reconciliation begins with one bank account, statement period, and opening and ending balances.

Reopening is a distinguish approval-controlled correction command.

### REQ-FUN-RECONCILIATION-005: Approves or rejects reconciliation reopening

An assigned approver approves or rejects reconciliation reopening.

A reconciliation begins with one bank account, statement period, and opening and ending balances.

Reopening is a distinguish approval-controlled correction command.

### REQ-FUN-RECONCILIATION-006: Reopens an approved reconciliation with an audit event

A Finance Manager reopens an approved reconciliation with an audit event.

A reconciliation begins with one bank account, statement period, and opening and ending balances.

Line selection and matching explain the difference between statement and ledger cash.

## REQ-FUN-TAX-RETURN: Tax Return Operations

For Tax Return, return work is scoped to one jurisdiction and period. Preparation derives lines from posted tax activity and source documents.

Together, review and filing retain distinguish actors and dates. Amendment creates a linked version instead of changing the filing.

### REQ-FUN-TAX-RETURN-001: A Finance user prepares a draft tax return from posted tax activity

A Finance user prepares a draft tax return from posted tax activity.

Preparation derives lines from posted tax activity and source documents.

Return work is scoped to one jurisdiction and period.

### REQ-FUN-TAX-RETURN-002: Approves or rejects a prepared return

A Finance reviewer reviews and approves or rejects a prepared return.

Return work is scoped to one jurisdiction and period.

Preparation derives lines from posted tax activity and source documents.

### REQ-FUN-TAX-RETURN-003: Files an approved return

An authorized Finance user files an approved return.

Return work is scoped to one jurisdiction and period.

Preparation derives lines from posted tax activity and source documents.

### REQ-FUN-TAX-RETURN-004: Creates an amendment that references a filed return

A Finance user creates an amendment that references a filed return.

Amendment creates a linked version instead of changing the filing.

Return work is scoped to one jurisdiction and period.

### REQ-FUN-TAX-RETURN-005: Views the original and amendment version history

An authorized user views the original and amendment version history.

Amendment creates a linked version instead of changing the filing.

Return work is scoped to one jurisdiction and period.

### REQ-FUN-TAX-RETURN-006: A Finance user reconciles a tax return and tax report to posted journals and source documents

A Finance user reconciles a tax return and tax report to posted journals and source documents.

Preparation derives lines from posted tax activity and source documents.

Return work is scoped to one jurisdiction and period.

## REQ-FUN-VENDOR: Vendor Operations

For Vendor, vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships. Search keeps every source-named commercial and risk filter.

Together, bank-account change uses a dedicated approval and audit flow. Deactivation and deletion depend on historical purchase relationships.

### REQ-FUN-VENDOR-001: Creates a vendor with commercial, contact, address, risk

A Procurement user creates a vendor with commercial, contact, address, risk, and bank information.

Vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships.

Search keeps every source-named commercial and risk filter.

### REQ-FUN-VENDOR-002: Updates non-sensitive vendor information

A Procurement user updates non-sensitive vendor information.

Vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships.

Search keeps every source-named commercial and risk filter.

### REQ-FUN-VENDOR-003: Searches vendors by name, tax identity, status, currency, payment terms, country

An authorized user searches vendors by name, tax identity, status, currency, payment terms, country, and risk level.

Vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships.

Search keeps every source-named commercial and risk filter.

### REQ-FUN-VENDOR-004: A Procurement user requests a vendor bank-account change

A Procurement user requests a vendor bank-account change.

Bank-account change uses a dedicated approval and audit flow.

Vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships.

### REQ-FUN-VENDOR-005: Approves or rejects the bank-account change

An assigned approver approves or rejects the bank-account change.

Bank-account change uses a dedicated approval and audit flow.

Vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships.

### REQ-FUN-VENDOR-006: Applies an approved bank-account change with an audit event

An authorized Procurement user applies an approved bank-account change with an audit event.

Bank-account change uses a dedicated approval and audit flow.

Vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships.

### REQ-FUN-VENDOR-007: Deactivates a vendor with historical purchasing

A Procurement Manager deactivates a vendor with historical purchasing.

Vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships.

Deactivation and deletion depend on historical purchase relationships.

### REQ-FUN-VENDOR-008: Deletes a vendor that has no historical purchase documents

A Procurement Manager deletes a vendor that has no historical purchase documents.

Deactivation and deletion depend on historical purchase relationships.

Vendor creation and revision cover identity, terms, risk, addresses, contacts, notes, and bank relationships.

## REQ-FUN-PURCHASE-REQUEST: Purchase Request Operations

For Purchase Request, the requester owns draft content and line-level business context. Submission locks business fields and invokes conditional approval routing.

Together, approval, rejection, and requested change are distinct outcomes. Conversion can split approved remaining quantities across several purchase orders.

### REQ-FUN-PURCHASE-REQUEST-001: Creates a draft purchase request and lines

An Employee creates a draft purchase request and lines.

The requester owns draft content and line-level business context.

Conversion can split approved remaining quantities across several purchase orders.

### REQ-FUN-PURCHASE-REQUEST-002: Edits their draft request

The requester edits their draft request.

The requester owns draft content and line-level business context.

Submission locks business fields and invokes conditional approval routing.

### REQ-FUN-PURCHASE-REQUEST-003: Deletes their draft request

The requester deletes their draft request.

The requester owns draft content and line-level business context.

Submission locks business fields and invokes conditional approval routing.

### REQ-FUN-PURCHASE-REQUEST-004: Submits a nonterminal request for approval

The requester submits a nonterminal request for approval.

The requester owns draft content and line-level business context.

Submission locks business fields and invokes conditional approval routing.

### REQ-FUN-PURCHASE-REQUEST-005: Routes the request from amount, context, account, vendor, requester role

The approval engine routes the request from amount, context, account, vendor, requester role, and budget availability.

The requester owns draft content and line-level business context.

Submission locks business fields and invokes conditional approval routing.

### REQ-FUN-PURCHASE-REQUEST-006: Approves the request

An assigned approver approves the request.

The requester owns draft content and line-level business context.

Submission locks business fields and invokes conditional approval routing.

### REQ-FUN-PURCHASE-REQUEST-007: Rejects the request

An assigned approver rejects the request.

The requester owns draft content and line-level business context.

Submission locks business fields and invokes conditional approval routing.

### REQ-FUN-PURCHASE-REQUEST-008: Changes and returns the request to draft

An assigned approver requests changes and returns the request to draft.

The requester owns draft content and line-level business context.

Submission locks business fields and invokes conditional approval routing.

### REQ-FUN-PURCHASE-REQUEST-009: Cancels an eligible request

The requester cancels an eligible request.

The requester owns draft content and line-level business context.

Submission locks business fields and invokes conditional approval routing.

### REQ-FUN-PURCHASE-REQUEST-010: A Procurement user converts approved remaining line quantity into one or more purchase orders

A Procurement user converts approved remaining line quantity into one or more purchase orders.

Conversion can split approved remaining quantities across several purchase orders.

The requester owns draft content and line-level business context.

## REQ-FUN-PURCHASE-ORDER: Purchase Order Operations

For Purchase Order, an order can consume approved request remainder or begin as authorized direct purchasing. Draft editing ends at approval; later business changes use controlled change orders.

Together, sending, receiving, and billing progress stay separately visible. Closure and cancellation expose unresolved downstream blockers.

### REQ-FUN-PURCHASE-ORDER-001: Creates a draft purchase order from approved request lines

A Procurement user creates a draft purchase order from approved request lines.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-002: Creates a direct draft purchase order

An authorized Procurement user creates a direct draft purchase order.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-003: Edits or deletes a draft purchase order

A Procurement user edits or deletes a draft purchase order.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-004: Submits an order for approval

A Procurement user submits an order for approval.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-005: Changes on the order

An assigned approver approves, rejects, or requests changes on the order.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-006: A Procurement user sends an approved order to the vendor

A Procurement user sends an approved order to the vendor.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-007: A Procurement user requests a controlled change order with a reason

A Procurement user requests a controlled change order with a reason.

Draft editing ends at approval; later business changes use controlled change orders.

An order can consume approved request remainder or begin as authorized direct purchasing.

### REQ-FUN-PURCHASE-ORDER-008: Approves or rejects a purchase-order change

An assigned approver approves or rejects a purchase-order change.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-009: Applies an approved change order and preserves before and after values

A Procurement user applies an approved change order and preserves before and after values.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-010: Closes a fully resolved purchase order

A Procurement Manager closes a fully resolved purchase order.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

### REQ-FUN-PURCHASE-ORDER-011: Cancels an eligible purchase order

A Procurement Manager cancels an eligible purchase order.

An order can consume approved request remainder or begin as authorized direct purchasing.

Draft editing ends at approval; later business changes use controlled change orders.

## REQ-FUN-PURCHASE-RECEIPT: Purchase Receipt Operations

For Purchase Receipt, receipt entry always selects source order remainder and a destination warehouse or location. Accepted and rejected quantities plus lot or serial details stay visible before posting.

Together, posting creates immutable stock movement and order progress. Correction creates a return or adjustment instead of editing the receipt.

### REQ-FUN-PURCHASE-RECEIPT-001: Creates a draft receipt against a purchase order

A Warehouse or Procurement user creates a draft receipt against a purchase order.

Receipt entry always selects source order remainder and a destination warehouse or location.

Posting creates immutable stock movement and order progress.

### REQ-FUN-PURCHASE-RECEIPT-002: Records received, accepted, rejected, lot or serial, warehouse

The receiver records received, accepted, rejected, lot or serial, warehouse, and location details.

Accepted and rejected quantities plus lot or serial details stay visible before posting.

Receipt entry always selects source order remainder and a destination warehouse or location.

### REQ-FUN-PURCHASE-RECEIPT-003: Posts the receipt and its stock movements

An authorized Warehouse user posts the receipt and its stock movements.

Receipt entry always selects source order remainder and a destination warehouse or location.

Posting creates immutable stock movement and order progress.

### REQ-FUN-PURCHASE-RECEIPT-004: Views receipt source links, quantities, posting

An authorized user views receipt source links, quantities, posting, and downstream bill matches.

Receipt entry always selects source order remainder and a destination warehouse or location.

Accepted and rejected quantities plus lot or serial details stay visible before posting.

### REQ-FUN-PURCHASE-RECEIPT-005: An authorized user corrects a posted receipt through a purchase return or inventory adjustment

An authorized user corrects a posted receipt through a purchase return or inventory adjustment.

Correction creates a return or adjustment instead of editing the receipt.

Receipt entry always selects source order remainder and a destination warehouse or location.

## REQ-FUN-PURCHASE-RETURN: Purchase Return Operations

For Purchase Return, a return begins from a posted receipt and available returned quantity. Posting keeps warehouse, location, lot, and serial traceability.

Together, the source order's received and remaining quantities update with the return. Vendor credit or bill adjustment completes the financial correction.

### REQ-FUN-PURCHASE-RETURN-001: Creates a purchase return from a posted receipt

A Procurement or Warehouse user creates a purchase return from a posted receipt.

A return begins from a posted receipt and available returned quantity.

Posting keeps warehouse, location, lot, and serial traceability.

### REQ-FUN-PURCHASE-RETURN-002: Posts the return and outbound stock movements

An authorized user posts the return and outbound stock movements.

A return begins from a posted receipt and available returned quantity.

The source order's received and remaining quantities update with the return.

### REQ-FUN-PURCHASE-RETURN-003: Updates source purchase-order received and remaining quantities

The product updates source purchase-order received and remaining quantities.

The source order's received and remaining quantities update with the return.

A return begins from a posted receipt and available returned quantity.

### REQ-FUN-PURCHASE-RETURN-004: Creates the resulting vendor credit or bill adjustment

A Procurement or Finance user creates the resulting vendor credit or bill adjustment.

Vendor credit or bill adjustment completes the financial correction.

A return begins from a posted receipt and available returned quantity.

## REQ-FUN-VENDOR-BILL: Vendor Bill Operations

For Vendor Bill, bill entry selects purchase-order or receipt sources and line-level quantity and price evidence. Three-way matching is a distinct query and decision surface.

Together, approval precedes posting when required by workflow or variance. Dispute, payment, and void keep the posted liability history.

### REQ-FUN-VENDOR-BILL-001: Creates a draft vendor bill from purchase orders or receipts

A Finance or Procurement user creates a draft vendor bill from purchase orders or receipts.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

Three-way matching is a distinct query and decision surface.

### REQ-FUN-VENDOR-BILL-002: Edits the draft bill

An authorized creator edits the draft bill.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

Three-way matching is a distinct query and decision surface.

### REQ-FUN-VENDOR-BILL-003: Runs three-way matching across order, receipt

An authorized user runs three-way matching across order, receipt, and bill quantities and prices.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

Three-way matching is a distinct query and decision surface.

### REQ-FUN-VENDOR-BILL-004: Routes variance beyond tolerance for approval

The product routes variance beyond tolerance for approval.

Approval precedes posting when required by workflow or variance.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

### REQ-FUN-VENDOR-BILL-005: Changes on the bill

An assigned approver approves, rejects, or requests changes on the bill.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

Three-way matching is a distinct query and decision surface.

### REQ-FUN-VENDOR-BILL-006: Posts an approved bill to accounts payable and expense or inventory accrual

A Finance user posts an approved bill to accounts payable and expense or inventory accrual.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

Three-way matching is a distinct query and decision surface.

### REQ-FUN-VENDOR-BILL-007: Marks a bill disputed with a reason

An authorized user marks a bill disputed with a reason.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

Three-way matching is a distinct query and decision surface.

### REQ-FUN-VENDOR-BILL-008: An authorized user resolves a bill dispute

An authorized user resolves a bill dispute.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

Dispute, payment, and void keep the posted liability history.

### REQ-FUN-VENDOR-BILL-009: A Finance user voids an eligible bill through a preserving correction

A Finance user voids an eligible bill through a preserving correction.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

Three-way matching is a distinct query and decision surface.

### REQ-FUN-VENDOR-BILL-010: Views bill matching, posting, payment, dispute

An authorized user views bill matching, posting, payment, dispute, and source-link history.

Dispute, payment, and void keep the posted liability history.

Bill entry selects purchase-order or receipt sources and line-level quantity and price evidence.

## REQ-FUN-VENDOR-PAYMENT: Vendor Payment Operations

For Vendor Payment, payment entry selects vendor, currency, bank or cash account, amount, and eligible bill balances. Allocations can be partial and span several bills.

Together, posting reduces AP and cash or bank with source-linked journal effects. Reconciliation and correction retain the payment identity.

### REQ-FUN-VENDOR-PAYMENT-001: Creates a vendor payment and allocations across one or more bills

A Finance user creates a vendor payment and allocations across one or more bills.

Payment entry selects vendor, currency, bank or cash account, amount, and eligible bill balances.

Allocations can be partial and span several bills.

### REQ-FUN-VENDOR-PAYMENT-002: A Finance user revises an unposted payment allocation

A Finance user revises an unposted payment allocation.

Payment entry selects vendor, currency, bank or cash account, amount, and eligible bill balances.

Reconciliation and correction retain the payment identity.

### REQ-FUN-VENDOR-PAYMENT-003: Posts the payment and accounting effects

A Finance user posts the payment and accounting effects.

Payment entry selects vendor, currency, bank or cash account, amount, and eligible bill balances.

Posting reduces AP and cash or bank with source-linked journal effects.

### REQ-FUN-VENDOR-PAYMENT-004: Views remaining bill balances and payment allocation history

An authorized user views remaining bill balances and payment allocation history.

Payment entry selects vendor, currency, bank or cash account, amount, and eligible bill balances.

Reconciliation and correction retain the payment identity.

### REQ-FUN-VENDOR-PAYMENT-005: A Finance user reverses an eligible payment with a reason

A Finance user reverses an eligible payment with a reason.

Payment entry selects vendor, currency, bank or cash account, amount, and eligible bill balances.

Reconciliation and correction retain the payment identity.

## REQ-FUN-VENDOR-CREDIT: Vendor Credit Operations

For Vendor Credit, a credit begins from a purchase return or bill correction. The remaining balance stays visible after partial application.

Together, applying and refunding are distinct settlement choices. Every outcome keeps the credit and upstream source chain.

### REQ-FUN-VENDOR-CREDIT-001: Creates a vendor credit from a purchase return or bill correction

A Finance user creates a vendor credit from a purchase return or bill correction.

A credit begins from a purchase return or bill correction.

Every outcome keeps the credit and upstream source chain.

### REQ-FUN-VENDOR-CREDIT-002: Applies all or part of a vendor credit to one or more bills

A Finance user applies all or part of a vendor credit to one or more bills.

A credit begins from a purchase return or bill correction.

Every outcome keeps the credit and upstream source chain.

### REQ-FUN-VENDOR-CREDIT-003: A Finance user refunds a vendor credit through a bank or cash movement

A Finance user refunds a vendor credit through a bank or cash movement.

A credit begins from a purchase return or bill correction.

Every outcome keeps the credit and upstream source chain.

### REQ-FUN-VENDOR-CREDIT-004: Views credit origin, applications, refunds

An authorized user views credit origin, applications, refunds, and remaining balance.

The remaining balance stays visible after partial application.

A credit begins from a purchase return or bill correction.

## REQ-FUN-ITEM: Item Operations

For Item, item authority is shared by Warehouse, Procurement, Sales, Production, and relevant specialist roles according to permission. Creation selects item type, unit, prices, tax, tracking, costing, and planning behavior.

Together, discovery supports cross-module selection by SKU, name, category, type, status, and planning facts. Deactivation prevents new use while preserving every source and posting relation.

### REQ-FUN-ITEM-001: Creates an item with type, SKU, unit, prices, tax, tracking, costing

An authorized master-data user creates an item with type, SKU, unit, prices, tax, tracking, costing, and planning information.

Creation selects item type, unit, prices, tax, tracking, costing, and planning behavior.

Discovery supports cross-module selection by SKU, name, category, type, status, and planning facts.

### REQ-FUN-ITEM-002: Searches items by SKU, name, category, type, status, tracking mode, preferred vendor

An authorized user searches items by SKU, name, category, type, status, tracking mode, preferred vendor, and warehouse planning context.

Discovery supports cross-module selection by SKU, name, category, type, status, and planning facts.

Creation selects item type, unit, prices, tax, tracking, costing, and planning behavior.

### REQ-FUN-ITEM-003: Updates an active item's descriptive, commercial, tax

An authorized master-data user updates an active item's descriptive, commercial, tax, and planning information.

Creation selects item type, unit, prices, tax, tracking, costing, and planning behavior.

Item authority is shared by Warehouse, Procurement, Sales, Production, and relevant specialist roles according to permission.

### REQ-FUN-ITEM-004: Updates item planning settings

A Production or Procurement Manager updates item planning settings.

Item authority is shared by Warehouse, Procurement, Sales, Production, and relevant specialist roles according to permission.

Creation selects item type, unit, prices, tax, tracking, costing, and planning behavior.

### REQ-FUN-ITEM-005: Deactivates or reactivates an item

An authorized manager deactivates or reactivates an item.

Item authority is shared by Warehouse, Procurement, Sales, Production, and relevant specialist roles according to permission.

Creation selects item type, unit, prices, tax, tracking, costing, and planning behavior.

## REQ-FUN-WAREHOUSE: Warehouse Operations

For Warehouse, warehouse operations stay inside the currently selected organization. Creation selects code, address, manager, status, and valuation policy.

Together, discovery shows facility, manager, status, and stock context. Deactivation blocks new activity while preserving stock and posting history.

### REQ-FUN-WAREHOUSE-001: Creates a warehouse

A Warehouse Manager creates a warehouse.

Warehouse operations stay inside the currently selected organization.

Creation selects code, address, manager, status, and valuation policy.

### REQ-FUN-WAREHOUSE-002: Searches warehouses by code, status, manager

An authorized user searches warehouses by code, status, manager, and address.

Creation selects code, address, manager, status, and valuation policy.

Discovery shows facility, manager, status, and stock context.

### REQ-FUN-WAREHOUSE-003: Updates warehouse identity, address, manager

A Warehouse Manager updates warehouse identity, address, manager, and valuation policy.

Creation selects code, address, manager, status, and valuation policy.

Warehouse operations stay inside the currently selected organization.

### REQ-FUN-WAREHOUSE-004: Deactivates or reactivates a warehouse

A Warehouse Manager deactivates or reactivates a warehouse.

Warehouse operations stay inside the currently selected organization.

Creation selects code, address, manager, status, and valuation policy.

## REQ-FUN-LOCATION: Storage Location Operations

For Storage Location, every operation is constrained to one warehouse and organization. Creation selects a parent while not exceeding three levels.

Together, discovery supports warehouse, parent, code, status, and stock selection. Deactivation prevents future movements while not changing history.

### REQ-FUN-LOCATION-001: Creates a storage location within a warehouse

A Warehouse Manager creates a storage location within a warehouse.

Every operation is constrained to one warehouse and organization.

Discovery supports warehouse, parent, code, status, and stock selection.

### REQ-FUN-LOCATION-002: Searches locations by warehouse, code, parent, status

An authorized user searches locations by warehouse, code, parent, status, and stock context.

Discovery supports warehouse, parent, code, status, and stock selection.

Every operation is constrained to one warehouse and organization.

### REQ-FUN-LOCATION-003: Updates a location or its eligible parent

A Warehouse Manager updates a location or its eligible parent.

Discovery supports warehouse, parent, code, status, and stock selection.

Every operation is constrained to one warehouse and organization.

### REQ-FUN-LOCATION-004: Deactivates or reactivates a location

A Warehouse Manager deactivates or reactivates a location.

Every operation is constrained to one warehouse and organization.

Discovery supports warehouse, parent, code, status, and stock selection.

## REQ-FUN-STOCK-VIEW: Stock Discovery and Traceability

For Stock Movement, stock views derive from immutable movements in the currently selected organization. On-hand discovery supports item, warehouse, location, lot, serial, and availability filters.

Together, movement history connects quantity and unit cost to source document, date, type, and operator. Traceability follows lots and serials across procurement, production, sales, quality, maintenance, and service.

### REQ-FUN-STOCK-VIEW-001: Views stock on hand by item, warehouse, location, lot, serial

An authorized user views stock on hand by item, warehouse, location, lot, serial, and availability state.

On-hand discovery supports item, warehouse, location, lot, serial, and availability filters.

Stock views derive from immutable movements in the currently selected organization.

### REQ-FUN-STOCK-VIEW-002: Searches Stock Movement for user searches immutable

An authorized user searches immutable stock movements by item, warehouse, location, lot, serial, type, source, date, and operator.

On-hand discovery supports item, warehouse, location, lot, serial, and availability filters.

Movement history connects quantity and unit cost to source document, date, type, and operator.

### REQ-FUN-STOCK-VIEW-003: Traces a lot across every receipt, quarantine, production, shipment, return

An authorized user traces a lot across every receipt, quarantine, production, shipment, return, and consumption movement.

Traceability follows lots and serials across procurement, production, sales, quality, maintenance, and service.

Movement history connects quantity and unit cost to source document, date, type, and operator.

### REQ-FUN-STOCK-VIEW-004: Traces a serial across receipt, movement, shipment, return, inspection, asset

An authorized user traces a serial across receipt, movement, shipment, return, inspection, asset, and service history.

Movement history connects quantity and unit cost to source document, date, type, and operator.

Traceability follows lots and serials across procurement, production, sales, quality, maintenance, and service.

### REQ-FUN-STOCK-VIEW-005: Views weighted-average inventory cost and its receipt-driven changes

An authorized user views weighted-average inventory cost and its receipt-driven changes.

Stock views derive from immutable movements in the currently selected organization.

Movement history connects quantity and unit cost to source document, date, type, and operator.

## REQ-FUN-TRANSFER: Warehouse Transfer Operations

For Warehouse Transfer, a transfer selects source and destination facilities, locations, and identified stock. Draft editing is distinguish from shipment and receipt posting.

Together, partial shipment and receipt keep in-transit and remaining quantities. Cancellation exposes posted movement effects instead of silently deleting them.

### REQ-FUN-TRANSFER-001: Creates and edits a draft transfer

A Warehouse user creates and edits a draft transfer.

A transfer selects source and destination facilities, locations, and identified stock.

Draft editing is distinct from shipment and receipt posting.

### REQ-FUN-TRANSFER-002: Posts outbound movements

A Warehouse user ships all or part of a transfer and posts outbound movements.

A transfer selects source and destination facilities, locations, and identified stock.

Draft editing is distinct from shipment and receipt posting.

### REQ-FUN-TRANSFER-003: Receives all or part of a shipped transfer and posts inbound movements

A Warehouse user receives all or part of a shipped transfer and posts inbound movements.

A transfer selects source and destination facilities, locations, and identified stock.

Draft editing is distinct from shipment and receipt posting.

### REQ-FUN-TRANSFER-004: Views requested, shipped, in-transit, received

An authorized user views requested, shipped, in-transit, received, and remaining transfer quantities.

Partial shipment and receipt keep in-transit and remaining quantities.

A transfer selects source and destination facilities, locations, and identified stock.

### REQ-FUN-TRANSFER-005: Cancels an eligible transfer

A Warehouse Manager cancels an eligible transfer.

A transfer selects source and destination facilities, locations, and identified stock.

Draft editing is distinct from shipment and receipt posting.

## REQ-FUN-CYCLE-COUNT: Cycle Count Operations

For Cycle Count, count creation freezes expected quantity for a warehouse or location scope. Performance records observed quantities independently of approval.

Together, submission, approval, rejection, and posting are distinct commands. Posting creates adjustment movements only for approved variance.

### REQ-FUN-CYCLE-COUNT-001: Creates a cycle count and expected stock snapshot

A Warehouse user creates a cycle count and expected stock snapshot.

Count creation freezes expected quantity for a warehouse or location scope.

Posting creates adjustment movements only for approved variance.

### REQ-FUN-CYCLE-COUNT-002: Records counted quantities

An assigned counter records counted quantities.

Performance records observed quantities independently of approval.

Count creation freezes expected quantity for a warehouse or location scope.

### REQ-FUN-CYCLE-COUNT-003: Submits the performed count

The counter submits the performed count.

Count creation freezes expected quantity for a warehouse or location scope.

Performance records observed quantities independently of approval.

### REQ-FUN-CYCLE-COUNT-004: Approves the count

An assigned approver approves the count.

Count creation freezes expected quantity for a warehouse or location scope.

Performance records observed quantities independently of approval.

### REQ-FUN-CYCLE-COUNT-005: Rejects the count with a reason

An assigned approver rejects the count with a reason.

Count creation freezes expected quantity for a warehouse or location scope.

Performance records observed quantities independently of approval.

### REQ-FUN-CYCLE-COUNT-006: Posts an approved count and its adjustment movements

A Warehouse Manager posts an approved count and its adjustment movements.

Posting creates adjustment movements only for approved variance.

Count creation freezes expected quantity for a warehouse or location scope.

## REQ-FUN-INVENTORY-ADJUSTMENT: Inventory Adjustment Operations

For Inventory Adjustment, adjustment creation captures stock context, delta, and reason. Material adjustments route through approval before posting.

Together, posting creates immutable movements and a sensitive audit event. Correction uses a new reversing adjustment instead of editing the posting.

### REQ-FUN-INVENTORY-ADJUSTMENT-001: Creates a draft inventory adjustment with a reason

A Warehouse user creates a draft inventory adjustment with a reason.

Adjustment creation captures stock context, delta, and reason.

Posting creates immutable movements and a sensitive audit event.

### REQ-FUN-INVENTORY-ADJUSTMENT-002: Submits an adjustment for threshold-aware approval

A Warehouse user submits an adjustment for threshold-aware approval.

Adjustment creation captures stock context, delta, and reason.

Material adjustments route through approval before posting.

### REQ-FUN-INVENTORY-ADJUSTMENT-003: Approves or rejects the adjustment

An assigned approver approves or rejects the adjustment.

Adjustment creation captures stock context, delta, and reason.

Correction uses a new reversing adjustment instead of editing the posting.

### REQ-FUN-INVENTORY-ADJUSTMENT-004: Posts an approved adjustment and audit event

A Warehouse Manager posts an approved adjustment and audit event.

Posting creates immutable movements and a sensitive audit event.

Adjustment creation captures stock context, delta, and reason.

### REQ-FUN-INVENTORY-ADJUSTMENT-005: Views adjustment approval, source, movement

An authorized user views adjustment approval, source, movement, and quantity effects.

Adjustment creation captures stock context, delta, and reason.

Material adjustments route through approval before posting.

### REQ-FUN-INVENTORY-ADJUSTMENT-006: Creates a reversing adjustment for an erroneous posting

A Warehouse Manager creates a reversing adjustment for an erroneous posting.

Correction uses a new reversing adjustment instead of editing the posting.

Posting creates immutable movements and a sensitive audit event.

## REQ-FUN-CUSTOMER: Customer Operations

For Customer, customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes. Search keeps every source-named commercial and exposure filter.

Together, credit-limit change uses a dedicated approval and audit path. Historical sales cause deactivation instead of deletion.

### REQ-FUN-CUSTOMER-001: Creates a customer with identity, tax, address, contact, terms, currency, credit

A Sales user creates a customer with identity, tax, address, contact, terms, currency, credit, and note information.

Customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes.

Credit-limit change uses a dedicated approval and audit path.

### REQ-FUN-CUSTOMER-002: Updates non-sensitive customer information

A Sales user updates non-sensitive customer information.

Customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes.

Historical sales cause deactivation instead of deletion.

### REQ-FUN-CUSTOMER-003: Searches customers by name, tax identity, status, currency, payment terms, credit exposure

An authorized user searches customers by name, tax identity, status, currency, payment terms, credit exposure, and country.

Customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes.

Search keeps every source-named commercial and exposure filter.

### REQ-FUN-CUSTOMER-004: A Sales user requests a customer credit-limit change

A Sales user requests a customer credit-limit change.

Credit-limit change uses a dedicated approval and audit path.

Customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes.

### REQ-FUN-CUSTOMER-005: Approves or rejects the credit-limit change

An assigned approver approves or rejects the credit-limit change.

Credit-limit change uses a dedicated approval and audit path.

Customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes.

### REQ-FUN-CUSTOMER-006: Applies an approved credit-limit change with an audit event

An authorized Sales user applies an approved credit-limit change with an audit event.

Credit-limit change uses a dedicated approval and audit path.

Customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes.

### REQ-FUN-CUSTOMER-007: Deactivates a customer with historical sales

A Sales Manager deactivates a customer with historical sales.

Historical sales cause deactivation instead of deletion.

Customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes.

### REQ-FUN-CUSTOMER-008: Deletes a customer that has no historical sales

A Sales Manager deletes a customer that has no historical sales.

Historical sales cause deactivation instead of deletion.

Customer operations cover identity, tax, addresses, contacts, terms, credit, status, and notes.

## REQ-FUN-SALES-PRICE: Sales Price Operations

For Sales Price, prices are scoped by organization, item, currency, dates, and optional customer. Creation and revision apply prospectively while documents retain selected values.

Together, discovery selects the effective record for a business date and customer. Deactivation prevents new selection while not changing prior offers.

### REQ-FUN-SALES-PRICE-001: Creates an effective sales price

A Sales Manager creates an effective sales price.

Discovery selects the effective record for a business date and customer.

Prices are scoped by organization, item, currency, dates, and optional customer.

### REQ-FUN-SALES-PRICE-002: Updates future pricing without rewriting quote or order lines

A Sales Manager updates future pricing without rewriting quote or order lines.

Deactivation prevents new selection while not changing prior offers.

Prices are scoped by organization, item, currency, dates, and optional customer.

### REQ-FUN-SALES-PRICE-003: An authorized Sales user resolves the effective price by item, currency, customer

An authorized Sales user resolves the effective price by item, currency, customer, and business date.

Discovery selects the effective record for a business date and customer.

Prices are scoped by organization, item, currency, dates, and optional customer.

### REQ-FUN-SALES-PRICE-004: Deactivates a sales price

A Sales Manager deactivates a sales price.

Prices are scoped by organization, item, currency, dates, and optional customer.

Creation and revision apply prospectively while documents retain selected values.

## REQ-FUN-SALES-QUOTE: Sales Quote Operations

For Sales Quote, draft creation selects customer, dates, currency, representative, prices, and lines. Sending locks the offer version presented to the customer.

Together, acceptance, rejection, and expiration are distinct outcomes. Conversion creates a linked order and keeps the quote.

### REQ-FUN-SALES-QUOTE-001: Creates and edits a draft sales quote

A Sales user creates and edits a draft sales quote.

Conversion creates a linked order and keeps the quote.

Draft creation selects customer, dates, currency, representative, prices, and lines.

### REQ-FUN-SALES-QUOTE-002: A Sales user sends a draft quote to the customer

A Sales user sends a draft quote to the customer.

Draft creation selects customer, dates, currency, representative, prices, and lines.

Sending locks the offer version presented to the customer.

### REQ-FUN-SALES-QUOTE-003: Records customer acceptance

An authorized Sales user records customer acceptance.

Draft creation selects customer, dates, currency, representative, prices, and lines.

Sending locks the offer version presented to the customer.

### REQ-FUN-SALES-QUOTE-004: Records customer rejection

An authorized Sales user records customer rejection.

Draft creation selects customer, dates, currency, representative, prices, and lines.

Sending locks the offer version presented to the customer.

### REQ-FUN-SALES-QUOTE-005: Marks an unaccepted quote expired after its expiration date

The System principal marks an unaccepted quote expired after its expiration date.

Acceptance, rejection, and expiration are distinct outcomes.

Conversion creates a linked order and keeps the quote.

### REQ-FUN-SALES-QUOTE-006: A Sales user converts an accepted quote to a sales order

A Sales user converts an accepted quote to a sales order.

Conversion creates a linked order and keeps the quote.

Draft creation selects customer, dates, currency, representative, prices, and lines.

## REQ-FUN-SALES-ORDER: Sales Order Operations

For Sales Order, an order can originate directly or from an accepted quote. Credit evaluation and approval precede stock allocation.

Together, allocation, shipment, invoice, return, cancellation, and remaining quantities stay visible at line level. Post-shipment cancellation is refused until linked returns or credits resolve effects.

### REQ-FUN-SALES-ORDER-001: Creates a direct draft sales order

A Sales user creates a direct draft sales order.

An order can originate directly or from an accepted quote.

Credit evaluation and approval precede stock allocation.

### REQ-FUN-SALES-ORDER-002: Creates a draft order from an accepted quote

A Sales user creates a draft order from an accepted quote.

An order can originate directly or from an accepted quote.

Credit evaluation and approval precede stock allocation.

### REQ-FUN-SALES-ORDER-003: Edits or deletes a draft order

A Sales user edits or deletes a draft order.

An order can originate directly or from an accepted quote.

Credit evaluation and approval precede stock allocation.

### REQ-FUN-SALES-ORDER-004: Submits an order for approval

A Sales user submits an order for approval.

An order can originate directly or from an accepted quote.

Credit evaluation and approval precede stock allocation.

### REQ-FUN-SALES-ORDER-005: The product checks customer credit exposure before approval

The product checks customer credit exposure before approval.

Credit evaluation and approval precede stock allocation.

An order can originate directly or from an accepted quote.

### REQ-FUN-SALES-ORDER-006: Changes on the order

An assigned approver approves, rejects, or requests changes on the order.

An order can originate directly or from an accepted quote.

Credit evaluation and approval precede stock allocation.

### REQ-FUN-SALES-ORDER-007: Views order quantities, source links, credit result, approvals, shipments, invoices, returns

An authorized user views order quantities, source links, credit result, approvals, shipments, invoices, returns, and remaining work.

Allocation, shipment, invoice, return, cancellation, and remaining quantities stay visible at line level.

An order can originate directly or from an accepted quote.

### REQ-FUN-SALES-ORDER-008: Closes a fully resolved order

A Sales Manager closes a fully resolved order.

An order can originate directly or from an accepted quote.

Credit evaluation and approval precede stock allocation.

### REQ-FUN-SALES-ORDER-009: Cancels an eligible order

A Sales Manager cancels an eligible order.

An order can originate directly or from an accepted quote.

Credit evaluation and approval precede stock allocation.

## REQ-FUN-ALLOCATION: Stock Allocation Operations

For Stock Allocation, allocation discovers available, non-quarantined stock for an approved order. Partial and full reservation keep line remainder.

Together, release restores availability only before shipment consumption. Concurrent demand receives a clear conflict instead of over-reserving the same stock.

### REQ-FUN-ALLOCATION-001: An authorized Sales or Warehouse user allocates available stock to an approved order line

An authorized Sales or Warehouse user allocates available stock to an approved order line.

Allocation discovers available, non-quarantined stock for an approved order.

Partial and full reservation keep line remainder.

### REQ-FUN-ALLOCATION-002: An authorized user partially allocates an order line and preserves unallocated remainder

An authorized user partially allocates an order line and preserves unallocated remainder.

Partial and full reservation keep line remainder.

Allocation discovers available, non-quarantined stock for an approved order.

### REQ-FUN-ALLOCATION-003: An authorized user releases an unconsumed allocation before shipment

An authorized user releases an unconsumed allocation before shipment.

Release restores availability only before shipment consumption.

Allocation discovers available, non-quarantined stock for an approved order.

### REQ-FUN-ALLOCATION-004: Views allocation, availability, quarantine

An authorized user views allocation, availability, quarantine, and source-order relationships.

Allocation discovers available, non-quarantined stock for an approved order.

Release restores availability only before shipment consumption.

### REQ-FUN-ALLOCATION-005: Refuses allocation when eligible available stock is insufficient or concurrently reserved

The product refuses allocation when eligible available stock is insufficient or concurrently reserved.

Allocation discovers available, non-quarantined stock for an approved order.

Concurrent demand receives a clear conflict instead of over-reserving the same stock.

## REQ-FUN-SHIPMENT: Shipment Operations

For Shipment, shipment creation selects source order remainder, allocation, warehouse, location, and tracked stock. Pick and pack are observable preparation commands.

Together, shipping is the irreversible stock and COGS posting event. Delivery and eligible cancellation are distinct later outcomes.

### REQ-FUN-SHIPMENT-001: Creates and edits a draft shipment from sales-order remainder

A Warehouse user creates and edits a draft shipment from sales-order remainder.

Shipment creation selects source order remainder, allocation, warehouse, location, and tracked stock.

Pick and pack are observable preparation commands.

### REQ-FUN-SHIPMENT-002: A Warehouse user picks the shipment

A Warehouse user picks the shipment.

Shipment creation selects source order remainder, allocation, warehouse, location, and tracked stock.

Pick and pack are observable preparation commands.

### REQ-FUN-SHIPMENT-003: A Warehouse user packs a picked shipment

A Warehouse user packs a picked shipment.

Shipment creation selects source order remainder, allocation, warehouse, location, and tracked stock.

Pick and pack are observable preparation commands.

### REQ-FUN-SHIPMENT-004: Posts the packed shipment

A Warehouse Manager ships and posts the packed shipment.

Shipment creation selects source order remainder, allocation, warehouse, location, and tracked stock.

Pick and pack are observable preparation commands.

### REQ-FUN-SHIPMENT-005: Records delivery of a shipped shipment

An authorized user records delivery of a shipped shipment.

Shipment creation selects source order remainder, allocation, warehouse, location, and tracked stock.

Delivery and eligible cancellation are distinct later outcomes.

### REQ-FUN-SHIPMENT-006: Cancels an eligible unposted shipment

A Warehouse Manager cancels an eligible unposted shipment.

Shipment creation selects source order remainder, allocation, warehouse, location, and tracked stock.

Delivery and eligible cancellation are distinct later outcomes.

### REQ-FUN-SHIPMENT-007: Views shipment source, allocation, quantity, lot or serial, stock

An authorized user views shipment source, allocation, quantity, lot or serial, stock, and COGS effects.

Shipment creation selects source order remainder, allocation, warehouse, location, and tracked stock.

Shipping is the irreversible stock and COGS posting event.

## REQ-FUN-SALES-INVOICE: Sales Invoice Operations

For Sales Invoice, invoice creation consumes order or shipment billable remainder. Draft and approval commands precede receivable posting.

Together, posting creates AR, revenue, discount, and output-tax effects. Sending, payment, overdue status, void, and credit correction keep the original invoice.

### REQ-FUN-SALES-INVOICE-001: Creates a draft invoice from an order or shipment

A Sales or Finance user creates a draft invoice from an order or shipment.

Invoice creation consumes order or shipment billable remainder.

Draft and approval commands precede receivable posting.

### REQ-FUN-SALES-INVOICE-002: Edits the draft invoice

An authorized creator edits the draft invoice.

Invoice creation consumes order or shipment billable remainder.

Draft and approval commands precede receivable posting.

### REQ-FUN-SALES-INVOICE-003: Submits the invoice for approval

An authorized user submits the invoice for approval.

Invoice creation consumes order or shipment billable remainder.

Draft and approval commands precede receivable posting.

### REQ-FUN-SALES-INVOICE-004: Changes on the invoice

An assigned approver approves, rejects, or requests changes on the invoice.

Invoice creation consumes order or shipment billable remainder.

Sending, payment, overdue status, void, and credit correction keep the original invoice.

### REQ-FUN-SALES-INVOICE-005: Posts an approved invoice

A Finance user posts an approved invoice.

Invoice creation consumes order or shipment billable remainder.

Sending, payment, overdue status, void, and credit correction keep the original invoice.

### REQ-FUN-SALES-INVOICE-006: A Sales or Finance user sends a posted invoice

A Sales or Finance user sends a posted invoice.

Invoice creation consumes order or shipment billable remainder.

Sending, payment, overdue status, void, and credit correction keep the original invoice.

### REQ-FUN-SALES-INVOICE-007: Marks an unpaid invoice overdue after its payment terms

The System principal marks an unpaid invoice overdue after its payment terms.

Sending, payment, overdue status, void, and credit correction keep the original invoice.

Invoice creation consumes order or shipment billable remainder.

### REQ-FUN-SALES-INVOICE-008: A Finance user voids an eligible invoice through a preserving correction

A Finance user voids an eligible invoice through a preserving correction.

Sending, payment, overdue status, void, and credit correction keep the original invoice.

Invoice creation consumes order or shipment billable remainder.

### REQ-FUN-SALES-INVOICE-009: Views invoice source, quantities, tax, posting, payment, credit

An authorized user views invoice source, quantities, tax, posting, payment, credit, and outstanding balance.

Sending, payment, overdue status, void, and credit correction keep the original invoice.

Invoice creation consumes order or shipment billable remainder.

## REQ-FUN-CUSTOMER-PAYMENT: Customer Payment Operations

For Customer Payment, payment entry selects customer, currency, bank or cash destination, amount, and invoice balances. Allocations can be partial and span several invoices.

Together, posting reduces AR, increases cash, and turns excess into customer credit. Bank matching and reversal keep the payment identity.

### REQ-FUN-CUSTOMER-PAYMENT-001: Creates a customer payment and allocations across one or more invoices

A Finance user creates a customer payment and allocations across one or more invoices.

Payment entry selects customer, currency, bank or cash destination, amount, and invoice balances.

Allocations can be partial and span several invoices.

### REQ-FUN-CUSTOMER-PAYMENT-002: A Finance user revises an unposted allocation

A Finance user revises an unposted allocation.

Payment entry selects customer, currency, bank or cash destination, amount, and invoice balances.

Allocations can be partial and span several invoices.

### REQ-FUN-CUSTOMER-PAYMENT-003: Posts the payment and accounting effects

A Finance user posts the payment and accounting effects.

Payment entry selects customer, currency, bank or cash destination, amount, and invoice balances.

Bank matching and reversal keep the payment identity.

### REQ-FUN-CUSTOMER-PAYMENT-004: The product converts any overpayment into customer credit

The product converts any overpayment into customer credit.

Posting reduces AR, increases cash, and turns excess into customer credit.

Payment entry selects customer, currency, bank or cash destination, amount, and invoice balances.

### REQ-FUN-CUSTOMER-PAYMENT-005: Matches the payment to a bank transaction

A Finance user matches the payment to a bank transaction.

Payment entry selects customer, currency, bank or cash destination, amount, and invoice balances.

Bank matching and reversal keep the payment identity.

### REQ-FUN-CUSTOMER-PAYMENT-006: Views invoice settlement, credit

An authorized user views invoice settlement, credit, and bank-match history.

Payment entry selects customer, currency, bank or cash destination, amount, and invoice balances.

Posting reduces AR, increases cash, and turns excess into customer credit.

### REQ-FUN-CUSTOMER-PAYMENT-007: A Finance user reverses an eligible customer payment with a reason

A Finance user reverses an eligible customer payment with a reason.

Payment entry selects customer, currency, bank or cash destination, amount, and invoice balances.

Posting reduces AR, increases cash, and turns excess into customer credit.

## REQ-FUN-SALES-RETURN: Sales Return Operations

For Sales Return, return creation selects source shipment and remaining returnable quantity. Approval and physical receipt are distinct actions.

Together, receipt decides restockability and posts inventory plus reversal or loss effects. Refund uses a linked credit memo or cash movement.

### REQ-FUN-SALES-RETURN-001: Creates and edits a draft sales return from a shipment

A Sales user creates and edits a draft sales return from a shipment.

Return creation selects source shipment and remaining returnable quantity.

Approval and physical receipt are distinct actions.

### REQ-FUN-SALES-RETURN-002: Approves the return

An assigned approver approves the return.

Return creation selects source shipment and remaining returnable quantity.

Approval and physical receipt are distinct actions.

### REQ-FUN-SALES-RETURN-003: Rejects the return

An assigned approver rejects the return.

Return creation selects source shipment and remaining returnable quantity.

Approval and physical receipt are distinct actions.

### REQ-FUN-SALES-RETURN-004: Receives an approved return and records restockable quantity

A Warehouse user receives an approved return and records restockable quantity.

Return creation selects source shipment and remaining returnable quantity.

Approval and physical receipt are distinct actions.

### REQ-FUN-SALES-RETURN-005: Posts stock restoration and reversal or loss effects

An authorized user posts stock restoration and reversal or loss effects.

Receipt decides restockability and posts inventory plus reversal or loss effects.

Return creation selects source shipment and remaining returnable quantity.

### REQ-FUN-SALES-RETURN-006: A Finance user refunds a received return through a credit memo or customer payment

A Finance user refunds a received return through a credit memo or customer payment.

Refund uses a linked credit memo or cash movement.

Return creation selects source shipment and remaining returnable quantity.

### REQ-FUN-SALES-RETURN-007: Cancels an eligible return

A Sales Manager cancels an eligible return.

Return creation selects source shipment and remaining returnable quantity.

Approval and physical receipt are distinct actions.

## REQ-FUN-CREDIT-MEMO: Credit Memo Operations

For Credit Memo, creation selects return, discount, invoice correction, or customer-credit reason. The remaining balance stays visible after partial application.

Together, applying and refunding are distinct settlement commands. The memo keeps invoice and return sources.

### REQ-FUN-CREDIT-MEMO-001: Creates a credit memo for a return, discount, invoice correction, or customer credit

A Finance user creates a credit memo for a return, discount, invoice correction, or customer credit.

Creation selects return, discount, invoice correction, or customer-credit reason.

The memo keeps invoice and return sources.

### REQ-FUN-CREDIT-MEMO-002: Applies all or part of a credit memo to one or more invoices

A Finance user applies all or part of a credit memo to one or more invoices.

Creation selects return, discount, invoice correction, or customer-credit reason.

The memo keeps invoice and return sources.

### REQ-FUN-CREDIT-MEMO-003: A Finance user refunds remaining credit through a bank or cash movement

A Finance user refunds remaining credit through a bank or cash movement.

Creation selects return, discount, invoice correction, or customer-credit reason.

The remaining balance stays visible after partial application.

### REQ-FUN-CREDIT-MEMO-004: Views memo origin, applications, refunds

An authorized user views memo origin, applications, refunds, and remaining balance.

The remaining balance stays visible after partial application.

The memo keeps invoice and return sources.

### REQ-FUN-CREDIT-MEMO-005: A Finance user voids an eligible unused credit memo

A Finance user voids an eligible unused credit memo while preserving history.

Creation selects return, discount, invoice correction, or customer-credit reason.

The memo keeps invoice and return sources.

## REQ-FUN-EMPLOYEE: Employee Operations

For Employee, employee creation links an accepted organization user to HR placement instead of creating a second credential identity. HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

Together, discovery respects visibility scope and supports organizational filters. Leave, reactivation, deactivation, and termination are distinct state commands.

### REQ-FUN-EMPLOYEE-001: Creates an employee linked to an organization member

An HR Manager creates an employee linked to an organization member.

Employee creation links an accepted organization user to HR placement instead of creating a second credential identity.

HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

### REQ-FUN-EMPLOYEE-002: Searches Employee for user searches employees

An authorized user searches employees by name, department, position, manager, cost center, employment type, status, and visibility scope.

HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

Discovery respects visibility scope and supports organizational filters.

### REQ-FUN-EMPLOYEE-003: Updates employee placement and employment information

An HR Manager updates employee placement and employment information.

Employee creation links an accepted organization user to HR placement instead of creating a second credential identity.

HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

### REQ-FUN-EMPLOYEE-004: An HR Manager places an active employee on leave

An HR Manager places an active employee on leave.

Employee creation links an accepted organization user to HR placement instead of creating a second credential identity.

HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

### REQ-FUN-EMPLOYEE-005: An HR Manager returns an on-leave employee to active status

An HR Manager returns an on-leave employee to active status.

Employee creation links an accepted organization user to HR placement instead of creating a second credential identity.

HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

### REQ-FUN-EMPLOYEE-006: Deactivates an employee

An HR Manager deactivates an employee while retaining history.

Employee creation links an accepted organization user to HR placement instead of creating a second credential identity.

HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

### REQ-FUN-EMPLOYEE-007: An HR Manager terminates an employee with a termination date

An HR Manager terminates an employee with a termination date.

Employee creation links an accepted organization user to HR placement instead of creating a second credential identity.

HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

### REQ-FUN-EMPLOYEE-008: Views their own organization placement and permitted self-service information

An Employee views their own organization placement and permitted self-service information.

Employee creation links an accepted organization user to HR placement instead of creating a second credential identity.

HR changes cover department, position, manager, cost center, employment type, dates, payroll setup, and visibility.

## REQ-FUN-DEPARTMENT: Department Operations

For Department, department creation and update stay within the currently selected organization. Parent and manager choices are explicit scoped relationships.

Together, discovery supports placement, project, approval, and reporting selection. Deactivation keeps historical dimensions.

### REQ-FUN-DEPARTMENT-001: Creates a department and optional parent relationship

An HR Manager creates a department and optional parent relationship.

Parent and manager choices are explicit scoped relationships.

Department creation and update stay within the currently selected organization.

### REQ-FUN-DEPARTMENT-002: Searches departments by name, parent, manager, cost center

An authorized user searches departments by name, parent, manager, cost center, and status.

Parent and manager choices are explicit scoped relationships.

Department creation and update stay within the currently selected organization.

### REQ-FUN-DEPARTMENT-003: Updates department identity, parent, manager

An HR Manager updates department identity, parent, manager, and cost center.

Parent and manager choices are explicit scoped relationships.

Department creation and update stay within the currently selected organization.

### REQ-FUN-DEPARTMENT-004: Deactivates or reactivates a department

An HR Manager deactivates or reactivates a department.

Department creation and update stay within the currently selected organization.

Parent and manager choices are explicit scoped relationships.

## REQ-FUN-CONTRACT: Employment Contract Operations

For Employment Contract, a contract is created for one employee and effective range. Activation automatically closes the prior active contract on the preceding day.

Together, discovery exposes chronological contract history. Past contracts cannot be edited; correction uses a new contract.

### REQ-FUN-CONTRACT-001: Creates and activates an employment contract

An HR Manager creates and activates an employment contract.

A contract is created for one employee and effective range.

Activation automatically closes the prior active contract on the preceding day.

### REQ-FUN-CONTRACT-002: The Employment Contract for automatically ends employee

The product automatically ends the employee's prior active contract the day before the replacement begins.

Activation automatically closes the prior active contract on the preceding day.

A contract is created for one employee and effective range.

### REQ-FUN-CONTRACT-003: Views immutable contract history by employee and date

An authorized HR user views immutable contract history by employee and date.

A contract is created for one employee and effective range.

Discovery exposes chronological contract history.

### REQ-FUN-CONTRACT-004: An Employment Contract for corrects future terms

An HR Manager corrects future employment terms by creating a new contract rather than editing a past one.

Past contracts cannot be edited; correction uses a new contract.

A contract is created for one employee and effective range.

## REQ-FUN-PROJECT: Project Operations

For Project, project creation connects customer, department, manager, budgets, billing, dates, and cost center. Discovery supports key, customer, department, manager, status, date, and member context.

Together, membership and manager assignment are distinct changes. Archive, completion, and cancellation keep history and stop new time where required.

### REQ-FUN-PROJECT-001: Creates a project

An authorized project administrator creates a project.

Project creation connects customer, department, manager, budgets, billing, dates, and cost center.

Discovery supports key, customer, department, manager, status, date, and member context.

### REQ-FUN-PROJECT-002: Searches projects by key, name, customer, department, manager, status, date range

An authorized user searches projects by key, name, customer, department, manager, status, date range, and cost center.

Project creation connects customer, department, manager, budgets, billing, dates, and cost center.

Discovery supports key, customer, department, manager, status, date, and member context.

### REQ-FUN-PROJECT-003: Updates an active project's business information

An authorized project administrator updates an active project's business information.

Project creation connects customer, department, manager, budgets, billing, dates, and cost center.

Discovery supports key, customer, department, manager, status, date, and member context.

### REQ-FUN-PROJECT-004: Adds a project member with role, allocation

An authorized project administrator adds a project member with role, allocation, and dates.

Project creation connects customer, department, manager, budgets, billing, dates, and cost center.

Discovery supports key, customer, department, manager, status, date, and member context.

### REQ-FUN-PROJECT-005: Removes or ends a project membership

An authorized project administrator removes or ends a project membership.

Project creation connects customer, department, manager, budgets, billing, dates, and cost center.

Membership and manager assignment are distinct changes.

### REQ-FUN-PROJECT-006: An authorized project administrator archives a project

An authorized project administrator archives a project.

Project creation connects customer, department, manager, budgets, billing, dates, and cost center.

Discovery supports key, customer, department, manager, status, date, and member context.

### REQ-FUN-PROJECT-007: Completes a project

An authorized project administrator completes a project.

Project creation connects customer, department, manager, budgets, billing, dates, and cost center.

Discovery supports key, customer, department, manager, status, date, and member context.

### REQ-FUN-PROJECT-008: Cancels a project

An authorized project administrator cancels a project.

Project creation connects customer, department, manager, budgets, billing, dates, and cost center.

Discovery supports key, customer, department, manager, status, date, and member context.

## REQ-FUN-TASK: Task Operations

For Task, task authority derives from project membership and active project state. Creation selects project and optional one-level parent.

Together, discovery supports project, assignee, status, and parent context. Status change keeps immutable transition history.

### REQ-FUN-TASK-001: Creates a task

An authorized project member creates a task.

Task authority derives from project membership and active project state.

Creation selects project and optional one-level parent.

### REQ-FUN-TASK-002: Creates a one-level subtask

An authorized project member creates a one-level subtask.

Creation selects project and optional one-level parent.

Task authority derives from project membership and active project state.

### REQ-FUN-TASK-003: Searches tasks by project, assignee, status

An authorized user searches tasks by project, assignee, status, and parent.

Discovery supports project, assignee, status, and parent context.

Creation selects project and optional one-level parent.

### REQ-FUN-TASK-004: Updates editable task information

An authorized project member updates editable task information.

Task authority derives from project membership and active project state.

Creation selects project and optional one-level parent.

### REQ-FUN-TASK-005: Changes task status and records immutable history

An authorized project member changes task status and records immutable history.

Status change keeps immutable transition history.

Task authority derives from project membership and active project state.

## REQ-FUN-TIMELOG: Timelog Operations

For Timelog, time entry requires an active project assignment and eligible project. Creation records work date, duration, task, description, billable choice, and rates.

Together, employee ownership and time-manager authority are distinct edit paths. Approved-timesheet lock blocks later change.

### REQ-FUN-TIMELOG-001: Creates a timelog on an assigned active project

An Employee creates a timelog on an assigned active project.

Time entry requires an active project assignment and eligible project.

Employee ownership and time-manager authority are distinct edit paths.

### REQ-FUN-TIMELOG-002: Edits their own unlocked timelog

The Employee edits their own unlocked timelog.

Employee ownership and time-manager authority are distinct edit paths.

Time entry requires an active project assignment and eligible project.

### REQ-FUN-TIMELOG-003: Deletes their own unlocked timelog

The Employee deletes their own unlocked timelog.

Employee ownership and time-manager authority are distinct edit paths.

Time entry requires an active project assignment and eligible project.

### REQ-FUN-TIMELOG-004: Edits another employee's unlocked timelog

An authorized time manager edits another employee's unlocked timelog.

Employee ownership and time-manager authority are distinct edit paths.

Time entry requires an active project assignment and eligible project.

### REQ-FUN-TIMELOG-005: Views timelogs by employee, week, project, task, billable flag

An authorized user views timelogs by employee, week, project, task, billable flag, and lock state.

Creation records work date, duration, task, description, billable choice, and rates.

Time entry requires an active project assignment and eligible project.

## REQ-FUN-TIMESHEET: Timesheet Operations

For Timesheet, a draft groups one employee's timelogs for one organization week. Submission enforces nonempty and employee-week uniqueness.

Together, approval and rejection are distinct decisions with lock and reason effects. Reopening keeps decision history and affects downstream eligibility.

### REQ-FUN-TIMESHEET-001: Creates or updates a draft weekly timesheet from their timelogs

An Employee creates or updates a draft weekly timesheet from their timelogs.

A draft groups one employee's timelogs for one organization week.

Submission enforces nonempty and employee-week uniqueness.

### REQ-FUN-TIMESHEET-002: Submits a nonempty timesheet

An Employee submits a nonempty timesheet.

Submission enforces nonempty and employee-week uniqueness.

A draft groups one employee's timelogs for one organization week.

### REQ-FUN-TIMESHEET-003: Approves a submitted timesheet and locks its timelogs

An assigned approver approves a submitted timesheet and locks its timelogs.

A draft groups one employee's timelogs for one organization week.

Submission enforces nonempty and employee-week uniqueness.

### REQ-FUN-TIMESHEET-004: Rejects a submitted timesheet with a reason

An assigned approver rejects a submitted timesheet with a reason.

Approval and rejection are distinct decisions with lock and reason effects.

A draft groups one employee's timelogs for one organization week.

### REQ-FUN-TIMESHEET-005: Reopens an approved or rejected timesheet

An authorized time manager reopens an approved or rejected timesheet.

A draft groups one employee's timelogs for one organization week.

Submission enforces nonempty and employee-week uniqueness.

### REQ-FUN-TIMESHEET-006: Views timesheet status by employee, week, project

An authorized user views timesheet status by employee, week, project, and approval state.

A draft groups one employee's timelogs for one organization week.

Submission enforces nonempty and employee-week uniqueness.

### REQ-FUN-TIMESHEET-007: Imports approved time for hourly employees

Payroll imports approved time for hourly employees.

A draft groups one employee's timelogs for one organization week.

Submission enforces nonempty and employee-week uniqueness.

### REQ-FUN-TIMESHEET-008: Imports approved billable time

Customer billing imports approved billable time.

A draft groups one employee's timelogs for one organization week.

Submission enforces nonempty and employee-week uniqueness.

## REQ-FUN-PAYROLL-CONFIG Payroll Configuration Operations

Payroll configuration belongs to one employee in one organization and carries pay basis, tax, bank, benefit, cost-center, and ledger choices. HR administration may change future-effective settings without rewriting a prior payroll calculation or posting. Discovery remains organization-scoped and withholds sensitive detail unless the requesting payroll role is entitled to see it.

### REQ-FUN-PAYROLL-CONFIG-001 Maintain an employee's payroll configuration

An HR Manager creates or updates an employee's payroll configuration.

- The configuration names pay schedule, salary or hourly rate, tax profile, bank account, benefits enrollment, payroll cost center, and default ledger accounts.
- A change applies to future calculations and does not rewrite a calculated, posted, paid, or reversed payroll run.

### REQ-FUN-PAYROLL-CONFIG-002 Search employee payroll configurations

An authorized payroll user searches employee payroll configurations within the active organization.

- Results are limited to the selected organization and employees visible to the requesting payroll user.
- Search supports employee identity, pay schedule, pay basis, configuration status, and effective date, and returns the sensitive fields only when the user's payroll permission allows them.
## REQ-FUN-PAYROLL-RUN: Payroll Run Operations

For Payroll Run, run creation selects schedule and period before employee calculation. Approved time import and calculation keep auditable details.

Together, approval, posting, payment, and payslip publication are distinct commands. Reversal and adjustment correct immutable posted payroll.

### REQ-FUN-PAYROLL-RUN-001: Creates and edits a draft payroll run

An HR Manager creates and edits a draft payroll run.

Reversal and adjustment correct immutable posted payroll.

Run creation selects schedule and period before employee calculation.

### REQ-FUN-PAYROLL-RUN-002: Imports approved timesheets for eligible hourly employees

An HR Manager imports approved timesheets for eligible hourly employees.

Approved time import and calculation keep auditable details.

Run creation selects schedule and period before employee calculation.

### REQ-FUN-PAYROLL-RUN-003: Calculates employee payroll lines and preserves calculation details

An HR Manager calculates employee payroll lines and preserves calculation details.

Run creation selects schedule and period before employee calculation.

Approved time import and calculation keep auditable details.

### REQ-FUN-PAYROLL-RUN-004: Submits a calculated run for approval

An HR Manager submits a calculated run for approval.

Approval, posting, payment, and payslip publication are distinct commands.

Run creation selects schedule and period before employee calculation.

### REQ-FUN-PAYROLL-RUN-005: Changes on the run

An assigned approver approves, rejects, or requests changes on the run.

Run creation selects schedule and period before employee calculation.

Approved time import and calculation keep auditable details.

### REQ-FUN-PAYROLL-RUN-006: Posts an approved payroll run

A Finance Manager posts an approved payroll run.

Approved time import and calculation keep auditable details.

Reversal and adjustment correct immutable posted payroll.

### REQ-FUN-PAYROLL-RUN-007: Pays a posted payroll run from a bank account

A Finance Manager pays a posted payroll run from a bank account.

Reversal and adjustment correct immutable posted payroll.

Run creation selects schedule and period before employee calculation.

### REQ-FUN-PAYROLL-RUN-008: Publishes employee payslips

An HR Manager publishes employee payslips.

Run creation selects schedule and period before employee calculation.

Approved time import and calculation keep auditable details.

### REQ-FUN-PAYROLL-RUN-009: A Finance Manager reverses a posted payroll run

A Finance Manager reverses a posted payroll run.

Reversal and adjustment correct immutable posted payroll.

Run creation selects schedule and period before employee calculation.

### REQ-FUN-PAYROLL-RUN-010: Creates an adjustment payroll run linked to the corrected run

An HR Manager creates an adjustment payroll run linked to the corrected run.

Reversal and adjustment correct immutable posted payroll.

Run creation selects schedule and period before employee calculation.

### REQ-FUN-PAYROLL-RUN-011: Views payroll-run status, employee totals, liabilities, posting

An authorized user views payroll-run status, employee totals, liabilities, posting, and payment history.

Approval, posting, payment, and payslip publication are distinct commands.

Run creation selects schedule and period before employee calculation.

## REQ-FUN-PAYSLIP: Payslip Operations

For Payslip, payslip publication follows an approved and posted payroll line. An employee can view only the payslips that belong to them.

Together, payroll administrators can inspect payslips within payroll authority. A later adjustment appears as linked correction instead of rewriting the original.

### REQ-FUN-PAYSLIP-001: Lists their own published payslips

An Employee lists their own published payslips.

An employee can view only the payslips that belong to them.

Payroll administrators can inspect payslips within payroll authority.

### REQ-FUN-PAYSLIP-002: Views one of their own payslips with earnings, deductions, taxes, benefits

An Employee views one of their own payslips with earnings, deductions, taxes, benefits, and net pay.

An employee can view only the payslips that belong to them.

Payroll administrators can inspect payslips within payroll authority.

### REQ-FUN-PAYSLIP-003: Views a payslip for payroll support

An authorized payroll administrator views a payslip for payroll support.

Payslip publication follows an approved and posted payroll line.

Payroll administrators can inspect payslips within payroll authority.

### REQ-FUN-PAYSLIP-004: A later payroll adjustment produces linked corrected payslip information

A later payroll adjustment produces linked corrected payslip information while preserving the original.

A later adjustment appears as linked correction instead of rewriting the original.

Payslip publication follows an approved and posted payroll line.

## REQ-FUN-BUDGET: Budget Operations

For Budget, budget creation selects fiscal year, currency, and business dimensions. Draft editing ends when approval activates the version.

Together, commitment and actual consumption are visible separately. Organization policy turns a check into warning or refusal.

### REQ-FUN-BUDGET-001: Creates and edits a draft budget and lines

An authorized budget manager creates and edits a draft budget and lines.

Budget creation selects fiscal year, currency, and business dimensions.

Draft editing ends when approval activates the version.

### REQ-FUN-BUDGET-002: Submits a budget for approval

An authorized budget manager submits a budget for approval.

Budget creation selects fiscal year, currency, and business dimensions.

Draft editing ends when approval activates the version.

### REQ-FUN-BUDGET-003: Approves the budget and activates the version

An assigned approver approves the budget and activates the version.

Draft editing ends when approval activates the version.

Budget creation selects fiscal year, currency, and business dimensions.

### REQ-FUN-BUDGET-004: Rejects or requests changes on the budget

An assigned approver rejects or requests changes on the budget.

Budget creation selects fiscal year, currency, and business dimensions.

Draft editing ends when approval activates the version.

### REQ-FUN-BUDGET-005: Creates a revision with a reason and linked approval history

An authorized budget manager creates a revision with a reason and linked approval history.

Budget creation selects fiscal year, currency, and business dimensions.

Draft editing ends when approval activates the version.

### REQ-FUN-BUDGET-006: An authorized budget manager archives an eligible budget

An authorized budget manager archives an eligible budget.

Budget creation selects fiscal year, currency, and business dimensions.

Draft editing ends when approval activates the version.

### REQ-FUN-BUDGET-007: Views planned, committed, actual

An authorized user views planned, committed, actual, and remaining amounts by budget dimensions.

Budget creation selects fiscal year, currency, and business dimensions.

Commitment and actual consumption are visible separately.

### REQ-FUN-BUDGET-008: Receives warning or hard-block behavior from organization policy

A source transaction checks available budget and receives warning or hard-block behavior from organization policy.

Organization policy turns a check into warning or refusal.

Budget creation selects fiscal year, currency, and business dimensions.

## REQ-FUN-COST-CENTER: Cost Center Operations

For Cost Center, centers stay organization-scoped and independently managed from profit centers. Creation and change cover code, name, manager, parent, status, and description.

Together, discovery supports dimensional selection and hierarchy browsing. Deactivation keeps historical allocation and journal relationships.

### REQ-FUN-COST-CENTER-001: Creates a cost center and optional parent

A Finance Manager creates a cost center and optional parent.

Creation and change cover code, name, manager, parent, status, and description.

Centers stay organization-scoped and independently managed from profit centers.

### REQ-FUN-COST-CENTER-002: Searches cost centers by code, name, manager, parent

An authorized user searches cost centers by code, name, manager, parent, and status.

Creation and change cover code, name, manager, parent, status, and description.

Centers stay organization-scoped and independently managed from profit centers.

### REQ-FUN-COST-CENTER-003: Updates a cost center

A Finance Manager updates a cost center.

Creation and change cover code, name, manager, parent, status, and description.

Centers stay organization-scoped and independently managed from profit centers.

### REQ-FUN-COST-CENTER-004: Deactivates or reactivates a cost center

A Finance Manager deactivates or reactivates a cost center.

Creation and change cover code, name, manager, parent, status, and description.

Centers stay organization-scoped and independently managed from profit centers.

## REQ-FUN-PROFIT-CENTER: Profit Center Operations

For Profit Center, profit centers stay organization-scoped and independently managed from cost centers. Creation and change cover code, name, manager, parent, status, and description.

Together, discovery supports budget and journal dimension selection. Deactivation keeps historical reporting.

### REQ-FUN-PROFIT-CENTER-001: Creates a profit center and optional parent

A Finance Manager creates a profit center and optional parent.

Creation and change cover code, name, manager, parent, status, and description.

Profit centers stay organization-scoped and independently managed from cost centers.

### REQ-FUN-PROFIT-CENTER-002: Searches profit centers by code, name, manager, parent

An authorized user searches profit centers by code, name, manager, parent, and status.

Creation and change cover code, name, manager, parent, status, and description.

Profit centers stay organization-scoped and independently managed from cost centers.

### REQ-FUN-PROFIT-CENTER-003: Updates a profit center

A Finance Manager updates a profit center.

Profit centers stay organization-scoped and independently managed from cost centers.

Creation and change cover code, name, manager, parent, status, and description.

### REQ-FUN-PROFIT-CENTER-004: Deactivates or reactivates a profit center

A Finance Manager deactivates or reactivates a profit center.

Profit centers stay organization-scoped and independently managed from cost centers.

Creation and change cover code, name, manager, parent, status, and description.

## REQ-FUN-ALLOCATION-RULE: Allocation Rule Operations

For Allocation Rule, rule creation selects source cost, destinations, basis, and parameters. Execution calculates shares from current input measures and keeps them.

Together, posting is a distinct command that creates a journal entry. Discovery shows rule, execution, calculation, and posting history.

### REQ-FUN-ALLOCATION-RULE-001: Creates or updates a draft allocation rule

A Finance Manager creates or updates a draft allocation rule.

Rule creation selects source cost, destinations, basis, and parameters.

Posting is a distinct command that creates a journal entry.

### REQ-FUN-ALLOCATION-RULE-002: Searches allocation rules by source, destination, basis, status

An authorized user searches allocation rules by source, destination, basis, status, and effective date.

Rule creation selects source cost, destinations, basis, and parameters.

Execution calculates shares from current input measures and keeps them.

### REQ-FUN-ALLOCATION-RULE-003: Executes an allocation calculation and reviews the distribution

A Finance Manager executes an allocation calculation and reviews the distribution.

Discovery shows rule, execution, calculation, and posting history.

Rule creation selects source cost, destinations, basis, and parameters.

### REQ-FUN-ALLOCATION-RULE-004: Posts an approved allocation and its journal entry

A Finance Manager posts an approved allocation and its journal entry.

Posting is a distinct command that creates a journal entry.

Rule creation selects source cost, destinations, basis, and parameters.

### REQ-FUN-ALLOCATION-RULE-005: Views preserved allocation inputs, shares, amounts

An authorized user views preserved allocation inputs, shares, amounts, and posting link.

Execution calculates shares from current input measures and keeps them.

Posting is a distinct command that creates a journal entry.

### REQ-FUN-ALLOCATION-RULE-006: Deactivates an allocation rule

A Finance Manager deactivates an allocation rule.

Rule creation selects source cost, destinations, basis, and parameters.

Discovery shows rule, execution, calculation, and posting history.

## REQ-FUN-ASSET-JOURNEY: Acquire-to-Retire Asset Operations

For Acquire-to-Retire Fixed Asset, the journey begins from a vendor bill or authorized manual acquisition and keeps the source. Capitalization approval and activation are distinct from later period depreciation.

Together, transfer, impairment, disposal, and retirement are independently recorded events. Every posted value effect stays immutable and source-linked.

### REQ-FUN-ASSET-JOURNEY-001: Creates a draft fixed asset from a vendor bill

A Finance user creates a draft fixed asset from a vendor bill.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

Capitalization approval and activation are distinct from later period depreciation.

### REQ-FUN-ASSET-JOURNEY-002: Creates a draft asset from a manual acquisition

An authorized Finance user creates a draft asset from a manual acquisition.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

Capitalization approval and activation are distinct from later period depreciation.

### REQ-FUN-ASSET-JOURNEY-003: Submits threshold-aware capitalization for approval

A Finance user submits threshold-aware capitalization for approval.

Capitalization approval and activation are distinct from later period depreciation.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

### REQ-FUN-ASSET-JOURNEY-004: Approves or rejects asset capitalization

An assigned approver approves or rejects asset capitalization.

Capitalization approval and activation are distinct from later period depreciation.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

### REQ-FUN-ASSET-JOURNEY-005: A Finance user activates an approved asset

A Finance user activates an approved asset.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

Capitalization approval and activation are distinct from later period depreciation.

### REQ-FUN-ASSET-JOURNEY-006: Generates a fiscal-period depreciation schedule

The System principal or Finance user generates a fiscal-period depreciation schedule.

Capitalization approval and activation are distinct from later period depreciation.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

### REQ-FUN-ASSET-JOURNEY-007: Runs and posts depreciation for an eligible period

A Finance user runs and posts depreciation for an eligible period.

Capitalization approval and activation are distinct from later period depreciation.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

### REQ-FUN-ASSET-JOURNEY-008: An authorized asset user transfers custodian and location with an audit event

An authorized asset user transfers custodian and location with an audit event.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

Capitalization approval and activation are distinct from later period depreciation.

### REQ-FUN-ASSET-JOURNEY-009: Posts an asset impairment

A Finance Manager posts an asset impairment.

Transfer, impairment, disposal, and retirement are independently recorded events.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

### REQ-FUN-ASSET-JOURNEY-010: Posts gain or loss

A Finance Manager disposes an asset by sale, scrap, donation, or loss and posts gain or loss.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

Capitalization approval and activation are distinct from later period depreciation.

### REQ-FUN-ASSET-JOURNEY-011: A Finance Manager retires an eligible asset

A Finance Manager retires an eligible asset.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

Capitalization approval and activation are distinct from later period depreciation.

### REQ-FUN-ASSET-JOURNEY-012: Views asset book value, accumulated depreciation, event history, journals

An authorized user views asset book value, accumulated depreciation, event history, journals, and audit history.

The journey begins from a vendor bill or authorized manual acquisition and keeps the source.

Capitalization approval and activation are distinct from later period depreciation.

## REQ-FUN-BOM: Bill of Materials Operations

For Bill of Materials, bOM work stays scoped to one finished item and organization. Draft editing covers components, quantities, scrap, units, warehouses, and required operations.

Together, activation makes a version selectable by production. Changing active content creates a new version and keeps prior use.

### REQ-FUN-BOM-001: Creates and edits a draft BOM version

A Production Manager creates and edits a draft BOM version.

Activation makes a version selectable by production.

Changing active content creates a new version and keeps prior use.

### REQ-FUN-BOM-002: Searches BOMs by finished item, version, status

An authorized user searches BOMs by finished item, version, status, and effective date.

BOM work stays scoped to one finished item and organization.

Activation makes a version selectable by production.

### REQ-FUN-BOM-003: A Production Manager activates a draft BOM version

A Production Manager activates a draft BOM version.

Activation makes a version selectable by production.

Draft editing covers components, quantities, scrap, units, warehouses, and required operations.

### REQ-FUN-BOM-004: Creates a new version from an active BOM

A Production Manager creates a new version from an active BOM.

Changing active content creates a new version and keeps prior use.

Activation makes a version selectable by production.

### REQ-FUN-BOM-005: A Production Manager inactivates or supersedes an eligible BOM version

A Production Manager inactivates or supersedes an eligible BOM version.

Activation makes a version selectable by production.

Changing active content creates a new version and keeps prior use.

## REQ-FUN-ROUTING: Routing Operations

For Routing, routing work stays scoped to one finished item and organization. Draft editing covers ordered operations, work centers, times, labor grades, machines, rates, and instructions.

Together, activation makes a version selectable by production. Changing active content creates a new version and keeps prior use.

### REQ-FUN-ROUTING-001: Creates and edits a draft routing version and operations

A Production Manager creates and edits a draft routing version and operations.

Draft editing covers ordered operations, work centers, times, labor grades, machines, rates, and instructions.

Activation makes a version selectable by production.

### REQ-FUN-ROUTING-002: Searches routings by finished item, version, status

An authorized user searches routings by finished item, version, status, and effective date.

Routing work stays scoped to one finished item and organization.

Activation makes a version selectable by production.

### REQ-FUN-ROUTING-003: A Production Manager activates a draft routing version

A Production Manager activates a draft routing version.

Activation makes a version selectable by production.

Routing work stays scoped to one finished item and organization.

### REQ-FUN-ROUTING-004: Creates a new version from an active routing

A Production Manager creates a new version from an active routing.

Changing active content creates a new version and keeps prior use.

Activation makes a version selectable by production.

### REQ-FUN-ROUTING-005: A Production Manager inactivates an eligible routing version

A Production Manager inactivates an eligible routing version.

Activation makes a version selectable by production.

Routing work stays scoped to one finished item and organization.

## REQ-FUN-WORK-CENTER: Work Center Operations

For Work Center, work centers stay organization-scoped and linked to warehouse and cost center. Creation and revision cover capacity calendar and labor and machine rates.

Together, discovery supports routing, scheduling, and utilization context. Deactivation blocks new scheduling while preserving production history.

### REQ-FUN-WORK-CENTER-001: Creates a work center

A Production Manager creates a work center.

Work centers stay organization-scoped and linked to warehouse and cost center.

Deactivation blocks new scheduling while preserving production history.

### REQ-FUN-WORK-CENTER-002: Searches work centers by code, warehouse, status, cost center

An authorized user searches work centers by code, warehouse, status, cost center, and capacity.

Work centers stay organization-scoped and linked to warehouse and cost center.

Creation and revision cover capacity calendar and labor and machine rates.

### REQ-FUN-WORK-CENTER-003: Updates capacity calendar, rates, warehouse, or cost center

A Production Manager updates capacity calendar, rates, warehouse, or cost center.

Work centers stay organization-scoped and linked to warehouse and cost center.

Creation and revision cover capacity calendar and labor and machine rates.

### REQ-FUN-WORK-CENTER-004: Deactivates or reactivates a work center

A Production Manager deactivates or reactivates a work center.

Work centers stay organization-scoped and linked to warehouse and cost center.

Deactivation blocks new scheduling while preserving production history.

## REQ-FUN-MACHINE: Machine Operations

For Machine, machines belong to one work center and can link to maintenance equipment. Creation and revision cover capacity and status.

Together, discovery supports routing, scheduling, maintenance, and utilization. Out-of-service or retired machines cannot be scheduled for new work.

### REQ-FUN-MACHINE-001: Creates a machine in a work center

A Production Manager creates a machine in a work center.

Machines belong to one work center and can link to maintenance equipment.

Out-of-service or retired machines cannot be scheduled for new work.

### REQ-FUN-MACHINE-002: Searches machines by work center, status, maintenance status

An authorized user searches machines by work center, status, maintenance status, and capacity.

Machines belong to one work center and can link to maintenance equipment.

Creation and revision cover capacity and status.

### REQ-FUN-MACHINE-003: Updates machine capacity and operational status

A Production Manager updates machine capacity and operational status.

Creation and revision cover capacity and status.

Machines belong to one work center and can link to maintenance equipment.

### REQ-FUN-MACHINE-004: Links a machine to its maintenance equipment record

A Production Manager links a machine to its maintenance equipment record.

Machines belong to one work center and can link to maintenance equipment.

Discovery supports routing, scheduling, maintenance, and utilization.

### REQ-FUN-MACHINE-005: A Production Manager retires an eligible machine

A Production Manager retires an eligible machine while history remains visible.

Machines belong to one work center and can link to maintenance equipment.

Creation and revision cover capacity and status.

## REQ-FUN-MRP MRP Run Operations

An MRP run is one organization-scoped evaluation of current demand, supply, safety stock, and open production. A Production Manager may start it, and the organization System principal may start the same evaluation on schedule. Every run records attribution and its input snapshot; the recommendations it produces are separate records with their own actions.

### REQ-FUN-MRP-001 Run material requirements planning manually

A Production Manager runs MRP from current sales, forecast, purchase, stock, safety-stock, and production inputs.

- The run evaluates sales orders, forecasts, purchase documents, stock on hand, safety stock, and production orders effective for its organization snapshot.
- The result records the initiating Production Manager, run time, planning inputs, and organization so later recommendations are explainable.

### REQ-FUN-MRP-002 Run material requirements planning on schedule

The organization System principal runs MRP on schedule.

- The System principal uses the same organization scope and planning inputs as a manual run.
- The run records System attribution and remains subject to tenant isolation, audit, and immutable run evidence.
## REQ-FUN-PRODUCTION-ORDER: Production Order Operations

For Production Order, order creation selects exact BOM and routing versions plus source demand, warehouse, dates, quantities, and costs. Release, start, consumption, labor, output, quality, completion, and close are distinct commands.

Together, partial completion keeps remaining production and component requirements. Closure refuses unresolved operational or cost evidence and posts manufacturing variance.

### REQ-FUN-PRODUCTION-ORDER-001: Creates and edits a draft production order

A Production Manager creates and edits a draft production order.

Order creation selects exact BOM and routing versions plus source demand, warehouse, dates, quantities, and costs.

Partial completion keeps remaining production and component requirements.

### REQ-FUN-PRODUCTION-ORDER-002: A Production Manager releases an order and reserves components

A Production Manager releases an order and reserves components.

Order creation selects exact BOM and routing versions plus source demand, warehouse, dates, quantities, and costs.

Partial completion keeps remaining production and component requirements.

### REQ-FUN-PRODUCTION-ORDER-003: Starts a released order and posts initial component consumption

An authorized production user starts a released order and posts initial component consumption.

Partial completion keeps remaining production and component requirements.

Order creation selects exact BOM and routing versions plus source demand, warehouse, dates, quantities, and costs.

### REQ-FUN-PRODUCTION-ORDER-004: Records additional component consumption or scrap

An authorized production user records additional component consumption or scrap.

Partial completion keeps remaining production and component requirements.

Release, start, consumption, labor, output, quality, completion, and close are distinct commands.

### REQ-FUN-PRODUCTION-ORDER-005: Reports labor, machine time

An authorized production user reports labor, machine time, and overhead.

Release, start, consumption, labor, output, quality, completion, and close are distinct commands.

Partial completion keeps remaining production and component requirements.

### REQ-FUN-PRODUCTION-ORDER-006: Completes finished goods in part or whole and posts output movements

An authorized production user completes finished goods in part or whole and posts output movements.

Release, start, consumption, labor, output, quality, completion, and close are distinct commands.

Partial completion keeps remaining production and component requirements.

### REQ-FUN-PRODUCTION-ORDER-007: An assigned quality user resolves required production inspections

An assigned quality user resolves required production inspections.

Release, start, consumption, labor, output, quality, completion, and close are distinct commands.

Partial completion keeps remaining production and component requirements.

### REQ-FUN-PRODUCTION-ORDER-008: Submits completed production for closure approval

A Production Manager submits completed production for closure approval.

Partial completion keeps remaining production and component requirements.

Closure refuses unresolved operational or cost evidence and posts manufacturing variance.

### REQ-FUN-PRODUCTION-ORDER-009: Approves or rejects production closure

An assigned approver approves or rejects production closure.

Partial completion keeps remaining production and component requirements.

Closure refuses unresolved operational or cost evidence and posts manufacturing variance.

### REQ-FUN-PRODUCTION-ORDER-010: Closes an approved resolved order and posts manufacturing variance

A Production Manager closes an approved resolved order and posts manufacturing variance.

Closure refuses unresolved operational or cost evidence and posts manufacturing variance.

Order creation selects exact BOM and routing versions plus source demand, warehouse, dates, quantities, and costs.

### REQ-FUN-PRODUCTION-ORDER-011: Cancels an eligible order

A Production Manager cancels an eligible order.

Order creation selects exact BOM and routing versions plus source demand, warehouse, dates, quantities, and costs.

Partial completion keeps remaining production and component requirements.

### REQ-FUN-PRODUCTION-ORDER-012: Views planned and actual material, labor, machine, overhead, scrap, output, quality, variance

An authorized user views planned and actual material, labor, machine, overhead, scrap, output, quality, variance, and status.

Release, start, consumption, labor, output, quality, completion, and close are distinct commands.

Closure refuses unresolved operational or cost evidence and posts manufacturing variance.

## REQ-FUN-INSPECTION-PLAN: Inspection Plan Operations

For Inspection Plan, plans stay organization-scoped by item and inspection type. Creation and revision cover sample rules and test characteristics.

Together, discovery supports receipt, production, and return generation. Deactivation stops new generation while preserving completed inspection evidence.

### REQ-FUN-INSPECTION-PLAN-001: Creates an inspection plan

An authorized quality manager creates an inspection plan.

Plans stay organization-scoped by item and inspection type.

Deactivation stops new generation while preserving completed inspection evidence.

### REQ-FUN-INSPECTION-PLAN-002: Updates sample rules and test characteristics

An authorized quality manager updates sample rules and test characteristics.

Creation and revision cover sample rules and test characteristics.

Plans stay organization-scoped by item and inspection type.

### REQ-FUN-INSPECTION-PLAN-003: Searches plans by item, inspection type, status

An authorized user searches plans by item, inspection type, status, and effective date.

Plans stay organization-scoped by item and inspection type.

Deactivation stops new generation while preserving completed inspection evidence.

### REQ-FUN-INSPECTION-PLAN-004: Deactivates an inspection plan

An authorized quality manager deactivates an inspection plan.

Plans stay organization-scoped by item and inspection type.

Deactivation stops new generation while preserving completed inspection evidence.

## REQ-FUN-INSPECTION: Inspection Order Operations

For Inspection Order, order generation selects a source receipt, production event, or sales return and the applicable plan. Start and result recording are distinct from outcome decision.

Together, pass, fail, partial acceptance, and waiver affect stock and downstream work differently. Approval freezes results; correction requires new inspection or disposition evidence.

### REQ-FUN-INSPECTION-001: Generates Inspection Order for generates eligible purchase

The product generates an inspection order from an eligible purchase receipt, production operation, production completion, or sales return.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

Approval freezes results; correction requires new inspection or disposition evidence.

### REQ-FUN-INSPECTION-002: Starts a pending inspection

A quality user starts a pending inspection.

Approval freezes results; correction requires new inspection or disposition evidence.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

### REQ-FUN-INSPECTION-003: Records characteristic results

A quality user records characteristic results.

Approval freezes results; correction requires new inspection or disposition evidence.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

### REQ-FUN-INSPECTION-004: Marks the inspection passed

A quality user marks the inspection passed.

Approval freezes results; correction requires new inspection or disposition evidence.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

### REQ-FUN-INSPECTION-005: Marks the inspection failed

A quality user marks the inspection failed.

Approval freezes results; correction requires new inspection or disposition evidence.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

### REQ-FUN-INSPECTION-006: Accepts inspected quantity

A quality user partially accepts inspected quantity.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

Start and result recording are distinct from outcome decision.

### REQ-FUN-INSPECTION-007: An authorized quality manager waives an inspection with a reason

An authorized quality manager waives an inspection with a reason.

Approval freezes results; correction requires new inspection or disposition evidence.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

### REQ-FUN-INSPECTION-008: An assigned approver finalizes the quality result

An assigned approver finalizes the quality result.

Start and result recording are distinct from outcome decision.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

### REQ-FUN-INSPECTION-009: Views immutable inspection source, sample, characteristics, result, quarantine

An authorized user views immutable inspection source, sample, characteristics, result, quarantine, and disposition links.

Approval freezes results; correction requires new inspection or disposition evidence.

Order generation selects a source receipt, production event, or sales return and the applicable plan.

## REQ-FUN-QUARANTINE Quality Disposition Operations

A quality disposition is the decision and execution record for inspected stock already under a hold. Creating the proposal, approving a material decision, rejecting that proposal, and carrying out the selected outcome are distinct actions. Accept, reject, rework, return, scrap, and use-as-is retain different movement, availability, procurement, and accounting consequences, all linked back through inspection and quarantine.

### REQ-FUN-QUARANTINE-003 Record a quality disposition decision

A quality user creates a disposition decision.

- The decision identifies inspection, item, warehouse, location, lot or serial, affected quantity, selected outcome, reason, and supporting results.
- A decision above the organization threshold remains non-executable until its approval completes.

### REQ-FUN-QUARANTINE-001 Approve a material disposition

An assigned approver approves a threshold disposition.

- Approval records the approver, time, threshold context, and immutable decision details.
- The approved disposition becomes eligible for exactly its selected execution action.

### REQ-FUN-QUARANTINE-002 Reject a material disposition

An assigned approver rejects a threshold disposition.

- Rejection records the approver, time, and reason in approval history.
- The stock remains quarantined and the proposed disposition creates no movement or accounting effect.

### REQ-FUN-QUARANTINE-005 Accept and release inspected stock

An authorized user accepts and releases stock.

- Release posts a quality-release movement for the accepted quantity and ends its quarantine hold.
- The quantity becomes available subject to ordinary reservation, lot, serial, and warehouse rules.

### REQ-FUN-QUARANTINE-006 Reject inspected stock without release

An authorized user rejects inspected stock without release.

- The rejected quantity remains unavailable and traceable to the failed inspection.
- A later rework, return, scrap, or approved use-as-is decision is required to end the hold.

### REQ-FUN-QUARANTINE-007 Send inspected stock to rework

An authorized user sends stock to rework.

- Rework creates a source-linked rework instruction or production work and retains the stock as unavailable.
- Completion requires the applicable follow-up inspection before release.

### REQ-FUN-QUARANTINE-008 Return inspected stock to the vendor

An authorized user returns stock to the vendor.

- The outcome creates a source-linked purchase return and outbound stock movement for the approved quantity.
- Vendor credit or bill adjustment remains linked but is handled by the procurement settlement workflow.

### REQ-FUN-QUARANTINE-009 Scrap inspected stock

An authorized user scraps stock.

- Scrap posts an immutable scrap movement and the applicable loss accounting from the disposition source.
- The serial or lot history retains the destruction outcome and actor.

### REQ-FUN-QUARANTINE-010 Approve use-as-is and release stock

An authorized user approves use-as-is and releases stock.

- Use-as-is records the approval and posts a quality-release movement for the approved quantity.
- The inspection, waiver rationale, risk, and approver remain immutable after release.
## REQ-FUN-EQUIPMENT: Equipment Operations

For Equipment, equipment creation distinguishes machines, vehicles, tools, and facilities. Discovery supports type, status, location, custodian, criticality, and due maintenance.

Together, status transitions reflect actual availability. Retirement keeps work, parts, labor, downtime, and cost history.

### REQ-FUN-EQUIPMENT-001: Creates an equipment record

An authorized maintenance user creates an equipment record.

Equipment creation distinguishes machines, vehicles, tools, and facilities.

Discovery supports type, status, location, custodian, criticality, and due maintenance.

### REQ-FUN-EQUIPMENT-002: Searches equipment by type, status, location, custodian, criticality

An authorized user searches equipment by type, status, location, custodian, criticality, and maintenance due date.

Discovery supports type, status, location, custodian, criticality, and due maintenance.

Equipment creation distinguishes machines, vehicles, tools, and facilities.

### REQ-FUN-EQUIPMENT-003: Updates equipment identity and assignment

An authorized maintenance user updates equipment identity and assignment.

Equipment creation distinguishes machines, vehicles, tools, and facilities.

Discovery supports type, status, location, custodian, criticality, and due maintenance.

### REQ-FUN-EQUIPMENT-004: An authorized maintenance user places equipment under maintenance

An authorized maintenance user places equipment under maintenance.

Equipment creation distinguishes machines, vehicles, tools, and facilities.

Discovery supports type, status, location, custodian, criticality, and due maintenance.

### REQ-FUN-EQUIPMENT-005: Marks equipment out of service

An authorized maintenance user marks equipment out of service.

Equipment creation distinguishes machines, vehicles, tools, and facilities.

Discovery supports type, status, location, custodian, criticality, and due maintenance.

### REQ-FUN-EQUIPMENT-006: An authorized maintenance user restores eligible equipment to active status

An authorized maintenance user restores eligible equipment to active status.

Discovery supports type, status, location, custodian, criticality, and due maintenance.

Equipment creation distinguishes machines, vehicles, tools, and facilities.

### REQ-FUN-EQUIPMENT-007: An authorized maintenance manager retires equipment

An authorized maintenance manager retires equipment.

Equipment creation distinguishes machines, vehicles, tools, and facilities.

Discovery supports type, status, location, custodian, criticality, and due maintenance.

## REQ-FUN-MAINTENANCE-PLAN: Maintenance Plan Operations

For Maintenance Plan, plan creation selects equipment, frequency, checklist, parts, labor skills, and next due date. Discovery surfaces due and overdue preventive work.

Together, revision applies to future work while issued orders retain their plan version. The System principal can generate due work orders.

### REQ-FUN-MAINTENANCE-PLAN-001: Creates a maintenance plan

An authorized maintenance manager creates a maintenance plan.

Plan creation selects equipment, frequency, checklist, parts, labor skills, and next due date.

Revision applies to future work while issued orders retain their plan version.

### REQ-FUN-MAINTENANCE-PLAN-002: Updates a plan's frequency, checklist, required parts, skills, or next due date

An authorized maintenance manager updates a plan's frequency, checklist, required parts, skills, or next due date.

Plan creation selects equipment, frequency, checklist, parts, labor skills, and next due date.

Revision applies to future work while issued orders retain their plan version.

### REQ-FUN-MAINTENANCE-PLAN-003: Searches plans by equipment, status

An authorized user searches plans by equipment, status, and next due date.

Plan creation selects equipment, frequency, checklist, parts, labor skills, and next due date.

Discovery surfaces due and overdue preventive work.

### REQ-FUN-MAINTENANCE-PLAN-004: Generates a maintenance work order when a plan becomes due

The System principal generates a maintenance work order when a plan becomes due.

The System principal can generate due work orders.

Revision applies to future work while issued orders retain their plan version.

### REQ-FUN-MAINTENANCE-PLAN-005: Deactivates a plan

An authorized maintenance manager deactivates a plan.

Plan creation selects equipment, frequency, checklist, parts, labor skills, and next due date.

Revision applies to future work while issued orders retain their plan version.

## REQ-FUN-MAINTENANCE-ORDER: Maintenance Work Order Operations

For Maintenance Work Order, work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center. Scheduling, starting, parts, labor, completion, and cancellation are independent commands.

Together, parts create stock movements and labor can create cost-center expense. Completion updates equipment and next due date.

### REQ-FUN-MAINTENANCE-ORDER-001: Creates and edits a draft work order

An authorized maintenance user creates and edits a draft work order.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Scheduling, starting, parts, labor, completion, and cancellation are independent commands.

### REQ-FUN-MAINTENANCE-ORDER-002: Assigns a work order

An authorized maintenance user schedules and assigns a work order.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Scheduling, starting, parts, labor, completion, and cancellation are independent commands.

### REQ-FUN-MAINTENANCE-ORDER-003: Starts scheduled maintenance

An assigned user starts scheduled maintenance.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Scheduling, starting, parts, labor, completion, and cancellation are independent commands.

### REQ-FUN-MAINTENANCE-ORDER-004: Posts stock movements

An assigned user consumes required parts and posts stock movements.

Parts create stock movements and labor can create cost-center expense.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

### REQ-FUN-MAINTENANCE-ORDER-005: Records labor and downtime

An assigned user records labor and downtime.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Scheduling, starting, parts, labor, completion, and cancellation are independent commands.

### REQ-FUN-MAINTENANCE-ORDER-006: Posts eligible labor cost to the cost center

An authorized finance or maintenance user posts eligible labor cost to the cost center.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Parts create stock movements and labor can create cost-center expense.

### REQ-FUN-MAINTENANCE-ORDER-007: Completes the work with notes

An assigned user completes the work with notes.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Scheduling, starting, parts, labor, completion, and cancellation are independent commands.

### REQ-FUN-MAINTENANCE-ORDER-008: Updates equipment status and the plan's next due date on completion

The product updates equipment status and the plan's next due date on completion.

Completion updates equipment and next due date.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

### REQ-FUN-MAINTENANCE-ORDER-009: Cancels an eligible work order

An authorized maintenance manager cancels an eligible work order.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Scheduling, starting, parts, labor, completion, and cancellation are independent commands.

### REQ-FUN-MAINTENANCE-ORDER-010: Views maintenance status, parts, labor, downtime, cost

An authorized user views maintenance status, parts, labor, downtime, cost, and equipment effects.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Parts create stock movements and labor can create cost-center expense.

### REQ-FUN-MAINTENANCE-ORDER-011: The product blocks production scheduling that depends on critical equipment during downtime

The product blocks production scheduling that depends on critical equipment during downtime.

Work creation selects equipment, type, priority, date, assignee, parts, labor, downtime, and cost center.

Scheduling, starting, parts, labor, completion, and cancellation are independent commands.

## REQ-FUN-SERVICE-CASE: Service Case Operations

For Service Case, case creation selects customer, sold item, and serial context. Investigation and waiting-on-customer are distinct progress choices.

Together, resolution precedes closure and keeps service-order links. Discovery supports customer, item, serial, status, assignee, age, and SLA.

### REQ-FUN-SERVICE-CASE-001: Creates a service case

An authorized service user creates a service case.

Case creation selects customer, sold item, and serial context.

Resolution precedes closure and keeps service-order links.

### REQ-FUN-SERVICE-CASE-002: Searches cases by customer, item, serial, status, assignee, age

An authorized user searches cases by customer, item, serial, status, assignee, age, and SLA state.

Discovery supports customer, item, serial, status, assignee, age, and SLA.

Case creation selects customer, sold item, and serial context.

### REQ-FUN-SERVICE-CASE-003: An assigned user begins investigation

An assigned user begins investigation.

Investigation and waiting-on-customer are distinct progress choices.

Case creation selects customer, sold item, and serial context.

### REQ-FUN-SERVICE-CASE-004: Marks the case waiting on customer

An assigned user marks the case waiting on customer.

Case creation selects customer, sold item, and serial context.

Investigation and waiting-on-customer are distinct progress choices.

### REQ-FUN-SERVICE-CASE-005: An assigned user resolves the case with a resolution

An assigned user resolves the case with a resolution.

Case creation selects customer, sold item, and serial context.

Resolution precedes closure and keeps service-order links.

### REQ-FUN-SERVICE-CASE-006: Closes a resolved case

An authorized service manager closes a resolved case.

Case creation selects customer, sold item, and serial context.

Resolution precedes closure and keeps service-order links.

### REQ-FUN-SERVICE-CASE-007: Cancels an eligible case

An authorized service manager cancels an eligible case.

Case creation selects customer, sold item, and serial context.

Resolution precedes closure and keeps service-order links.

## REQ-FUN-SERVICE-ORDER: Service Order Operations

For Service Order, order creation selects case, customer, service type, schedule, assignee, and item or serial context. Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

Together, billable work creates an invoice; non-billable warranty work creates warranty expense. Cancellation keeps any stock or cost already posted.

### REQ-FUN-SERVICE-ORDER-001: Creates and edits a draft service order

An authorized service user creates and edits a draft service order.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

Billable work creates an invoice; non-billable warranty work creates warranty expense.

### REQ-FUN-SERVICE-ORDER-002: Assigns the order

An authorized service user schedules and assigns the order.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

### REQ-FUN-SERVICE-ORDER-003: Starts scheduled service

The assignee starts scheduled service.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

### REQ-FUN-SERVICE-ORDER-004: Posts stock movements

The assignee consumes service parts and posts stock movements.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

### REQ-FUN-SERVICE-ORDER-005: Records service labor

The assignee records service labor.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

### REQ-FUN-SERVICE-ORDER-006: Records the warranty decision

An authorized user records the warranty decision.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

Billable work creates an invoice; non-billable warranty work creates warranty expense.

### REQ-FUN-SERVICE-ORDER-007: Records the billing decision

An authorized user records the billing decision.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

### REQ-FUN-SERVICE-ORDER-008: Completes service with a resolution

The assignee completes service with a resolution.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

### REQ-FUN-SERVICE-ORDER-009: A Sales or Finance user invoices billable service

A Sales or Finance user invoices billable service.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

Billable work creates an invoice; non-billable warranty work creates warranty expense.

### REQ-FUN-SERVICE-ORDER-010: Posts non-billable warranty labor and parts as warranty expense

A Finance user posts non-billable warranty labor and parts as warranty expense.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

Billable work creates an invoice; non-billable warranty work creates warranty expense.

### REQ-FUN-SERVICE-ORDER-011: Cancels an eligible order

An authorized service manager cancels an eligible order.

Order creation selects case, customer, service type, schedule, assignee, and item or serial context.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

### REQ-FUN-SERVICE-ORDER-012: Views service status, parts, labor, warranty, billing, invoice

An authorized user views service status, parts, labor, warranty, billing, invoice, and accounting effects.

Starting, parts consumption, labor reporting, warranty, billing, completion, and invoicing are distinct commands.

Billable work creates an invoice; non-billable warranty work creates warranty expense.

## REQ-FUN-WORKFLOW: Approval Workflow Administration

For Approval Workflow, workflow administration is organization-scoped and sensitive. Target type, priority, conditions, ordered steps, approver types, approval count, escalation, and fallback form one version.

Together, discovery explains which rule would apply to a document. Updating active configuration creates a new version and does not redirect in-flight requests.

### REQ-FUN-WORKFLOW-001: Creates a draft approval workflow for a supported document type

An Owner creates a draft approval workflow for a supported document type.

Target type, priority, conditions, ordered steps, approver types, approval count, escalation, and fallback form one version.

Workflow administration is organization-scoped and sensitive.

### REQ-FUN-WORKFLOW-002: An Owner configures priority and amount, context, party, warehouse, role, currency, risk

An Owner configures priority and amount, context, party, warehouse, role, currency, risk, and budget conditions.

Target type, priority, conditions, ordered steps, approver types, approval count, escalation, and fallback form one version.

Workflow administration is organization-scoped and sensitive.

### REQ-FUN-WORKFLOW-003: Adds and orders approval steps with approver type, required approvals, escalation time

An Owner adds and orders approval steps with approver type, required approvals, escalation time, and fallback.

Target type, priority, conditions, ordered steps, approver types, approval count, escalation, and fallback form one version.

Workflow administration is organization-scoped and sensitive.

### REQ-FUN-WORKFLOW-004: An Owner activates a workflow version

An Owner activates a workflow version.

Workflow administration is organization-scoped and sensitive.

Target type, priority, conditions, ordered steps, approver types, approval count, escalation, and fallback form one version.

### REQ-FUN-WORKFLOW-005: Finds workflows by target type, priority, status

An authorized user finds workflows by target type, priority, status, and condition.

Target type, priority, conditions, ordered steps, approver types, approval count, escalation, and fallback form one version.

Workflow administration is organization-scoped and sensitive.

### REQ-FUN-WORKFLOW-006: Creates a new version of an active workflow

An Owner creates a new version of an active workflow.

Updating active configuration creates a new version and does not redirect in-flight requests.

Workflow administration is organization-scoped and sensitive.

### REQ-FUN-WORKFLOW-007: Deactivates a workflow for future submissions

An Owner deactivates a workflow for future submissions.

Workflow administration is organization-scoped and sensitive.

Target type, priority, conditions, ordered steps, approver types, approval count, escalation, and fallback form one version.

### REQ-FUN-WORKFLOW-008: Every workflow and permission change emits a sensitive audit event

Every workflow and permission change emits a sensitive audit event.

Workflow administration is organization-scoped and sensitive.

Target type, priority, conditions, ordered steps, approver types, approval count, escalation, and fallback form one version.

## REQ-FUN-APPROVAL: Approval Request Operations

For Approval Request, submission creates a request from the matching workflow version and locks business fields. Assigned approvers act only on the current step and active assignment.

Together, approve, reject, request changes, delegate, and escalate are independent commands. History and inbox views expose every decision and pending responsibility.

### REQ-FUN-APPROVAL-001: Creates an approval request and locks business fields

Submitting an eligible document creates an approval request and locks business fields.

Submission creates a request from the matching workflow version and locks business fields.

Approve, reject, request changes, delegate, and escalate are independent commands.

### REQ-FUN-APPROVAL-002: Views their active approval inbox

An assigned approver views their active approval inbox.

Assigned approvers act only on the current step and active assignment.

History and inbox views expose every decision and pending responsibility.

### REQ-FUN-APPROVAL-003: Approves an active step

An assigned approver approves an active step.

Assigned approvers act only on the current step and active assignment.

Submission creates a request from the matching workflow version and locks business fields.

### REQ-FUN-APPROVAL-004: Rejects an active request

An assigned approver rejects an active request.

Assigned approvers act only on the current step and active assignment.

Submission creates a request from the matching workflow version and locks business fields.

### REQ-FUN-APPROVAL-005: Changes from the requester

An assigned approver requests changes from the requester.

Assigned approvers act only on the current step and active assignment.

Approve, reject, request changes, delegate, and escalate are independent commands.

### REQ-FUN-APPROVAL-006: An assigned approver delegates their active assignment

An assigned approver delegates their active assignment.

Assigned approvers act only on the current step and active assignment.

Submission creates a request from the matching workflow version and locks business fields.

### REQ-FUN-APPROVAL-007: An authorized approver or System principal escalates an overdue step

An authorized approver or System principal escalates an overdue step.

Assigned approvers act only on the current step and active assignment.

Submission creates a request from the matching workflow version and locks business fields.

### REQ-FUN-APPROVAL-008: Applies a fallback approver when escalation requires one

The product applies a fallback approver when escalation requires one.

Submission creates a request from the matching workflow version and locks business fields.

Assigned approvers act only on the current step and active assignment.

### REQ-FUN-APPROVAL-009: Approves the source document

Meeting required approvals advances the step or approves the source document.

Assigned approvers act only on the current step and active assignment.

Submission creates a request from the matching workflow version and locks business fields.

### REQ-FUN-APPROVAL-010: Views immutable approval history and current status

An authorized user views immutable approval history and current status.

History and inbox views expose every decision and pending responsibility.

Assigned approvers act only on the current step and active assignment.

## REQ-FUN-AUDIT: Audit History Operations

For Audit Event, audit query is tenant-scoped and separately permissioned from operational record access. Search supports actor, action, target, risk, and time evidence.

Together, before and after values plus reason and request context explain a change. Deactivated related records stay resolvable in history.

### REQ-FUN-AUDIT-001: The product emits an immutable audit event for every source-named sensitive action

The product emits an immutable audit event for every source-named sensitive action.

Audit query is tenant-scoped and separately permissioned from operational record access.

Search supports actor, action, target, risk, and time evidence.

### REQ-FUN-AUDIT-002: Searches audit events by actor, action, target type and identity, risk level

An authorized Owner or relevant manager searches audit events by actor, action, target type and identity, risk level, and date range.

Search supports actor, action, target, risk, and time evidence.

Audit query is tenant-scoped and separately permissioned from operational record access.

### REQ-FUN-AUDIT-003: Views one event's before and after values, reason, IP address, user agent, timestamp

An authorized user views one event's before and after values, reason, IP address, user agent, timestamp, and related record.

Before and after values plus reason and request context explain a change.

Audit query is tenant-scoped and separately permissioned from operational record access.

### REQ-FUN-AUDIT-004: Audit Audit Event for history remains available

Audit history remains available after related users, parties, items, or accounts are deactivated.

Deactivated related records stay resolvable in history.

Audit query is tenant-scoped and separately permissioned from operational record access.

## REQ-FUN-NOTIFICATION: Notification Operations

For Notification, audit events and scheduled reminders create organization-scoped notification work. High-risk events select Owners and relevant managers.

Together, dispatch keeps attempt and result history. Users can inspect their notifications while not viewing another recipient's private delivery state.

### REQ-FUN-NOTIFICATION-001: A high-risk audit event queues notifications for organization Owners and relevant managers

A high-risk audit event queues notifications for organization Owners and relevant managers.

High-risk events select Owners and relevant managers.

Audit events and scheduled reminders create organization-scoped notification work.

### REQ-FUN-NOTIFICATION-002: The System principal queues period-end and approval-escalation reminders

The System principal queues period-end and approval-escalation reminders.

Audit events and scheduled reminders create organization-scoped notification work.

High-risk events select Owners and relevant managers.

### REQ-FUN-NOTIFICATION-003: Dispatches queued notifications

The System principal dispatches queued notifications.

Users can inspect their notifications while not viewing another recipient's private delivery state.

Audit events and scheduled reminders create organization-scoped notification work.

### REQ-FUN-NOTIFICATION-004: Retries failed delivery without duplicating the originating event

The System principal retries failed delivery without duplicating the originating event.

Users can inspect their notifications while not viewing another recipient's private delivery state.

Audit events and scheduled reminders create organization-scoped notification work.

### REQ-FUN-NOTIFICATION-005: Lists and reads notifications addressed to their active membership

A user lists and reads notifications addressed to their active membership.

Users can inspect their notifications while not viewing another recipient's private delivery state.

Audit events and scheduled reminders create organization-scoped notification work.

## REQ-FUN-REPORT-FIN: Financial Reports

For Financial Reporting, every report is restricted to the currently selected organization and the caller's role and dimension visibility. Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Together, financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots. A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-FIN-001: Generates a trial balance

An authorized Finance user generates a trial balance.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-FIN-002: Generates a balance sheet

An authorized Finance user generates a balance sheet.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-FIN-003: Generates a profit and loss report

An authorized Finance user generates a profit and loss report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-FIN-004: Generates a general ledger report

An authorized Finance user generates a general ledger report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-FIN-005: Generates accounts-receivable aging

An authorized Finance user generates accounts-receivable aging.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-FIN-006: Generates accounts-payable aging

An authorized Finance user generates accounts-payable aging.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-FIN-007: Generates a cash-flow report

An authorized Finance user generates a cash-flow report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-FIN-008: Generates a tax summary

An authorized Finance user generates a tax summary.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-FIN-009: Generates budget versus actual

An authorized Finance user generates budget versus actual.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-FIN-010: An authorized user filters a financial report by every applicable source-named dimension

An authorized user filters a financial report by every applicable source-named dimension.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-FIN-011: An authorized user exports one financial report with its current filters and scope

An authorized user exports one financial report with its current filters and scope.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

## REQ-FUN-REPORT-PROC: Procurement Reports

For Procurement Reporting, every report is restricted to the currently selected organization and the caller's role and dimension visibility. Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Together, financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots. A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-PROC-001: Generates purchase-order status

An authorized Procurement user generates purchase-order status.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

### REQ-FUN-REPORT-PROC-002: Generates vendor spend

An authorized Procurement user generates vendor spend.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

### REQ-FUN-REPORT-PROC-003: Generates three-way-match exceptions

An authorized Procurement or Finance user generates three-way-match exceptions.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-PROC-004: Generates receipts not yet billed

An authorized Procurement user generates receipts not yet billed.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-PROC-005: An authorized user filters a procurement report by every applicable source-named dimension

An authorized user filters a procurement report by every applicable source-named dimension.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-PROC-006: An authorized user exports one procurement report with its current filters and scope

An authorized user exports one procurement report with its current filters and scope.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

## REQ-FUN-REPORT-INV: Inventory Reports

For Inventory Reporting, every report is restricted to the currently selected organization and the caller's role and dimension visibility. Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Together, financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots. A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-INV-001: Generates stock on hand

An authorized Warehouse user generates stock on hand.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots.

### REQ-FUN-REPORT-INV-002: Generates inventory valuation

An authorized Finance or Warehouse user generates inventory valuation.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots.

### REQ-FUN-REPORT-INV-003: Generates inventory movement history

An authorized Warehouse user generates inventory movement history.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots.

### REQ-FUN-REPORT-INV-004: Generates slow-moving inventory

An authorized Warehouse user generates slow-moving inventory.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots.

### REQ-FUN-REPORT-INV-005: Generates negative-stock exceptions

An authorized Warehouse user generates negative-stock exceptions.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots.

### REQ-FUN-REPORT-INV-006: Generates lot and serial traceability

An authorized user generates lot and serial traceability.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-INV-007: An authorized user filters an inventory report by every applicable source-named dimension

An authorized user filters an inventory report by every applicable source-named dimension.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-INV-008: An authorized user exports one inventory report with its current filters and scope

An authorized user exports one inventory report with its current filters and scope.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

## REQ-FUN-REPORT-SALES: Sales Reports

For Sales Reporting, every report is restricted to the currently selected organization and the caller's role and dimension visibility. Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Together, financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots. A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-SALES-001: Generates sales backlog

An authorized Sales user generates sales backlog.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-SALES-002: Generates sales by customer and item

An authorized Sales user generates sales by customer and item.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

### REQ-FUN-REPORT-SALES-003: Generates shipments not yet invoiced

An authorized Sales user generates shipments not yet invoiced.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-SALES-004: Generates customer credit exposure

An authorized Sales or Finance user generates customer credit exposure.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

### REQ-FUN-REPORT-SALES-005: An authorized user filters a sales report by every applicable source-named dimension

An authorized user filters a sales report by every applicable source-named dimension.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-SALES-006: An authorized user exports one sales report with its current filters and scope

An authorized user exports one sales report with its current filters and scope.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

## REQ-FUN-REPORT-HR: HR and Payroll Reports

For HR and Payroll Reporting, every report is restricted to the currently selected organization and the caller's role and dimension visibility. Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Together, financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots. A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-HR-001: Generates headcount

An authorized HR user generates headcount.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-HR-002: Generates employment contract history

An authorized HR user generates employment contract history.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-HR-003: Generates timesheet status

An authorized HR or time manager generates timesheet status.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

### REQ-FUN-REPORT-HR-004: Generates payroll register and liability

An authorized HR or Finance user generates payroll register and liability.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-HR-005: Generates payslip history

An authorized HR user generates payslip history.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-HR-006: An authorized user filters an HR or payroll report by every applicable source-named dimension

An authorized user filters an HR or payroll report by every applicable source-named dimension.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-HR-007: An authorized user exports one HR or payroll report with its current filters and scope

An authorized user exports one HR or payroll report with its current filters and scope.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

## REQ-FUN-REPORT-MFG: Manufacturing Reports

For Manufacturing Reporting, every report is restricted to the currently selected organization and the caller's role and dimension visibility. Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Together, financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots. A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-MFG-001: Generates MRP recommendations

An authorized Production user generates MRP recommendations.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-MFG-002: Generates production-order status

An authorized Production user generates production-order status.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

### REQ-FUN-REPORT-MFG-003: Generates material shortage

An authorized Production user generates material shortage.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-MFG-004: Generates production variance

An authorized Production or Finance user generates production variance.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-MFG-005: Generates work-center utilization

An authorized Production user generates work-center utilization.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

### REQ-FUN-REPORT-MFG-006: An authorized user filters a manufacturing report by every applicable source-named dimension

An authorized user filters a manufacturing report by every applicable source-named dimension.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-MFG-007: An authorized user exports one manufacturing report with its current filters and scope

An authorized user exports one manufacturing report with its current filters and scope.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

## REQ-FUN-REPORT-QMS: Quality, Maintenance, and Service Reports

For Quality, Maintenance, and Service Reporting, every report is restricted to the currently selected organization and the caller's role and dimension visibility. Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Together, financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots. A report export keeps the same filters, scope, and authoritative result as its on-screen report.

### REQ-FUN-REPORT-QMS-001: Generates inspection failures

An authorized quality user generates inspection failures.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-QMS-002: Generates quarantined stock

An authorized quality or Warehouse user generates quarantined stock.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Financial and inventory results use posted journals and immutable stock movements; hard-closed periods reproduce closing snapshots.

### REQ-FUN-REPORT-QMS-003: Generates maintenance backlog

An authorized maintenance user generates maintenance backlog.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-QMS-004: Generates equipment downtime

An authorized maintenance or Production user generates equipment downtime.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-QMS-005: Generates service-case SLA

An authorized service user generates service-case SLA.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-QMS-006: Generates warranty cost

An authorized service or Finance user generates warranty cost.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

### REQ-FUN-REPORT-QMS-007: An Quality, Maintenance, and Service Reporting for user filters report

An authorized user filters a quality, maintenance, or service report by every applicable source-named dimension.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

Applicable filters include fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

### REQ-FUN-REPORT-QMS-008: An Quality, Maintenance, and Service Reporting for user exports report

An authorized user exports one quality, maintenance, or service report with its current filters and scope.

A report export keeps the same filters, scope, and authoritative result as its on-screen report.

Every report is restricted to the currently selected organization and the caller's role and dimension visibility.

## REQ-JRN-P2P: Procure-to-Pay Journey

For Procure-to-Pay, the journey begins with organization-scoped vendor, item, warehouse, budget, and employee request masters. Each handoff consumes source remainder and keeps upstream and downstream links.

Together, receipt, bill, and payment postings update stock, cost, commitments, AP, and cash atomically. Returns, credits, disputes, cancellation, and reversal provide explicit early-exit and correction paths.

### REQ-JRN-P2P-001: Submits purchasing demand against active vendor, item, warehouse

An Employee enters and submits purchasing demand against active vendor, item, warehouse, and budget context.

The journey begins with organization-scoped vendor, item, warehouse, budget, and employee request masters.

Each handoff consumes source remainder and keeps upstream and downstream links.

### REQ-JRN-P2P-002: Approval and conversion turn authorized request remainder into a linked purchase order

Approval and conversion turn authorized request remainder into a linked purchase order.

The journey begins with organization-scoped vendor, item, warehouse, budget, and employee request masters.

Each handoff consumes source remainder and keeps upstream and downstream links.

### REQ-JRN-P2P-003: Posts item quantity and weighted-average cost from the purchase order

Receiving posts item quantity and weighted-average cost from the purchase order.

The journey begins with organization-scoped vendor, item, warehouse, budget, and employee request masters.

Receipt, bill, and payment postings update stock, cost, commitments, AP, and cash atomically.

### REQ-JRN-P2P-004: Three-way matching and approval turn receipt and order evidence into a posted vendor bill

Three-way matching and approval turn receipt and order evidence into a posted vendor bill.

Receipt, bill, and payment postings update stock, cost, commitments, AP, and cash atomically.

The journey begins with organization-scoped vendor, item, warehouse, budget, and employee request masters.

### REQ-JRN-P2P-005: Settles the bill and completes payable accounting

A bank-funded vendor payment settles the bill and completes payable accounting.

Receipt, bill, and payment postings update stock, cost, commitments, AP, and cash atomically.

The journey begins with organization-scoped vendor, item, warehouse, budget, and employee request masters.

### REQ-JRN-P2P-006: A Procure-to-Pay for purchase return vendor

A purchase return, vendor credit, bill adjustment, payment reversal, or eligible cancellation corrects downstream effects and restores upstream remainders.

Each handoff consumes source remainder and keeps upstream and downstream links.

Receipt, bill, and payment postings update stock, cost, commitments, AP, and cash atomically.

### REQ-JRN-P2P-007: Authorized Procure-to-Pay for users verify inventory

Authorized users verify inventory quantity, weighted-average cost, budget commitment and actual, AP, cash, journal entries, and every document status.

Receipt, bill, and payment postings update stock, cost, commitments, AP, and cash atomically.

The journey begins with organization-scoped vendor, item, warehouse, budget, and employee request masters.

## REQ-JRN-O2C: Order-to-Cash Journey

For Order-to-Cash, the journey begins with customer, item price, eligible warehouse stock, and quote or direct order. Credit, allocation, shipment, invoice, and payment decisions keep independent quantity and balance progress.

Together, shipping and invoicing post inventory, COGS, AR, revenue, discount, and tax effects before cash settlement. Return, credit, refund, allocation release, void, and reversal provide explicit correction paths.

### REQ-JRN-O2C-001: Creates customer demand from current item pricing and warehouse stock

A Sales user creates customer demand from current item pricing and warehouse stock.

The journey begins with customer, item price, eligible warehouse stock, and quote or direct order.

Credit, allocation, shipment, invoice, and payment decisions keep independent quantity and balance progress.

### REQ-JRN-O2C-002: Credit evaluation and approval authorize the sales order

Credit evaluation and approval authorize the sales order.

The journey begins with customer, item price, eligible warehouse stock, and quote or direct order.

Credit, allocation, shipment, invoice, and payment decisions keep independent quantity and balance progress.

### REQ-JRN-O2C-003: Allocation, pick, pack

Allocation, pick, pack, and shipment consume eligible stock and post cost of goods sold.

The journey begins with customer, item price, eligible warehouse stock, and quote or direct order.

Credit, allocation, shipment, invoice, and payment decisions keep independent quantity and balance progress.

### REQ-JRN-O2C-004: Posts revenue, receivable, discount

A source-linked sales invoice posts revenue, receivable, discount, and tax from shipped quantity.

Credit, allocation, shipment, invoice, and payment decisions keep independent quantity and balance progress.

Shipping and invoicing post inventory, COGS, AR, revenue, discount, and tax effects before cash settlement.

### REQ-JRN-O2C-005: Settles invoices, increases cash

Customer payment settles invoices, increases cash, and can be matched in bank reconciliation.

The journey begins with customer, item price, eligible warehouse stock, and quote or direct order.

Credit, allocation, shipment, invoice, and payment decisions keep independent quantity and balance progress.

### REQ-JRN-O2C-006: Allocation Order-to-Cash for allocation release sales

Allocation release, sales return, credit memo, refund, void, or reversal corrects downstream effects and restores source remainder.

Return, credit, refund, allocation release, void, and reversal provide explicit correction paths.

Credit, allocation, shipment, invoice, and payment decisions keep independent quantity and balance progress.

### REQ-JRN-O2C-007: Authorized users verify revenue, AR, cash, COGS, inventory, tax, credit exposure, bank match

Authorized users verify revenue, AR, cash, COGS, inventory, tax, credit exposure, bank match, and order status.

Shipping and invoicing post inventory, COGS, AR, revenue, discount, and tax effects before cash settlement.

The journey begins with customer, item price, eligible warehouse stock, and quote or direct order.

## REQ-JRN-P2PROD: Plan-to-Produce Journey

For Plan-to-Produce, the journey begins with finished and component items, BOM, routing, work center, machine, demand, and stock context. MRP recommendation acceptance keeps the planning source on the production order.

Together, release, consumption, labor, output, quality, and close each create distinct operational evidence. Scrap, rework, additional movements, cancellation, and financial adjustment provide correction and early exit.

### REQ-JRN-P2PROD-001: MRP Plan-to-Produce for turns sales demand

MRP turns sales demand and low stock into actionable planned production and shortage recommendations.

The journey begins with finished and component items, BOM, routing, work center, machine, demand, and stock context.

MRP recommendation acceptance keeps the planning source on the production order.

### REQ-JRN-P2PROD-002: Accepts planned production into a source-linked order

A Production Manager accepts planned production into a source-linked order.

MRP recommendation acceptance keeps the planning source on the production order.

The journey begins with finished and component items, BOM, routing, work center, machine, demand, and stock context.

### REQ-JRN-P2PROD-003: Posts component consumption

Release reserves components and start posts component consumption.

Release, consumption, labor, output, quality, and close each create distinct operational evidence.

The journey begins with finished and component items, BOM, routing, work center, machine, demand, and stock context.

### REQ-JRN-P2PROD-004: Production users report labor, machine, overhead, scrap

Production users report labor, machine, overhead, scrap, and partial or full finished output.

The journey begins with finished and component items, BOM, routing, work center, machine, demand, and stock context.

Release, consumption, labor, output, quality, and close each create distinct operational evidence.

### REQ-JRN-P2PROD-005: Quality users resolve required inspection before closure

Quality users resolve required inspection before closure.

Release, consumption, labor, output, quality, and close each create distinct operational evidence.

The journey begins with finished and component items, BOM, routing, work center, machine, demand, and stock context.

### REQ-JRN-P2PROD-006: Posts manufacturing variance after all unresolved work is cleared

Approved closure posts manufacturing variance after all unresolved work is cleared.

The journey begins with finished and component items, BOM, routing, work center, machine, demand, and stock context.

MRP recommendation acceptance keeps the planning source on the production order.

### REQ-JRN-P2PROD-007: Authorized Plan-to-Produce for users verify component

Authorized users verify component stock, finished stock, reservations, labor, overhead, variance journals, quality, and order status.

The journey begins with finished and component items, BOM, routing, work center, machine, demand, and stock context.

Release, consumption, labor, output, quality, and close each create distinct operational evidence.

## REQ-JRN-H2R: Hire-to-Retire and Payroll Journey

For Hire-to-Retire and Payroll, the journey begins with invitation, membership role, employee placement, department, contract, project, and assignment. Owned timelogs become a weekly approved and locked timesheet.

Together, payroll calculation, approval, posting, payment, and payslip publication remain distinct effects. Rejection, reopening, replacement contract, payroll reversal, adjustment, leave, and termination provide recovery and completion.

### REQ-JRN-H2R-001: An Owner and HR Manager establish membership, role, employee, department, contract, project

An Owner and HR Manager establish membership, role, employee, department, contract, project, and project assignment.

The journey begins with invitation, membership role, employee placement, department, contract, project, and assignment.

Rejection, reopening, replacement contract, payroll reversal, adjustment, leave, and termination provide recovery and completion.

### REQ-JRN-H2R-002: Submits a weekly timesheet

The Employee logs assigned project time and submits a weekly timesheet.

The journey begins with invitation, membership role, employee placement, department, contract, project, and assignment.

Owned timelogs become a weekly approved and locked timesheet.

### REQ-JRN-H2R-003: Approves the timesheet and locks its timelogs

An assigned approver approves the timesheet and locks its timelogs.

Owned timelogs become a weekly approved and locked timesheet.

The journey begins with invitation, membership role, employee placement, department, contract, project, and assignment.

### REQ-JRN-H2R-004: Calculates payroll from configuration and eligible approved time

HR calculates payroll from configuration and eligible approved time.

Owned timelogs become a weekly approved and locked timesheet.

Payroll calculation, approval, posting, payment, and payslip publication remain distinct effects.

### REQ-JRN-H2R-005: Approval, posting

Approval, posting, and payment create and settle payroll expense, tax, benefit, and payable balances.

Payroll calculation, approval, posting, payment, and payslip publication remain distinct effects.

Rejection, reopening, replacement contract, payroll reversal, adjustment, leave, and termination provide recovery and completion.

### REQ-JRN-H2R-006: Publishes the employee's own payslip

HR publishes the employee's own payslip.

The journey begins with invitation, membership role, employee placement, department, contract, project, and assignment.

Payroll calculation, approval, posting, payment, and payslip publication remain distinct effects.

### REQ-JRN-H2R-007: Timesheet Hire-to-Retire and Payroll for timesheet rejection reopening

Timesheet rejection or reopening and payroll reversal or adjustment correct pre- and post-posting errors.

Rejection, reopening, replacement contract, payroll reversal, adjustment, leave, and termination provide recovery and completion.

Payroll calculation, approval, posting, payment, and payslip publication remain distinct effects.

### REQ-JRN-H2R-008: Deactivates employment

HR terminates or deactivates employment while retaining contracts, payroll, payslips, time, and audit history.

Payroll calculation, approval, posting, payment, and payslip publication remain distinct effects.

Rejection, reopening, replacement contract, payroll reversal, adjustment, leave, and termination provide recovery and completion.

### REQ-JRN-H2R-009: Authorized users verify liabilities, expense, bank movement, locked time, payslip

Authorized users verify liabilities, expense, bank movement, locked time, payslip, and employee visibility.

The journey begins with invitation, membership role, employee placement, department, contract, project, and assignment.

Owned timelogs become a weekly approved and locked timesheet.

## REQ-JRN-A2R: Acquire-to-Retire Journey

For Acquire-to-Retire Fixed Asset, the journey starts with an equipment vendor bill or manual acquisition and keeps the source. Capitalization approval establishes the asset before period depreciation.

Together, transfer changes custody only; impairment and disposal change book value through postings. AP correction, adjustment, rejected capitalization, and immutable later events provide recovery.

### REQ-JRN-A2R-001: Becomes a draft fixed asset

A vendor bill or manual acquisition becomes a draft fixed asset.

The journey starts with an equipment vendor bill or manual acquisition and keeps the source.

Capitalization approval establishes the asset before period depreciation.

### REQ-JRN-A2R-002: Threshold-aware approval capitalizes and activates the asset

Threshold-aware approval capitalizes and activates the asset.

Capitalization approval establishes the asset before period depreciation.

The journey starts with an equipment vendor bill or manual acquisition and keeps the source.

### REQ-JRN-A2R-003: Updates expense and accumulated depreciation

Fiscal-period depreciation updates expense and accumulated depreciation.

Capitalization approval establishes the asset before period depreciation.

The journey starts with an equipment vendor bill or manual acquisition and keeps the source.

### REQ-JRN-A2R-004: A custodian or location transfer emits audit evidence without changing acquisition cost

A custodian or location transfer emits audit evidence without changing acquisition cost.

The journey starts with an equipment vendor bill or manual acquisition and keeps the source.

Transfer changes custody only; impairment and disposal change book value through postings.

### REQ-JRN-A2R-005: Posts loss

Impairment reduces carrying value and posts loss.

Transfer changes custody only; impairment and disposal change book value through postings.

The journey starts with an equipment vendor bill or manual acquisition and keeps the source.

### REQ-JRN-A2R-006: Posts derecognition and gain or loss

Disposal by sale, scrap, donation, or loss posts derecognition and gain or loss.

Transfer changes custody only; impairment and disposal change book value through postings.

The journey starts with an equipment vendor bill or manual acquisition and keeps the source.

### REQ-JRN-A2R-007: Authorized Acquire-to-Retire Fixed Asset for users verify book

Authorized users verify book value, accumulated depreciation, expense, impairment, disposal, journals, and audit history.

Transfer changes custody only; impairment and disposal change book value through postings.

Capitalization approval establishes the asset before period depreciation.

## REQ-JRN-CLOSE: Period-Close Journey

For Period Close, the journey spans procurement, sales, inventory, payroll, assets, manufacturing, banking, tax, approvals, and journals. Named blockers must be resolved before hard close.

Together, hard close freezes report evidence and refuses new postings or document change. Owner-approved reopening with reason keeps audit and allows a new close cycle.

### REQ-JRN-CLOSE-001: Responsible users create and resolve period activity across every source-named module

Responsible users create and resolve period activity across every source-named module.

Named blockers must be resolved before hard close.

The journey spans procurement, sales, inventory, payroll, assets, manufacturing, banking, tax, approvals, and journals.

### REQ-JRN-CLOSE-002: Runs the complete blocker validation

A Finance Manager soft-closes the period and runs the complete blocker validation.

The journey spans procurement, sales, inventory, payroll, assets, manufacturing, banking, tax, approvals, and journals.

Named blockers must be resolved before hard close.

### REQ-JRN-CLOSE-003: Becomes hard-closed with immutable snapshots

A blocker-free period becomes hard-closed with immutable snapshots.

Named blockers must be resolved before hard close.

Hard close freezes report evidence and refuses new postings or document change.

### REQ-JRN-CLOSE-004: Period Close refusal

A posting or document change attempted in the hard-closed period is refused.

Hard close freezes report evidence and refuses new postings or document change.

Named blockers must be resolved before hard close.

### REQ-JRN-CLOSE-005: An Owner obtains approval to reopen with a reason and audit event

An Owner obtains approval to reopen with a reason and audit event.

Owner-approved reopening with reason keeps audit and allows a new close cycle.

The journey spans procurement, sales, inventory, payroll, assets, manufacturing, banking, tax, approvals, and journals.

### REQ-JRN-CLOSE-006: Finance corrects and recloses the reopened period as a new close cycle

Finance corrects and recloses the reopened period as a new close cycle.

Owner-approved reopening with reason keeps audit and allows a new close cycle.

Named blockers must be resolved before hard close.

### REQ-JRN-CLOSE-007: Authorized users verify snapshot reproduction, audit history, period state

Authorized users verify snapshot reproduction, audit history, period state, and cross-report consistency.

Hard close freezes report evidence and refuses new postings or document change.

Owner-approved reopening with reason keeps audit and allows a new close cycle.

## REQ-JRN-QUALITY-SERVICE: Quality and Service Journey

For Quality and Service, the quality branch begins with lot-tracked receipt, failed incoming inspection, and held stock. Approved disposition creates return, scrap, rework, use-as-is, or release while retaining traceability.

Together, the service branch begins with a customer, sold serial, case, and assigned work order. Parts, labor, warranty, billing, invoice, and expense outcomes keep stock and accounting links.

### REQ-JRN-QUALITY-SERVICE-001: Creates an incoming inspection order

Receiving lot-tracked goods creates an incoming inspection order.

The quality branch begins with lot-tracked receipt, failed incoming inspection, and held stock.

Approved disposition creates return, scrap, rework, use-as-is, or release while retaining traceability.

### REQ-JRN-QUALITY-SERVICE-002: Removes it from availability

Failed inspection quarantines identified stock and removes it from availability.

The quality branch begins with lot-tracked receipt, failed incoming inspection, and held stock.

Parts, labor, warranty, billing, invoice, and expense outcomes keep stock and accounting links.

### REQ-JRN-QUALITY-SERVICE-003: Approved disposition returns, scraps, reworks, accepts, or releases the held quantity

Approved disposition returns, scraps, reworks, accepts, or releases the held quantity.

Approved disposition creates return, scrap, rework, use-as-is, or release while retaining traceability.

The quality branch begins with lot-tracked receipt, failed incoming inspection, and held stock.

### REQ-JRN-QUALITY-SERVICE-004: Creates assigned service work

A customer service case for a serialized item creates assigned service work.

The service branch begins with a customer, sold serial, case, and assigned work order.

Approved disposition creates return, scrap, rework, use-as-is, or release while retaining traceability.

### REQ-JRN-QUALITY-SERVICE-005: Posts parts consumption and records labor

Service execution posts parts consumption and records labor.

Parts, labor, warranty, billing, invoice, and expense outcomes keep stock and accounting links.

The service branch begins with a customer, sold serial, case, and assigned work order.

### REQ-JRN-QUALITY-SERVICE-006: Warranty and billing decisions create either a sales invoice or warranty expense

Warranty and billing decisions create either a sales invoice or warranty expense.

Parts, labor, warranty, billing, invoice, and expense outcomes keep stock and accounting links.

The quality branch begins with lot-tracked receipt, failed incoming inspection, and held stock.

### REQ-JRN-QUALITY-SERVICE-007: Authorized Quality and Service for users verify stock

Authorized users verify stock availability, lot and serial traceability, accounting, service state, and audit history.

The service branch begins with a customer, sold serial, case, and assigned work order.

Parts, labor, warranty, billing, invoice, and expense outcomes keep stock and accounting links.
## REQ-FUN-MRP-RECOMMENDATION MRP Recommendation Operations

Each MRP recommendation belongs to one run and item-warehouse planning context. Planned purchase, planned production, expedite, delay, and shortage outcomes remain distinguishable in discovery. Acceptance creates one traceable supply document; dismissal is a separate terminal action that preserves the run and explanation instead of erasing planning evidence.

### REQ-FUN-MRP-RECOMMENDATION-001 View MRP recommendations

An authorized user views planned purchase, planned production, expedite, delay, and shortage recommendations.

- The result distinguishes planned purchase orders, planned production orders, expedite actions, delay actions, and shortage alerts.
- Each row retains its MRP run, item, warehouse, quantity or date need, and the supply-demand explanation.

### REQ-FUN-MRP-RECOMMENDATION-002 Accept a planned purchase recommendation

A Procurement user accepts a planned purchase-order recommendation.

- Acceptance creates a draft purchase order with recommended vendor, item, warehouse, quantity, and required date where those recommendation facts are available.
- The recommendation records the created document and cannot be accepted a second time.

### REQ-FUN-MRP-RECOMMENDATION-003 Accept a planned production recommendation

A Production Manager accepts a planned production-order recommendation.

- Acceptance creates a drafted production order with the recommended finished item, quantity, dates, warehouse, and eligible BOM and routing selections.
- The production order retains the recommendation and MRP run as upstream sources.

### REQ-FUN-MRP-RECOMMENDATION-004 Dismiss an inapplicable recommendation

An authorized user dismisses an inapplicable recommendation while preserving the run.

- Dismissal records the actor, time, and reason without deleting or editing the MRP run.
- The dismissed recommendation remains searchable and no purchase or production document is created.
## REQ-FUN-PAY-SCHEDULE Pay Schedule Operations

A pay schedule is the reusable cadence for frequency, period boundaries, cutoff, and payment date. HR Managers can create it, change only its future application, or deactivate it for new assignment while prior payroll keeps its captured schedule. Organization-scoped discovery shows cadence and status without exposing employee compensation.

### REQ-FUN-PAY-SCHEDULE-001 Create a pay schedule

An HR Manager creates a pay schedule with frequency, cutoff, period, and payment-date rules.

- The schedule records frequency, period rule, cutoff, payment-date rule, name, and active status.
- Creation makes the cadence eligible for future employee payroll configuration.

### REQ-FUN-PAY-SCHEDULE-002 Update a future pay schedule

An HR Manager updates a future pay schedule.

- Only future period, cutoff, and payment-date rules change; existing payroll runs retain the schedule facts captured for their periods.
- The update records the HR Manager and effective date.

### REQ-FUN-PAY-SCHEDULE-003 Deactivate a pay schedule

An HR Manager deactivates a pay schedule.

- Deactivation prevents new employee assignment and new runs for later periods.
- Existing employee history and payroll runs retain their original schedule reference.

### REQ-FUN-PAY-SCHEDULE-004 Search pay schedules

An authorized payroll user searches pay schedules by name, frequency, status, and payment period.

- Results remain in the selected organization and can be filtered by name, frequency, active status, and payment period.
- The result identifies next applicable cutoff and payment date without exposing employee payroll detail.
## REQ-FUN-STOCK-QUARANTINE Stock Quarantine Operations

Quarantine begins with specifically identified failed stock and preserves its item, warehouse, location, lot or serial, quantity, inspection, and age. The quantity remains searchable and traceable but is excluded from availability and operational use. Only an approved disposition execution ends or transforms the hold.

### REQ-FUN-STOCK-QUARANTINE-001 Quarantine failed inspected stock

A quality user quarantines failed inspected stock.

- The hold records item, warehouse, location, lot or serial, quantity, inspection, failed result, operator, and start time.
- An immutable quality-quarantine movement makes the held quantity traceable without treating it as available.

### REQ-FUN-STOCK-QUARANTINE-002 Search quarantined stock

An authorized user views quarantined stock by item, warehouse, location, lot, serial, inspection, and age.

- Results remain in the selected organization and support item, warehouse, location, lot, serial, inspection, disposition status, and age filters.
- Each result shows held, released, returned, reworked, or scrapped quantity and the active disposition state.

### REQ-FUN-STOCK-QUARANTINE-003 Refuse operational use of quarantined quantity

The product refuses allocation, shipment, consumption, or available-stock treatment of quarantined quantity.

- The refusal applies to allocation, shipment, production or service consumption, and stock-on-hand availability calculations.
- The attempted operation creates no stock movement or partial reservation and identifies the quarantined quantity as the blocker.
