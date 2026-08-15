# Business Concepts, Relationships, and Lifecycles

The ERP keeps every major business concept explicit and organization-scoped. Operational documents retain their source and downstream relationships, posted finance retains journal evidence, stock retains movement evidence, and correction creates linked business records rather than erasing history.

## REQ-DOM-ORG: Organization Scope

For Organization, an organization is the boundary for memberships, authority, operations, postings, reports, audit, and automation. Its configuration supplies accounting, currency, time, tax, inventory, approval, and numbering defaults used across modules.

Together, a user can participate in several organizations while each business record is scoped to exactly one. Organization removal is a terminal lifecycle decision governed by retained obligations instead of ordinary record cleanup.

### REQ-DOM-ORG-001: Organization its identity

An organization retains its identity, base currency, timezone, fiscal start month, tax jurisdiction, default payment terms, negative-stock policy, approval thresholds, and numbering conventions as one cohesive configuration catalog.

Its configuration supplies accounting, currency, time, tax, inventory, approval, and numbering defaults used across modules.

An organization is the boundary for memberships, authority, operations, postings, reports, audit, and automation.

### REQ-DOM-ORG-002: Every membership, operational document, posting, report, approval, audit event, notification

Every membership, operational document, posting, report, approval, audit event, notification, and System action belongs to exactly one organization.

An organization is the boundary for memberships, authority, operations, postings, reports, audit, and automation.

A user can participate in several organizations while each business record is scoped to exactly one.

### REQ-DOM-ORG-003: Preserve organization history until deletion is eligible

An organization preserves its business history and ownership relationships until the separate deletion policy permits removal.

Organization removal is a terminal lifecycle decision governed by retained obligations instead of ordinary record cleanup.

An organization is the boundary for memberships, authority, operations, postings, reports, audit, and automation.

## REQ-DOM-ADDRESS: Addresses

For Address, addresses are organization-scoped reference records instead of substitutes for the party or document that uses them. Billing, shipping, warehouse, and operational uses can point to the same address identity while retaining their own relationship purpose.

Together, historical documents keep the address relationship they used even when a reusable address is later revised. undefined

### REQ-DOM-ADDRESS-001: Records reusable postal and location information within one organization

An address records reusable postal and location information within one organization.

Addresses are organization-scoped reference records instead of substitutes for the party or document that uses them.

Historical documents keep the address relationship they used even when a reusable address is later revised.

### REQ-DOM-ADDRESS-002: A Address for party warehouse document

A party, warehouse, or document relates to an address through a named purpose such as billing, shipping, or physical location.

Billing, shipping, warehouse, and operational uses can point to the same address identity while retaining their own relationship purpose.

Addresses are organization-scoped reference records instead of substitutes for the party or document that uses them.

## REQ-DOM-CONTACT: Contacts

For Contact, contacts are distinct from the vendor or customer whose relationship they represent. A party can have several contact people while one assignment is designated primary.

Together, contact history stays meaningful to documents even if a party is later deactivated. undefined

### REQ-DOM-CONTACT-001: Records a person's name and communication details inside one organization

A contact records a person's name and communication details inside one organization.

A party can have several contact people while one assignment is designated primary.

Contact history stays meaningful to documents even if a party is later deactivated.

### REQ-DOM-CONTACT-002: Vendor Contact for vendor customer assignments

Vendor and customer contact assignments identify the related party and allow exactly one primary contact for that party.

A party can have several contact people while one assignment is designated primary.

Contacts are distinct from the vendor or customer whose relationship they represent.

## REQ-DOM-ATTACHMENT: Attachments

For Attachment, an attachment is scoped to an organization and is linked to a concrete business record. Attachment identity and metadata remain distinct from the document's own lifecycle and structured fields.

Together, removing or deactivating a business party does not silently erase retained document evidence. undefined

### REQ-DOM-ATTACHMENT-001: Records file identity, descriptive metadata, uploader

An attachment records file identity, descriptive metadata, uploader, and its concrete operational target.

Attachment identity and metadata remain distinct from the document's own lifecycle and structured fields.

An attachment is scoped to an organization and is linked to a concrete business record.

### REQ-DOM-ATTACHMENT-002: Attachments Attachment for attachments supplement explicit

Attachments supplement explicit ERP concepts and never replace their structured business information.

An attachment is scoped to an organization and is linked to a concrete business record.

Attachment identity and metadata remain distinct from the document's own lifecycle and structured fields.

## REQ-DOM-COMMENT: Comments

For Comment, a comment is attributed to a User and organization at a point in time. Comments provide discussion context while not becoming a generic operational document.

Together, comments follow the visibility of their target and stay distinct from immutable audit history. undefined

### REQ-DOM-COMMENT-001: Records author, timestamp, body, organization

A comment records author, timestamp, body, organization, and one concrete target record.

A comment is attributed to a User and organization at a point in time.

Comments follow the visibility of their target and stay distinct from immutable audit history.

### REQ-DOM-COMMENT-002: Comments Comment for comments enrich target

Comments enrich a target record but do not define its business state or replace its audit history.

Comments follow the visibility of their target and stay distinct from immutable audit history.

Comments provide discussion context while not becoming a generic operational document.

## REQ-DOM-TAG: Tags

For Tag, tags provide reusable classification inside one organization. A tag can label several concrete business records and a record can carry several tags.

Together, tagging never changes the target's lifecycle, accounting, inventory, or authority semantics. undefined

### REQ-DOM-TAG-001: Records an organization-scoped label and optional description

A tag records an organization-scoped label and optional description.

A tag can label several concrete business records and a record can carry several tags.

Tags provide reusable classification inside one organization.

### REQ-DOM-TAG-002: Records without replacing their categories or statuses

Tag assignments relate tags to explicit business records without replacing their categories or statuses.

A tag can label several concrete business records and a record can carry several tags.

Tags provide reusable classification inside one organization.

## REQ-DOM-CUSTOMFIELD: Custom Fields

For Custom Field, a custom-field definition identifies its target concept and value meaning. Each value is scoped to a concrete target record and keeps the definition used to interpret it.

Together, custom fields extend explicit domain concepts while not creating a catch-all substitute for their required attributes. undefined

### REQ-DOM-CUSTOMFIELD-001: Records its organization, target concept, label, value kind

A custom-field definition records its organization, target concept, label, value kind, and active status.

A custom-field definition identifies its target concept and value meaning.

Each value is scoped to a concrete target record and keeps the definition used to interpret it.

### REQ-DOM-CUSTOMFIELD-002: Links one definition to one concrete business record

A custom-field value links one definition to one concrete business record.

A custom-field definition identifies its target concept and value meaning.

Each value is scoped to a concrete target record and keeps the definition used to interpret it.

### REQ-DOM-CUSTOMFIELD-003: Custom Custom Field for fields supplement rather

Custom fields supplement rather than replace the source-defined attributes and relationships of their target.

Custom fields extend explicit domain concepts while not creating a catch-all substitute for their required attributes.

A custom-field definition identifies its target concept and value meaning.

## REQ-DOM-CURRENCY: Currencies

For Currency, each monetary value couples an amount with a currency instead of assuming the organization base currency. An organization designates one base currency while transactions can use others.

Together, foreign-currency amounts retain the conversion context used for posting and reporting. undefined

### REQ-DOM-CURRENCY-001: Records its code, name

A currency records its code, name, and monetary precision for use by organization-scoped business records.

Each monetary value couples an amount with a currency instead of assuming the organization base currency.

An organization designates one base currency while transactions can use others.

### REQ-DOM-CURRENCY-002: Every monetary amount identifies its transaction currency

Every monetary amount identifies its transaction currency, and each organization identifies one base currency.

Each monetary value couples an amount with a currency instead of assuming the organization base currency.

An organization designates one base currency while transactions can use others.

## REQ-DOM-EXCHANGE-RATE: Exchange Rates

For Exchange Rate, an exchange rate is scoped to one organization, ordered currency pair, and effective date. Posting selects one rate from the document's business date and keeps the exact rate used.

Together, automated refresh and manual maintenance both create traceable effective rates instead of rewriting posted conversions. undefined

### REQ-DOM-EXCHANGE-RATE-001: An Exchange Rate for identifies source currency

An exchange rate identifies the source currency, target currency, effective date, rate, organization, and origin.

An exchange rate is scoped to one organization, ordered currency pair, and effective date.

Posting selects one rate from the document's business date and keeps the exact rate used.

### REQ-DOM-EXCHANGE-RATE-002: Exchange Rate the exact exchange rate used even if later rates change

A foreign-currency posting retains the exact exchange rate used even if later rates change.

Posting selects one rate from the document's business date and keeps the exact rate used.

An exchange rate is scoped to one organization, ordered currency pair, and effective date.

## REQ-DOM-PAYMENT-TERM: Payment Terms

For Payment Term, payment terms are organization-scoped commercial reference data. A party can supply a default term while a document keeps the term chosen for that transaction.

Together, term meaning controls due dates while not changing the party's identity. undefined

### REQ-DOM-PAYMENT-TERM-001: Records its organization, name, due-date convention

A payment term records its organization, name, due-date convention, and active status.

Payment terms are organization-scoped commercial reference data.

A party can supply a default term while a document keeps the term chosen for that transaction.

### REQ-DOM-PAYMENT-TERM-002: Customers, vendors, purchase orders, bills, sales orders

Customers, vendors, purchase orders, bills, sales orders, and invoices retain the payment term selected for them.

Payment terms are organization-scoped commercial reference data.

A party can supply a default term while a document keeps the term chosen for that transaction.

## REQ-DOM-TAX-JURISDICTION: Tax Jurisdictions

For Tax Jurisdiction, a tax jurisdiction is organization-scoped configuration for applicable tax treatment and filing. Tax codes and returns belong to a jurisdiction while transactions choose treatment from party and item facts.

Together, jurisdiction identity stays distinct from individual rates and transaction calculations. undefined

### REQ-DOM-TAX-JURISDICTION-001: Records its organization, name, territorial identity

A tax jurisdiction records its organization, name, territorial identity, and active status.

A tax jurisdiction is organization-scoped configuration for applicable tax treatment and filing.

Jurisdiction identity stays distinct from individual rates and transaction calculations.

### REQ-DOM-TAX-JURISDICTION-002: Tax codes, rates, party locations

Tax codes, rates, party locations, and tax returns relate to the jurisdiction whose rules apply.

Tax codes and returns belong to a jurisdiction while transactions choose treatment from party and item facts.

Jurisdiction identity stays distinct from individual rates and transaction calculations.

## REQ-DOM-TAX-CODE: Tax Codes and Rates

For Tax Code, a tax code is scoped to one jurisdiction and identifies a tax treatment instead of a posted amount. Sales tax, output VAT, input VAT, withholding tax, import duty, and payroll tax stay recognizable code types.

Together, effective rates keep historical calculation meaning across transaction dates. undefined

### REQ-DOM-TAX-CODE-001: Records its jurisdiction, type, name, payable or receivable account relationship

A tax code records its jurisdiction, type, name, payable or receivable account relationship, and active status.

A tax code is scoped to one jurisdiction and identifies a tax treatment instead of a posted amount.

Sales tax, output VAT, input VAT, withholding tax, import duty, and payroll tax stay recognizable code types.

### REQ-DOM-TAX-CODE-002: Effective tax rates belong to one code and date range

Effective tax rates belong to one code and date range.

Effective rates keep historical calculation meaning across transaction dates.

A tax code is scoped to one jurisdiction and identifies a tax treatment instead of a posted amount.

### REQ-DOM-TAX-CODE-003: Tax Code allowed-value catalog

The allowed code types are sales tax, output VAT, input VAT, withholding tax, import duty, and payroll tax.

Sales tax, output VAT, input VAT, withholding tax, import duty, and payroll tax stay recognizable code types.

A tax code is scoped to one jurisdiction and identifies a tax treatment instead of a posted amount.

## REQ-DOM-UOM: Units of Measure

For Unit of Measure, a unit of measure gives quantities a consistent business meaning. Items identify a default unit while request, order, receipt, production, and sales lines retain the unit used.

Together, unit identity stays distinguish from item identity and stock quantity. undefined

### REQ-DOM-UOM-001: Records its organization, code, name, category

A unit of measure records its organization, code, name, category, and active status.

A unit of measure gives quantities a consistent business meaning.

Items identify a default unit while request, order, receipt, production, and sales lines retain the unit used.

### REQ-DOM-UOM-002: Item and document quantities retain their selected unit of measure

Item and document quantities retain their selected unit of measure.

A unit of measure gives quantities a consistent business meaning.

Items identify a default unit while request, order, receipt, production, and sales lines retain the unit used.

## REQ-DOM-DOC-NUMBER: Document Number Sequences

For Document Number Sequence, each organization configures an independent sequence for each operational document type. An issued number becomes the stable human identity of its document.

Together, sequence advancement by a User or System principal keeps uniqueness within its organization and type. undefined

### REQ-DOM-DOC-NUMBER-001: A Document Number Sequence for identifies type convention

A document number sequence identifies its organization, document type, convention, current progression, and active status.

Each organization configures an independent sequence for each operational document type.

Sequence advancement by a User or System principal keeps uniqueness within its organization and type.

### REQ-DOM-DOC-NUMBER-002: Document Number Sequence one issued number that is unique within its organization

Each operational document retains one issued number that is unique within its organization and document type.

Each organization configures an independent sequence for each operational document type.

An issued number becomes the stable human identity of its document.

## REQ-DOM-FISCAL-CALENDAR: Fiscal Calendars

For Fiscal Calendar, one organization's fiscal calendar partitions business dates into fiscal years and periods. The configured fiscal start month controls year alignment while not changing historical posted dates.

Together, periods, budgets, depreciation schedules, tax work, and reports reference the same calendar. undefined

### REQ-DOM-FISCAL-CALENDAR-001: Records the organization's fiscal start month and its fiscal-year pattern

A fiscal calendar records the organization's fiscal start month and its fiscal-year pattern.

The configured fiscal start month controls year alignment while not changing historical posted dates.

One organization's fiscal calendar partitions business dates into fiscal years and periods.

### REQ-DOM-FISCAL-CALENDAR-002: Reports relate to the applicable calendar interval

Fiscal periods, budgets, depreciation, tax returns, postings, and reports relate to the applicable calendar interval.

Periods, budgets, depreciation schedules, tax work, and reports reference the same calendar.

One organization's fiscal calendar partitions business dates into fiscal years and periods.

## REQ-DOM-NOTIFICATION-PREFERENCE: Notification Preferences

For Notification Preference, preferences belong to a user inside an organization because responsibilities differ by membership. Preferences select ordinary notification categories and delivery choices while mandatory high-risk notices stay governed by risk policy.

Together, preference changes affect future dispatch while not rewriting past notification history. undefined

### REQ-DOM-NOTIFICATION-PREFERENCE-001: A Notification Preference for relates user membership

A notification preference relates one user membership to notification categories and chosen delivery options.

Preferences select ordinary notification categories and delivery choices while mandatory high-risk notices stay governed by risk policy.

Preferences belong to a user inside an organization because responsibilities differ by membership.

### REQ-DOM-NOTIFICATION-PREFERENCE-002: High-risk Notification Preference for high risk notices

High-risk notices to Owners and relevant managers remain mandatory even when ordinary preferences are disabled.

Preferences select ordinary notification categories and delivery choices while mandatory high-risk notices stay governed by risk policy.

Preferences belong to a user inside an organization because responsibilities differ by membership.

## REQ-DOM-ACCOUNT: Ledger Account Lifecycle

For Ledger Account, each organization owns a chart whose accounts classify assets, liabilities, equity, revenue, and expenses. Account identity and hierarchy guide posting while operational dimensions stay on journal lines.

Together, active use, deactivation, and approved merge keep posted history instead of deleting it. Setup seeds the standard source-named categories so every core module has posting destinations.

### REQ-DOM-ACCOUNT-001: Ledger Account code

A ledger account retains code, name, type, optional parent, currency, active status, description, and organization.

Each organization owns a chart whose accounts classify assets, liabilities, equity, revenue, and expenses.

Account identity and hierarchy guide posting while operational dimensions stay on journal lines.

### REQ-DOM-ACCOUNT-002: Organization setup seeds the source-defined asset, liability, equity, revenue

Organization setup seeds the source-defined asset, liability, equity, revenue, and expense account categories.

Setup seeds the standard source-named categories so every core module has posting destinations.

Each organization owns a chart whose accounts classify assets, liabilities, equity, revenue, and expenses.

### REQ-DOM-ACCOUNT-003: An active account may become deactivated without changing its posted journal history

An active account may become deactivated without changing its posted journal history.

Active use, deactivation, and approved merge keep posted history instead of deleting it.

Account identity and hierarchy guide posting while operational dimensions stay on journal lines.

### REQ-DOM-ACCOUNT-004: An Ledger Account for approved merge source

An approved account merge preserves the source account's historical entry relationships under the surviving account.

Active use, deactivation, and approved merge keep posted history instead of deleting it.

Account identity and hierarchy guide posting while operational dimensions stay on journal lines.

### REQ-DOM-ACCOUNT-005: A ledger account with no posted entries may be deleted

A ledger account with no posted entries may be deleted, while one with posted entries remains retained.

Account identity and hierarchy guide posting while operational dimensions stay on journal lines.

Active use, deactivation, and approved merge keep posted history instead of deleting it.

## REQ-DOM-JOURNAL: Journal Entry Lifecycle

For Journal Entry, a journal entry is the accounting result of a manual or source-module financial transaction. Lines retain transaction and base-currency amounts plus operational dimensions that connect finance to the business event.

Together, draft, approval, posting, reversal, void, and adjustment states distinguish editable intent from immutable financial history. Creator, approver, poster, and reverser attribution follows the entry across its lifecycle.

### REQ-DOM-JOURNAL-001: Journal Entry source module

A journal entry retains source module, source document, memo, organization, date, fiscal period, lifecycle status, and creator, approver, poster, and reverser attribution.

Creator, approver, poster, and reverser attribution follows the entry across its lifecycle.

A journal entry is the accounting result of a manual or source-module financial transaction.

### REQ-DOM-JOURNAL-002: Journal lines retain account, debit, credit, currency, exchange rate

Journal lines retain account, debit, credit, currency, exchange rate, and department, project, cost center, profit center, customer, vendor, employee, item, warehouse, and tax-code dimensions.

Lines retain transaction and base-currency amounts plus operational dimensions that connect finance to the business event.

A journal entry is the accounting result of a manual or source-module financial transaction.

### REQ-DOM-JOURNAL-003: A draft journal remains editable and deletable before posting

A draft journal remains editable and deletable before posting.

Draft, approval, posting, reversal, void, and adjustment states distinguish editable intent from immutable financial history.

A journal entry is the accounting result of a manual or source-module financial transaction.

### REQ-DOM-JOURNAL-004: Becomes posted only after its base-currency debits and credits balance

An optionally approved journal becomes posted only after its base-currency debits and credits balance.

Lines retain transaction and base-currency amounts plus operational dimensions that connect finance to the business event.

A journal entry is the accounting result of a manual or source-module financial transaction.

### REQ-DOM-JOURNAL-005: A Journal Entry for posted immutable corrected

A posted journal is immutable and may be corrected by a linked reversal or a new adjustment entry.

Draft, approval, posting, reversal, void, and adjustment states distinguish editable intent from immutable financial history.

A journal entry is the accounting result of a manual or source-module financial transaction.

### REQ-DOM-JOURNAL-006: A reversible posted journal may become reversed

A reversible posted journal may become reversed, while voiding preserves its identity and correction history.

A journal entry is the accounting result of a manual or source-module financial transaction.

Draft, approval, posting, reversal, void, and adjustment states distinguish editable intent from immutable financial history.

## REQ-DOM-FISCAL-PERIOD: Fiscal Period Lifecycle

For Fiscal Period, fiscal periods belong to a fiscal year aligned to the organization's configured start month. Open, soft-closed, hard-closed, and reopened states determine what business posting and correction is possible.

Together, close validation and frozen snapshots relate the period state to unresolved module work and reproducible reporting. Reopening is a recorded exception that keeps the prior close instead of erasing it.

### REQ-DOM-FISCAL-PERIOD-001: Fiscal Period start date

A fiscal period belongs to one fiscal year and retains start date, end date, status, and organization.

Fiscal periods belong to a fiscal year aligned to the organization's configured start month.

Close validation and frozen snapshots relate the period state to unresolved module work and reproducible reporting.

### REQ-DOM-FISCAL-PERIOD-002: An open period may become soft-closed after close preparation begins

An open period may become soft-closed after close preparation begins.

Open, soft-closed, hard-closed, and reopened states determine what business posting and correction is possible.

Close validation and frozen snapshots relate the period state to unresolved module work and reproducible reporting.

### REQ-DOM-FISCAL-PERIOD-003: A validated soft-closed period may become hard-closed and receive immutable closing snapshots

A validated soft-closed period may become hard-closed and receive immutable closing snapshots.

Open, soft-closed, hard-closed, and reopened states determine what business posting and correction is possible.

Close validation and frozen snapshots relate the period state to unresolved module work and reproducible reporting.

### REQ-DOM-FISCAL-PERIOD-004: Changes a hard-closed period to reopened

An approved Owner request with a reason changes a hard-closed period to reopened while retaining its prior close history.

Open, soft-closed, hard-closed, and reopened states determine what business posting and correction is possible.

Close validation and frozen snapshots relate the period state to unresolved module work and reproducible reporting.

### REQ-DOM-FISCAL-PERIOD-005: A reopened period can be corrected and then closed again as a new close cycle

A reopened period can be corrected and then closed again as a new close cycle.

Open, soft-closed, hard-closed, and reopened states determine what business posting and correction is possible.

Close validation and frozen snapshots relate the period state to unresolved module work and reproducible reporting.

## REQ-DOM-CLOSE-SNAPSHOT: Closing Snapshots

For Closing Snapshot, a closing snapshot is scoped to one hard-close cycle and one named financial or operational view. Snapshots keep values as of close even when a period is later reopened and reclosed.

Together, hard-period reporting selects the matching snapshot version instead of current mutable activity. undefined

### REQ-DOM-CLOSE-SNAPSHOT-001: Closing Snapshot its organization

A closing snapshot retains its organization, fiscal period, close cycle, report kind, dimensions, balances, and creation attribution.

A closing snapshot is scoped to one hard-close cycle and one named financial or operational view.

Snapshots keep values as of close even when a period is later reopened and reclosed.

### REQ-DOM-CLOSE-SNAPSHOT-002: Snapshot Closing Snapshot for kinds include trial

Snapshot kinds include trial balance, balance sheet, profit and loss, inventory valuation, AR aging, AP aging, cash balances, budget actuals, and tax summary.

A closing snapshot is scoped to one hard-close cycle and one named financial or operational view.

Hard-period reporting selects the matching snapshot version instead of current mutable activity.

## REQ-DOM-BANK-ACCOUNT: Bank Accounts

For Bank Account, a bank account is scoped to one organization and one currency. Its linked ledger account connects statement activity to financial posting.

Together, opening balance and reconciliation state provide the continuity needed for statement periods and payments. undefined

### REQ-DOM-BANK-ACCOUNT-001: Bank Account organization

A bank account retains organization, financial-institution identity, account reference, currency, opening balance, linked ledger account, active status, and reconciliation state.

A bank account is scoped to one organization and one currency.

Its linked ledger account connects statement activity to financial posting.

### REQ-DOM-BANK-ACCOUNT-002: Customer, vendor

Customer, vendor, and payroll payments plus bank transfers reference the bank account through which cash moved.

A bank account is scoped to one organization and one currency.

Its linked ledger account connects statement activity to financial posting.

## REQ-DOM-BANK-TRANSACTION: Bank Transaction Lifecycle

For Bank Transaction, a bank transaction is statement activity inside one organization and bank account. Imported, matched, ignored, and reconciled states distinguish unresolved cash evidence from final settlement.

Together, matches can connect the transaction to customer, vendor, payroll, journal, transfer, or adjustment activity. Ignoring and matching keep the original statement line for later audit and reconciliation.

### REQ-DOM-BANK-TRANSACTION-001: Bank Transaction bank account

A bank transaction retains bank account, statement date, amount, currency, description, reference, origin, and lifecycle status.

A bank transaction is statement activity inside one organization and bank account.

Matches can connect the transaction to customer, vendor, payroll, journal, transfer, or adjustment activity.

### REQ-DOM-BANK-TRANSACTION-002: An imported or manually recorded transaction begins unresolved in imported status

An imported or manually recorded transaction begins unresolved in imported status.

Imported, matched, ignored, and reconciled states distinguish unresolved cash evidence from final settlement.

A bank transaction is statement activity inside one organization and bank account.

### REQ-DOM-BANK-TRANSACTION-003: Matches Bank Transaction for operator matches eligible

An operator matches a transaction to eligible customer payments, vendor payments, payroll payments, journal entries, transfers, or adjustments.

Matches can connect the transaction to customer, vendor, payroll, journal, transfer, or adjustment activity.

A bank transaction is statement activity inside one organization and bank account.

### REQ-DOM-BANK-TRANSACTION-004: An operator may mark a transaction ignored without deleting its statement evidence

An operator may mark a transaction ignored without deleting its statement evidence.

A bank transaction is statement activity inside one organization and bank account.

Imported, matched, ignored, and reconciled states distinguish unresolved cash evidence from final settlement.

### REQ-DOM-BANK-TRANSACTION-005: Changes included transactions to reconciled

A completed reconciliation changes included transactions to reconciled while preserving their matches.

Imported, matched, ignored, and reconciled states distinguish unresolved cash evidence from final settlement.

Matches can connect the transaction to customer, vendor, payroll, journal, transfer, or adjustment activity.

## REQ-DOM-RECONCILIATION: Bank Reconciliation Lifecycle

For Bank Reconciliation, a reconciliation is scoped to one bank account and statement period. Beginning balance, ending balance, included lines, and operator connect statement evidence to ledger cash.

Together, completion freezes the reconciliation result; reopening is a distinguish approved correction path. Reopening keeps the completed version and its audit attribution.

### REQ-DOM-RECONCILIATION-001: Bank Reconciliation statement period

A bank reconciliation retains statement period, beginning balance, ending balance, included transaction lines, bank account, operator, and status.

Beginning balance, ending balance, included lines, and operator connect statement evidence to ledger cash.

A reconciliation is scoped to one bank account and statement period.

### REQ-DOM-RECONCILIATION-002: Becomes completed only when its statement lines and balances are resolved

An in-progress reconciliation becomes completed only when its statement lines and balances are resolved.

A reconciliation is scoped to one bank account and statement period.

Beginning balance, ending balance, included lines, and operator connect statement evidence to ledger cash.

### REQ-DOM-RECONCILIATION-003: A completed reconciliation is immutable

A completed reconciliation is immutable.

A reconciliation is scoped to one bank account and statement period.

Completion freezes the reconciliation result; reopening is a distinguish approved correction path.

### REQ-DOM-RECONCILIATION-004: An approved reopen action restores correction access

An approved reopen action restores correction access while preserving the prior completion and audit event.

Completion freezes the reconciliation result; reopening is a distinguish approved correction path.

Reopening keeps the completed version and its audit attribution.

## REQ-DOM-TAX-RETURN: Tax Return Lifecycle

For Tax Return, a tax return is scoped to an organization, jurisdiction, and fiscal or tax period. Preparation and review attribution stay distinct from filing.

Together, filed values reconcile to posted journals and their source sales, purchase, payroll, and import activity. An amendment is a new version linked to the filing it corrects.

### REQ-DOM-TAX-RETURN-001: Tax Return jurisdiction

A tax return retains jurisdiction, period, due date, preparer, reviewer, filing date, status, and detailed tax lines.

A tax return is scoped to an organization, jurisdiction, and fiscal or tax period.

Preparation and review attribution stay distinct from filing.

### REQ-DOM-TAX-RETURN-002: A prepared return may progress through review to filed status

A prepared return may progress through review to filed status.

A tax return is scoped to an organization, jurisdiction, and fiscal or tax period.

Preparation and review attribution stay distinct from filing.

### REQ-DOM-TAX-RETURN-003: A filed return is immutable

A filed return is immutable.

A tax return is scoped to an organization, jurisdiction, and fiscal or tax period.

Filed values reconcile to posted journals and their source sales, purchase, payroll, and import activity.

### REQ-DOM-TAX-RETURN-004: Creates a new version that references the original filed return and preserves both histories

An amendment creates a new version that references the original filed return and preserves both histories.

An amendment is a new version linked to the filing it corrects.

A tax return is scoped to an organization, jurisdiction, and fiscal or tax period.

## REQ-DOM-VENDOR: Vendor Lifecycle

For Vendor, a vendor is an organization-scoped external party and never an authenticating user. Commercial identity, terms, addresses, contacts, risk, and bank relationships support purchasing and payment.

Together, active and deactivated states keep historical purchase links while controlling future selection. Sensitive bank details change through approval history instead of silent replacement.

### REQ-DOM-VENDOR-001: Vendor legal

A vendor retains legal and operational identity, contact details, payment terms, currency, billing and shipping addresses, bank accounts, status, risk classification, and notes.

Commercial identity, terms, addresses, contacts, risk, and bank relationships support purchasing and payment.

Sensitive bank details change through approval history instead of silent replacement.

### REQ-DOM-VENDOR-002: A vendor relates to several contact people and identifies exactly one as primary

A vendor relates to several contact people and identifies exactly one as primary.

A vendor is an organization-scoped external party and never an authenticating user.

Commercial identity, terms, addresses, contacts, risk, and bank relationships support purchasing and payment.

### REQ-DOM-VENDOR-003: An active vendor may become deactivated

An active vendor may become deactivated while retaining all historical purchase documents.

Active and deactivated states keep historical purchase links while controlling future selection.

A vendor is an organization-scoped external party and never an authenticating user.

### REQ-DOM-VENDOR-004: A vendor without purchase history may be deleted

A vendor without purchase history may be deleted, while one with history remains retained in deactivated form.

Active and deactivated states keep historical purchase links while controlling future selection.

A vendor is an organization-scoped external party and never an authenticating user.

### REQ-DOM-VENDOR-005: Changes retain their before and after values, requester, approver, reason, timestamp

Vendor bank-account changes retain their before and after values, requester, approver, reason, timestamp, and audit relation.

A vendor is an organization-scoped external party and never an authenticating user.

Commercial identity, terms, addresses, contacts, risk, and bank relationships support purchasing and payment.

## REQ-DOM-PURCHASE-REQUEST: Purchase Request Lifecycle

For Purchase Request, a purchase request captures employee demand before commitment to a vendor. Header and line context connect need, budget, department, project, account, item or service, and preferred vendor.

Together, draft, submitted, approval outcomes, change return, cancellation, and conversion distinguish editable intent from authorized sourcing. Each line keeps its original quantity and the portion still available for conversion.

### REQ-DOM-PURCHASE-REQUEST-001: Purchase Request requester

A purchase request retains requester, department, project, needed-by date, justification, currency, estimated total, lines, approval history, number, organization, and status.

A purchase request captures employee demand before commitment to a vendor.

Header and line context connect need, budget, department, project, account, item or service, and preferred vendor.

### REQ-DOM-PURCHASE-REQUEST-002: Purchase Request item or service description

Each request line retains item or service description, quantity, unit, estimated unit cost, preferred vendor, expense account, project, cost center, required date, converted quantity, and remaining quantity.

Header and line context connect need, budget, department, project, account, item or service, and preferred vendor.

Each line keeps its original quantity and the portion still available for conversion.

### REQ-DOM-PURCHASE-REQUEST-003: A requester-owned draft may become submitted and locked

A requester-owned draft may become submitted and locked.

Draft, submitted, approval outcomes, change return, cancellation, and conversion distinguish editable intent from authorized sourcing.

A purchase request captures employee demand before commitment to a vendor.

### REQ-DOM-PURCHASE-REQUEST-004: A submitted request may become approved, rejected, returned for changes, or cancelled

A submitted request may become approved, rejected, returned for changes, or cancelled.

A purchase request captures employee demand before commitment to a vendor.

Draft, submitted, approval outcomes, change return, cancellation, and conversion distinguish editable intent from authorized sourcing.

### REQ-DOM-PURCHASE-REQUEST-005: Becomes editable draft again

A returned request becomes editable draft again while preserving its approval history.

Draft, submitted, approval outcomes, change return, cancellation, and conversion distinguish editable intent from authorized sourcing.

A purchase request captures employee demand before commitment to a vendor.

### REQ-DOM-PURCHASE-REQUEST-006: An Purchase Request for approved become partly

An approved request may become partly or fully converted into one or more linked purchase orders.

A purchase request captures employee demand before commitment to a vendor.

Header and line context connect need, budget, department, project, account, item or service, and preferred vendor.

## REQ-DOM-PURCHASE-ORDER: Purchase Order Lifecycle

For Purchase Order, a purchase order can originate from approved request lines or from authorized direct purchasing. Commercial terms and quantities are preserved together with approval and controlled change history.

Together, receipt and billing progress advance independently at line level and retain remaining quantities. Approval locks the agreed order; later correction uses a change order, return, reversal, or cancellation path.

### REQ-DOM-PURCHASE-ORDER-001: Purchase Order vendor

A purchase order retains vendor, dates, currency, posting exchange rate, payment terms, billing and shipping addresses, source request links, approval history, change-order history, number, organization, and status.

Commercial terms and quantities are preserved together with approval and controlled change history.

A purchase order can originate from approved request lines or from authorized direct purchasing.

### REQ-DOM-PURCHASE-ORDER-002: Purchase Order item

Each order line retains item, description, ordered, received, billed and remaining quantities, unit price, tax code, warehouse, expense account, project, cost center, and line status.

Receipt and billing progress advance independently at line level and retain remaining quantities.

A purchase order can originate from approved request lines or from authorized direct purchasing.

### REQ-DOM-PURCHASE-ORDER-003: A draft order may be routed, approved, rejected, or returned for changes

A draft order may be routed, approved, rejected, or returned for changes.

A purchase order can originate from approved request lines or from authorized direct purchasing.

Approval locks the agreed order; later correction uses a change order, return, reversal, or cancellation path.

### REQ-DOM-PURCHASE-ORDER-004: An Purchase Order for approved become sent

An approved order may become sent and then partly or fully received and billed along independent progress axes.

A purchase order can originate from approved request lines or from authorized direct purchasing.

Receipt and billing progress advance independently at line level and retain remaining quantities.

### REQ-DOM-PURCHASE-ORDER-005: A controlled change order preserves before and after values, requester, approver, reason

A controlled change order preserves before and after values, requester, approver, reason, and timestamp without rewriting approved history.

Commercial terms and quantities are preserved together with approval and controlled change history.

A purchase order can originate from approved request lines or from authorized direct purchasing.

### REQ-DOM-PURCHASE-ORDER-006: A resolved order may become closed

A resolved order may become closed, while an eligible unreceived order may become cancelled.

A purchase order can originate from approved request lines or from authorized direct purchasing.

Approval locks the agreed order; later correction uses a change order, return, reversal, or cancellation path.

## REQ-DOM-PURCHASE-RECEIPT: Purchase Receipt Lifecycle

For Purchase Receipt, a purchase receipt is scoped to a source purchase order and consumes its remaining receivable quantity. Lines distinguish received, accepted, and rejected quantity at the warehouse, location, lot, and serial boundary.

Together, posting converts receiving evidence into immutable stock movements and purchase-order progress. Corrections are distinct returns or adjustments that keep the original receipt.

### REQ-DOM-PURCHASE-RECEIPT-001: Purchase Receipt its purchase order

A purchase receipt retains its purchase order, number, organization, receipt date, operator, status, and posting attribution.

A purchase receipt is scoped to a source purchase order and consumes its remaining receivable quantity.

Posting converts receiving evidence into immutable stock movements and purchase-order progress.

### REQ-DOM-PURCHASE-RECEIPT-002: Purchase Receipt the source order line

Each receipt line retains the source order line, ordered, received, accepted and rejected quantities, item, lot or serial, warehouse, and location.

Lines distinguish received, accepted, and rejected quantity at the warehouse, location, lot, and serial boundary.

A purchase receipt is scoped to a source purchase order and consumes its remaining receivable quantity.

### REQ-DOM-PURCHASE-RECEIPT-003: Becomes posted and creates source-linked stock movements for inventory items

A draft receipt becomes posted and creates source-linked stock movements for inventory items.

A purchase receipt is scoped to a source purchase order and consumes its remaining receivable quantity.

Posting converts receiving evidence into immutable stock movements and purchase-order progress.

### REQ-DOM-PURCHASE-RECEIPT-004: A Purchase Receipt for posted remains immutable

A posted receipt remains immutable and is corrected only through a linked purchase return or inventory adjustment.

A purchase receipt is scoped to a source purchase order and consumes its remaining receivable quantity.

Posting converts receiving evidence into immutable stock movements and purchase-order progress.

## REQ-DOM-PURCHASE-RETURN: Purchase Returns

For Purchase Return, a purchase return references the purchase receipt and order quantities it reverses. Return lines retain item, quantity, warehouse, location, lot, and serial traceability.

Together, posting decreases stock and restores purchase-order receiving remainder. Financial settlement proceeds through a vendor credit or bill adjustment instead of changing the receipt.

### REQ-DOM-PURCHASE-RETURN-001: Purchase Return its source receipt

A purchase return retains its source receipt and purchase order, reason, status, organization, operator, and return lines.

A purchase return references the purchase receipt and order quantities it reverses.

Return lines retain item, quantity, warehouse, location, lot, and serial traceability.

### REQ-DOM-PURCHASE-RETURN-002: Creates outbound stock movements and reduces the source order's received quantity

Posting a purchase return creates outbound stock movements and reduces the source order's received quantity.

Posting decreases stock and restores purchase-order receiving remainder.

A purchase return references the purchase receipt and order quantities it reverses.

### REQ-DOM-PURCHASE-RETURN-003: Links to the resulting vendor credit or vendor-bill adjustment

A posted return links to the resulting vendor credit or vendor-bill adjustment.

Financial settlement proceeds through a vendor credit or bill adjustment instead of changing the receipt.

A purchase return references the purchase receipt and order quantities it reverses.

## REQ-DOM-VENDOR-BILL: Vendor Bill Lifecycle

For Vendor Bill, a vendor bill can originate from purchase orders, receipts, or both and keeps line-level matching links. Draft, approval, posting, partial or full payment, dispute, and void states distinguish payable intent from accounting history.

Together, posting creates accounts-payable and expense or inventory-accrual effects. Three-way match evidence stays attached to the bill and routes material variance for approval.

### REQ-DOM-VENDOR-BILL-001: Vendor Bill vendor

A vendor bill retains vendor, source orders and receipts, currency, number, dates, terms, lines, match result, approval history, organization, and status.

A vendor bill can originate from purchase orders, receipts, or both and keeps line-level matching links.

Three-way match evidence stays attached to the bill and routes material variance for approval.

### REQ-DOM-VENDOR-BILL-002: Vendor Bill matched order

Each bill line retains matched order and receipt lines, quantity, price, tax code, expense or inventory account, and unmatched variance.

A vendor bill can originate from purchase orders, receipts, or both and keeps line-level matching links.

Posting creates accounts-payable and expense or inventory-accrual effects.

### REQ-DOM-VENDOR-BILL-003: A draft bill may be routed, approved, rejected, or returned for changes

A draft bill may be routed, approved, rejected, or returned for changes.

A vendor bill can originate from purchase orders, receipts, or both and keeps line-level matching links.

Draft, approval, posting, partial or full payment, dispute, and void states distinguish payable intent from accounting history.

### REQ-DOM-VENDOR-BILL-004: An Vendor Bill for approved become posted

An approved bill may become posted and create source-linked accounts-payable and expense or inventory-accrual journal entries.

Posting creates accounts-payable and expense or inventory-accrual effects.

A vendor bill can originate from purchase orders, receipts, or both and keeps line-level matching links.

### REQ-DOM-VENDOR-BILL-005: A posted bill may become partly or fully paid through payment allocations

A posted bill may become partly or fully paid through payment allocations.

A vendor bill can originate from purchase orders, receipts, or both and keeps line-level matching links.

Draft, approval, posting, partial or full payment, dispute, and void states distinguish payable intent from accounting history.

### REQ-DOM-VENDOR-BILL-006: A bill may enter disputed status until resolution

A bill may enter disputed status until resolution, and an eligible bill may be voided without erasing its history.

A vendor bill can originate from purchase orders, receipts, or both and keeps line-level matching links.

Draft, approval, posting, partial or full payment, dispute, and void states distinguish payable intent from accounting history.

## REQ-DOM-VENDOR-PAYMENT: Vendor Payments

For Vendor Payment, a vendor payment is scoped to one organization, vendor, currency, and cash or bank source. Payment allocations connect one payment to one or more bills and keep partial settlement.

Together, posting reduces accounts payable and the selected cash or bank balance. The payment keeps source links for reconciliation, reversal, and audit.

### REQ-DOM-VENDOR-PAYMENT-001: Vendor Payment vendor

A vendor payment retains vendor, payment date, amount, currency, bank or cash account, reference, status, organization, and posting attribution.

A vendor payment is scoped to one organization, vendor, currency, and cash or bank source.

Posting reduces accounts payable and the selected cash or bank balance.

### REQ-DOM-VENDOR-PAYMENT-002: Payment Vendor Payment for allocations relate more

Payment allocations relate one vendor payment to one or more bills and retain the amount applied to each.

Payment allocations connect one payment to one or more bills and keep partial settlement.

A vendor payment is scoped to one organization, vendor, currency, and cash or bank source.

### REQ-DOM-VENDOR-PAYMENT-003: Creates source-linked accounts-payable reduction and cash or bank decrease

Posting the payment creates source-linked accounts-payable reduction and cash or bank decrease.

Posting reduces accounts payable and the selected cash or bank balance.

A vendor payment is scoped to one organization, vendor, currency, and cash or bank source.

## REQ-DOM-VENDOR-CREDIT: Vendor Credits

For Vendor Credit, a vendor credit keeps the purchase return or bill correction that created it. The credit stays an available supplier balance until applied or refunded.

Together, applications reduce bill balances while refunds create cash movement. Source links keep the correction chain back to receipt, order, and bill.

### REQ-DOM-VENDOR-CREDIT-001: Vendor Credit vendor

A vendor credit retains vendor, source return or bill adjustment, amount, currency, reason, remaining balance, organization, and status.

A vendor credit keeps the purchase return or bill correction that created it.

The credit stays an available supplier balance until applied or refunded.

### REQ-DOM-VENDOR-CREDIT-002: Links the credit to one or more vendor bills and reduces their payable balance

A credit application links the credit to one or more vendor bills and reduces their payable balance.

A vendor credit keeps the purchase return or bill correction that created it.

The credit stays an available supplier balance until applied or refunded.

### REQ-DOM-VENDOR-CREDIT-003: Settles the remaining credit through a linked bank or cash movement

A credit refund settles the remaining credit through a linked bank or cash movement.

Applications reduce bill balances while refunds create cash movement.

A vendor credit keeps the purchase return or bill correction that created it.

## REQ-DOM-ITEM: Item Lifecycle

For Item, one item identity links purchasing, inventory, sales, manufacturing, assets, maintenance, and service. Type, tracking, costing, tax, price, and planning settings determine which operational effects are valid.

Together, active and deactivated states keep historical document and movement references. Inventory items require stock tracking while service items never produce stock movements.

### REQ-DOM-ITEM-001: Item organization-unique SKU

An item retains organization-unique SKU, name, description, category, unit, default purchase and sales prices, taxability, status, tracking mode, costing method, planning settings, and preferred vendor.

Type, tracking, costing, tax, price, and planning settings determine which operational effects are valid.

One item identity links purchasing, inventory, sales, manufacturing, assets, maintenance, and service.

### REQ-DOM-ITEM-002: Item allowed-value catalog

Item types are inventory, service, non-stock, fixed asset, raw material, component, finished good, and spare part.

One item identity links purchasing, inventory, sales, manufacturing, assets, maintenance, and service.

Inventory items require stock tracking while service items never produce stock movements.

### REQ-DOM-ITEM-003: Tracking modes are none, lot

Tracking modes are none, lot, and serial; inventory items require tracking while service items do not create stock movements.

Inventory items require stock tracking while service items never produce stock movements.

One item identity links purchasing, inventory, sales, manufacturing, assets, maintenance, and service.

### REQ-DOM-ITEM-004: Planning Item for planning settings retain

Planning settings retain safety stock, reorder point, minimum order quantity, order multiple, lead time, preferred vendor, make-or-buy choice, and default warehouse.

Type, tracking, costing, tax, price, and planning settings determine which operational effects are valid.

Inventory items require stock tracking while service items never produce stock movements.

### REQ-DOM-ITEM-005: An active item may become deactivated

An active item may become deactivated while retaining every historical document, stock movement, journal dimension, and asset or production relation.

Active and deactivated states keep historical document and movement references.

One item identity links purchasing, inventory, sales, manufacturing, assets, maintenance, and service.

## REQ-DOM-WAREHOUSE: Warehouses

For Warehouse, a warehouse is scoped to one organization and gives the outer scope for locations and stock. Its manager and status govern operational responsibility while not changing organization-wide role definitions.

Together, address and valuation policy connect physical storage to logistics and inventory value. Historical movements retain the warehouse they used even if it becomes inactive.

### REQ-DOM-WAREHOUSE-001: Warehouse organization-unique code

A warehouse retains organization-unique code, address, manager, status, and valuation policy.

Its manager and status govern operational responsibility while not changing organization-wide role definitions.

Address and valuation policy connect physical storage to logistics and inventory value.

### REQ-DOM-WAREHOUSE-002: Storage Warehouse for storage locations stock

Storage locations, stock movements, counts, transfers, allocations, receipts, shipments, production, maintenance, and service activity relate to a warehouse.

A warehouse is scoped to one organization and gives the outer scope for locations and stock.

Historical movements retain the warehouse they used even if it becomes inactive.

### REQ-DOM-WAREHOUSE-003: Records but is unavailable for new operational selection

An inactive warehouse remains visible to historical stock and posting records but is unavailable for new operational selection.

Historical movements retain the warehouse they used even if it becomes inactive.

A warehouse is scoped to one organization and gives the outer scope for locations and stock.

## REQ-DOM-LOCATION: Storage Locations

For Storage Location, every storage location is scoped to exactly one warehouse. A parent relationship supports physical nesting while not crossing warehouse boundaries.

Together, movement and availability views retain location-level traceability. Inactive locations stay historical references but cannot receive new stock activity.

### REQ-DOM-LOCATION-001: Storage Location warehouse

A storage location retains warehouse, organization-unique code within that warehouse, name, optional parent, status, and description.

Every storage location is scoped to exactly one warehouse.

A parent relationship supports physical nesting while not crossing warehouse boundaries.

### REQ-DOM-LOCATION-002: Location Storage Location for hierarchy limited three

Location hierarchy is limited to three levels and every descendant remains in the same warehouse.

Every storage location is scoped to exactly one warehouse.

A parent relationship supports physical nesting while not crossing warehouse boundaries.

### REQ-DOM-LOCATION-003: Stock movements, lots, serials, counts, receipts, shipments, transfers, quarantine

Stock movements, lots, serials, counts, receipts, shipments, transfers, quarantine, and consumption retain their location.

Movement and availability views retain location-level traceability.

Every storage location is scoped to exactly one warehouse.

## REQ-DOM-STOCK-MOVEMENT: Stock Movements

For Stock Movement, every increase, decrease, reservation effect that changes stock, quarantine transfer, or scrap event is represented by a source-linked movement. Quantity on hand is derived from movements instead of an editable balance.

Together, lot, serial, warehouse, location, cost, source, date, and operator keep operational traceability. Movement types connect procurement, sales, transfers, production, quality, maintenance, and service to one inventory history.

### REQ-DOM-STOCK-MOVEMENT-001: Stock Movement item

A stock movement retains item, warehouse, location, lot, serial, quantity delta, unit cost, movement type, source document, posting date, organization, and operator.

Lot, serial, warehouse, location, cost, source, date, and operator keep operational traceability.

Every increase, decrease, reservation effect that changes stock, quarantine transfer, or scrap event is represented by a source-linked movement.

### REQ-DOM-STOCK-MOVEMENT-002: Movement Stock Movement for types cover purchase

Movement types cover purchase receipt and return, sales shipment and return, adjustment, transfer in and out, production consumption and output, maintenance and service consumption, quality quarantine and release, and scrap.

Movement types connect procurement, sales, transfers, production, quality, maintenance, and service to one inventory history.

Every increase, decrease, reservation effect that changes stock, quarantine transfer, or scrap event is represented by a source-linked movement.

### REQ-DOM-STOCK-MOVEMENT-003: Stock quantity and movement history are computed from immutable movements

Stock quantity and movement history are computed from immutable movements.

Every increase, decrease, reservation effect that changes stock, quarantine transfer, or scrap event is represented by a source-linked movement.

Quantity on hand is derived from movements instead of an editable balance.

## REQ-DOM-LOT: Inventory Lots

For Inventory Lot, a lot is scoped to one item and organization and follows quantities across locations and documents. Lot identity is required wherever a lot-tracked item enters or leaves stock.

Together, purchase, quality, production, sales, return, maintenance, and service movements keep lot lineage. Quarantine changes availability while not breaking the lot's history.

### REQ-DOM-LOT-001: Inventory Lot its organization

An inventory lot retains its organization, item, lot code, origin, status, and relevant dates.

A lot is scoped to one item and organization and follows quantities across locations and documents.

Lot identity is required wherever a lot-tracked item enters or leaves stock.

### REQ-DOM-LOT-002: Every receipt and shipment of a lot-tracked item identifies the affected lot

Every receipt and shipment of a lot-tracked item identifies the affected lot.

Lot identity is required wherever a lot-tracked item enters or leaves stock.

A lot is scoped to one item and organization and follows quantities across locations and documents.

### REQ-DOM-LOT-003: Views relate the lot to every source-linked movement and availability state

Stock-on-hand and traceability views relate the lot to every source-linked movement and availability state.

Lot identity is required wherever a lot-tracked item enters or leaves stock.

Quarantine changes availability while not breaking the lot's history.

## REQ-DOM-SERIAL: Item Serials

For Item Serial, a serial identifies one physical unit of one item. Serial uniqueness is enforced within the item, and one serial represents one unit.

Together, receipt, movement, shipment, return, service, asset, and quality relationships follow the same serial. Availability and customer-service history stay inspectable throughout the unit's lifecycle.

### REQ-DOM-SERIAL-001: Item Serial organization

An item serial retains organization, item, serial code, status, current stock context, and origin.

A serial identifies one physical unit of one item.

Serial uniqueness is enforced within the item, and one serial represents one unit.

### REQ-DOM-SERIAL-002: Serial Item Serial for code unique each

Serial code is unique per item and each serial-tracked movement carries exactly one serial per unit.

A serial identifies one physical unit of one item.

Serial uniqueness is enforced within the item, and one serial represents one unit.

### REQ-DOM-SERIAL-003: Lot Item Serial for traceability relates each

Lot or serial traceability relates each serial to receipts, movements, shipments, returns, inspections, and service cases.

Receipt, movement, shipment, return, service, asset, and quality relationships follow the same serial.

A serial identifies one physical unit of one item.

## REQ-DOM-TRANSFER: Warehouse Transfer Lifecycle

For Warehouse Transfer, a transfer owns source and destination warehouse and location relationships plus line-level quantities. Shipping and receiving are distinct events so in-transit and partial quantities stay visible.

Together, outbound and inbound movements keep the transfer as their source. Cancellation is available only before unresolved movement effects would be abandoned.

### REQ-DOM-TRANSFER-001: Warehouse Transfer number

A warehouse transfer retains number, organization, source and destination warehouses and locations, dates, operator attribution, status, and lines.

A transfer owns source and destination warehouse and location relationships plus line-level quantities.

Outbound and inbound movements keep the transfer as their source.

### REQ-DOM-TRANSFER-002: Warehouse Transfer item

Each transfer line retains item, lot or serial, requested, shipped, received, and remaining quantities.

A transfer owns source and destination warehouse and location relationships plus line-level quantities.

Shipping and receiving are distinct events so in-transit and partial quantities stay visible.

### REQ-DOM-TRANSFER-003: A draft transfer may become shipped in part or whole and create outbound movements

A draft transfer may become shipped in part or whole and create outbound movements.

Outbound and inbound movements keep the transfer as their source.

A transfer owns source and destination warehouse and location relationships plus line-level quantities.

### REQ-DOM-TRANSFER-004: A shipped transfer may become received in part or whole and create matching inbound movements

A shipped transfer may become received in part or whole and create matching inbound movements.

Outbound and inbound movements keep the transfer as their source.

A transfer owns source and destination warehouse and location relationships plus line-level quantities.

### REQ-DOM-TRANSFER-005: An eligible draft or unresolved transfer may become cancelled

An eligible draft or unresolved transfer may become cancelled while preserving any movements already posted.

Outbound and inbound movements keep the transfer as their source.

A transfer owns source and destination warehouse and location relationships plus line-level quantities.

## REQ-DOM-CYCLE-COUNT: Cycle Count Lifecycle

For Cycle Count, a cycle count is scoped to a warehouse or location and captures an expected stock snapshot. Count lines compare item, lot, and serial quantities observed by an assigned performer.

Together, draft, performed, submitted, approval outcome, and posting states distinguish data collection from stock correction. Only posted approved variance creates stock adjustment movements.

### REQ-DOM-CYCLE-COUNT-001: Cycle Count organization

A cycle count retains organization, warehouse or location, count date, performer, approver, status, and lines.

A cycle count is scoped to a warehouse or location and captures an expected stock snapshot.

Count lines compare item, lot, and serial quantities observed by an assigned performer.

### REQ-DOM-CYCLE-COUNT-002: Cycle Count item

Each line retains item, lot or serial, expected quantity, counted quantity, and variance.

Count lines compare item, lot, and serial quantities observed by an assigned performer.

A cycle count is scoped to a warehouse or location and captures an expected stock snapshot.

### REQ-DOM-CYCLE-COUNT-003: A draft count may become performed and then submitted

A draft count may become performed and then submitted.

Draft, performed, submitted, approval outcome, and posting states distinguish data collection from stock correction.

A cycle count is scoped to a warehouse or location and captures an expected stock snapshot.

### REQ-DOM-CYCLE-COUNT-004: A submitted count may become approved or rejected

A submitted count may become approved or rejected.

A cycle count is scoped to a warehouse or location and captures an expected stock snapshot.

Count lines compare item, lot, and serial quantities observed by an assigned performer.

### REQ-DOM-CYCLE-COUNT-005: Becomes posted and creates source-linked adjustment movements

An approved count becomes posted and creates source-linked adjustment movements.

Only posted approved variance creates stock adjustment movements.

A cycle count is scoped to a warehouse or location and captures an expected stock snapshot.

## REQ-DOM-INVENTORY-ADJUSTMENT: Inventory Adjustments

For Inventory Adjustment, an adjustment identifies the item, stock context, quantity or cost correction, reason, and operator. Threshold approval separates routine and material corrections.

Together, posting changes inventory only through immutable movements. The adjustment stays the source document for audit, reports, and reversal.

### REQ-DOM-INVENTORY-ADJUSTMENT-001: Inventory Adjustment organization

An inventory adjustment retains organization, item, warehouse, location, lot or serial, quantity or cost delta, reason, requester, approver, status, and posting date.

An adjustment identifies the item, stock context, quantity or cost correction, reason, and operator.

Posting changes inventory only through immutable movements.

### REQ-DOM-INVENTORY-ADJUSTMENT-002: Creates immutable source-linked stock movements

Posting an approved adjustment creates immutable source-linked stock movements.

Posting changes inventory only through immutable movements.

An adjustment identifies the item, stock context, quantity or cost correction, reason, and operator.

### REQ-DOM-INVENTORY-ADJUSTMENT-003: Adjustments above the organization threshold retain approval history before posting

Adjustments above the organization threshold retain approval history before posting.

Threshold approval separates routine and material corrections.

Posting changes inventory only through immutable movements.

## REQ-DOM-CUSTOMER: Customer Lifecycle

For Customer, a customer is an organization-scoped external party and never an authenticating user. Identity, tax, addresses, contacts, terms, currency, credit, and status support sales and receivables.

Together, credit limit and exposure are distinct: one is approved policy and the other is current financial use. Deactivation keeps historical quotes, orders, shipments, invoices, payments, returns, and service.

### REQ-DOM-CUSTOMER-001: Customer legal

A customer retains legal and display identity, tax identification, billing and shipping addresses, contacts, default currency and payment terms, credit limit, credit exposure, status, and notes.

Identity, tax, addresses, contacts, terms, currency, credit, and status support sales and receivables.

Credit limit and exposure are distinct: one is approved policy and the other is current financial use.

### REQ-DOM-CUSTOMER-002: A customer relates to several contact people and identifies exactly one as primary

A customer relates to several contact people and identifies exactly one as primary.

A customer is an organization-scoped external party and never an authenticating user.

Identity, tax, addresses, contacts, terms, currency, credit, and status support sales and receivables.

### REQ-DOM-CUSTOMER-003: An active customer may become deactivated

An active customer may become deactivated while retaining all historical sales and service records.

Deactivation keeps historical quotes, orders, shipments, invoices, payments, returns, and service.

A customer is an organization-scoped external party and never an authenticating user.

### REQ-DOM-CUSTOMER-004: A customer without historical sales may be deleted

A customer without historical sales may be deleted, while one with history remains retained in deactivated form.

A customer is an organization-scoped external party and never an authenticating user.

Identity, tax, addresses, contacts, terms, currency, credit, and status support sales and receivables.

### REQ-DOM-CUSTOMER-005: Changes retain before and after values, requester, approver, reason, timestamp

Credit-limit changes retain before and after values, requester, approver, reason, timestamp, and audit relation.

Credit limit and exposure are distinct: one is approved policy and the other is current financial use.

Identity, tax, addresses, contacts, terms, currency, credit, and status support sales and receivables.

## REQ-DOM-SALES-PRICE: Sales Prices

For Sales Price, a sales price is scoped to an organization, item, currency, and effective interval. Quoted and ordered lines retain the chosen price even when the price record changes later.

Together, pricing is a commercial input distinct from item default cost and inventory valuation. undefined

### REQ-DOM-SALES-PRICE-001: Sales Price organization

A sales price retains organization, item, currency, unit price, effective dates, active status, and optional customer context.

A sales price is scoped to an organization, item, currency, and effective interval.

Quoted and ordered lines retain the chosen price even when the price record changes later.

### REQ-DOM-SALES-PRICE-002: Quote and order lines preserve the selected price and currency used when they were created

Quote and order lines preserve the selected price and currency used when they were created.

Quoted and ordered lines retain the chosen price even when the price record changes later.

A sales price is scoped to an organization, item, currency, and effective interval.

## REQ-DOM-SALES-QUOTE: Sales Quote Lifecycle

For Sales Quote, a quote is scoped to one customer and keeps issue, expiration, currency, representative, and commercial lines. Draft and sent states distinguish preparation from an external offer.

Together, acceptance, rejection, expiration, and conversion keep the outcome and downstream source link. Conversion creates an order while not erasing the accepted quote.

### REQ-DOM-SALES-QUOTE-001: Sales Quote number

A sales quote retains number, organization, customer, issue and expiration dates, currency, representative, lines, status, and conversion link.

A quote is scoped to one customer and keeps issue, expiration, currency, representative, and commercial lines.

Acceptance, rejection, expiration, and conversion keep the outcome and downstream source link.

### REQ-DOM-SALES-QUOTE-002: Sales Quote item or service

Each quote line retains item or service, description, quantity, unit, price, discount, and tax treatment.

A quote is scoped to one customer and keeps issue, expiration, currency, representative, and commercial lines.

Conversion creates an order while not erasing the accepted quote.

### REQ-DOM-SALES-QUOTE-003: A draft quote may become sent

A draft quote may become sent.

Draft and sent states distinguish preparation from an external offer.

A quote is scoped to one customer and keeps issue, expiration, currency, representative, and commercial lines.

### REQ-DOM-SALES-QUOTE-004: A sent quote may become accepted, rejected, or expired

A sent quote may become accepted, rejected, or expired.

Conversion creates an order while not erasing the accepted quote.

A quote is scoped to one customer and keeps issue, expiration, currency, representative, and commercial lines.

### REQ-DOM-SALES-QUOTE-005: An accepted quote may become converted to a source-linked sales order

An accepted quote may become converted to a source-linked sales order.

Conversion creates an order while not erasing the accepted quote.

A quote is scoped to one customer and keeps issue, expiration, currency, representative, and commercial lines.

## REQ-DOM-SALES-ORDER: Sales Order Lifecycle

For Sales Order, a sales order can originate directly or from an accepted quote and keeps that source relationship. Order lines independently track ordered, allocated, shipped, invoiced, returned, cancelled, and remaining quantities.

Together, credit approval, stock allocation, shipment, and invoicing advance distinguish but connected progress axes. Cancellation after shipment depends on returns or credits resolving downstream effects.

### REQ-DOM-SALES-ORDER-001: Sales Order number

A sales order retains number, organization, customer, direct or quote origin, currency, dates, representative, credit-check result, approval history, status, and lines.

A sales order can originate directly or from an accepted quote and keeps that source relationship.

Order lines independently track ordered, allocated, shipped, invoiced, returned, cancelled, and remaining quantities.

### REQ-DOM-SALES-ORDER-002: Sales Order item

Each line retains item, ordered, allocated, shipped, invoiced, returned, cancelled, and remaining quantities, unit price, tax, warehouse, and status.

Order lines independently track ordered, allocated, shipped, invoiced, returned, cancelled, and remaining quantities.

A sales order can originate directly or from an accepted quote and keeps that source relationship.

### REQ-DOM-SALES-ORDER-003: Changes after credit evaluation

A draft order may be routed, approved, rejected, or returned for changes after credit evaluation.

Order lines independently track ordered, allocated, shipped, invoiced, returned, cancelled, and remaining quantities.

A sales order can originate directly or from an accepted quote and keeps that source relationship.

### REQ-DOM-SALES-ORDER-004: An approved order may become partly or fully allocated, shipped

An approved order may become partly or fully allocated, shipped, and invoiced along independent progress axes.

Order lines independently track ordered, allocated, shipped, invoiced, returned, cancelled, and remaining quantities.

Credit approval, stock allocation, shipment, and invoicing advance distinguish but connected progress axes.

### REQ-DOM-SALES-ORDER-005: A fully resolved order may become closed

A fully resolved order may become closed.

A sales order can originate directly or from an accepted quote and keeps that source relationship.

Order lines independently track ordered, allocated, shipped, invoiced, returned, cancelled, and remaining quantities.

### REQ-DOM-SALES-ORDER-006: Sales Order its downstream-resolution requirements

An eligible unshipped order may become cancelled, while a shipped order retains its downstream-resolution requirements.

Order lines independently track ordered, allocated, shipped, invoiced, returned, cancelled, and remaining quantities.

A sales order can originate directly or from an accepted quote and keeps that source relationship.

## REQ-DOM-ALLOCATION: Stock Allocation Lifecycle

For Stock Allocation, an allocation links a sales-order line to identified stock and a reserved quantity. Reservation reduces availability while not creating a stock movement.

Together, partial allocation and release keep ordered and remaining quantities. Shipment consumes the allocation; pre-shipment release restores availability.

### REQ-DOM-ALLOCATION-001: Stock Allocation organization

A stock allocation retains organization, sales-order line, item, warehouse, location, lot or serial, reserved quantity, consumed quantity, status, and operator.

An allocation links a sales-order line to identified stock and a reserved quantity.

Reservation reduces availability while not creating a stock movement.

### REQ-DOM-ALLOCATION-002: Available stock may become partly or fully allocated to an approved order

Available stock may become partly or fully allocated to an approved order.

An allocation links a sales-order line to identified stock and a reserved quantity.

Reservation reduces availability while not creating a stock movement.

### REQ-DOM-ALLOCATION-003: An unconsumed allocation may be released before shipment and restore availability

An unconsumed allocation may be released before shipment and restore availability.

Shipment consumes the allocation; pre-shipment release restores availability.

An allocation links a sales-order line to identified stock and a reserved quantity.

### REQ-DOM-ALLOCATION-004: Shipment consumes the linked allocation and preserves the source relationship

Shipment consumes the linked allocation and preserves the source relationship.

Shipment consumes the allocation; pre-shipment release restores availability.

An allocation links a sales-order line to identified stock and a reserved quantity.

## REQ-DOM-SHIPMENT: Shipment Lifecycle

For Shipment, a shipment is scoped to one sales order and consumes its remaining shippable quantities. Pick, pack, ship, deliver, and cancel states retain warehouse and lot or serial evidence.

Together, shipping is the stock and COGS posting event; delivery is a later fulfillment confirmation. Partial shipments keep order-line remainder for later fulfillment.

### REQ-DOM-SHIPMENT-001: Shipment number

A shipment retains number, organization, sales order, warehouse, dates, operator attribution, status, and lines.

A shipment is scoped to one sales order and consumes its remaining shippable quantities.

Pick, pack, ship, deliver, and cancel states retain warehouse and lot or serial evidence.

### REQ-DOM-SHIPMENT-002: Shipment source order line

Each shipment line retains source order line, item, quantity, location, lot or serial, and allocation relationship.

A shipment is scoped to one sales order and consumes its remaining shippable quantities.

Partial shipments keep order-line remainder for later fulfillment.

### REQ-DOM-SHIPMENT-003: A draft shipment may become picked and then packed

A draft shipment may become picked and then packed.

A shipment is scoped to one sales order and consumes its remaining shippable quantities.

Pick, pack, ship, deliver, and cancel states retain warehouse and lot or serial evidence.

### REQ-DOM-SHIPMENT-004: A Shipment for packed become shipped

A packed shipment may become shipped and create source-linked stock decreases and cost-of-goods-sold entries.

A shipment is scoped to one sales order and consumes its remaining shippable quantities.

Shipping is the stock and COGS posting event; delivery is a later fulfillment confirmation.

### REQ-DOM-SHIPMENT-005: A shipped shipment may become delivered

A shipped shipment may become delivered.

A shipment is scoped to one sales order and consumes its remaining shippable quantities.

Pick, pack, ship, deliver, and cancel states retain warehouse and lot or serial evidence.

### REQ-DOM-SHIPMENT-006: An eligible unposted shipment may become cancelled without losing its order relationship

An eligible unposted shipment may become cancelled without losing its order relationship.

A shipment is scoped to one sales order and consumes its remaining shippable quantities.

Partial shipments keep order-line remainder for later fulfillment.

## REQ-DOM-SALES-INVOICE: Sales Invoice Lifecycle

For Sales Invoice, an invoice originates from sales orders or shipments and keeps line-level source quantities. Draft and approval states distinguish editable billing intent from posted receivable history.

Together, posting creates accounts receivable, revenue, discount, and output-tax effects. Payment, overdue, and void states keep outstanding balance and correction evidence.

### REQ-DOM-SALES-INVOICE-001: Sales Invoice number

A sales invoice retains number, organization, customer, source orders or shipments, dates, payment terms, currency, approval history, status, and lines.

An invoice originates from sales orders or shipments and keeps line-level source quantities.

Draft and approval states distinguish editable billing intent from posted receivable history.

### REQ-DOM-SALES-INVOICE-002: Sales Invoice source shipment or order line

Each invoice line retains source shipment or order line, item or service, quantity, price, discount, tax, revenue account, and remaining billable quantity.

An invoice originates from sales orders or shipments and keeps line-level source quantities.

Posting creates accounts receivable, revenue, discount, and output-tax effects.

### REQ-DOM-SALES-INVOICE-003: A draft invoice may be routed, approved, rejected, or returned for changes

A draft invoice may be routed, approved, rejected, or returned for changes.

An invoice originates from sales orders or shipments and keeps line-level source quantities.

Draft and approval states distinguish editable billing intent from posted receivable history.

### REQ-DOM-SALES-INVOICE-004: An Sales Invoice for approved become posted

An approved invoice may become posted and create source-linked accounts-receivable, revenue, discount, and tax journal entries.

Posting creates accounts receivable, revenue, discount, and output-tax effects.

An invoice originates from sales orders or shipments and keeps line-level source quantities.

### REQ-DOM-SALES-INVOICE-005: A posted invoice may become sent and then partly or fully paid through payment allocations

A posted invoice may become sent and then partly or fully paid through payment allocations.

An invoice originates from sales orders or shipments and keeps line-level source quantities.

Draft and approval states distinguish editable billing intent from posted receivable history.

### REQ-DOM-SALES-INVOICE-006: Becomes overdue

An unpaid invoice past its terms becomes overdue, and an eligible invoice may be voided while preserving its posting history.

An invoice originates from sales orders or shipments and keeps line-level source quantities.

Draft and approval states distinguish editable billing intent from posted receivable history.

## REQ-DOM-CUSTOMER-PAYMENT: Customer Payments

For Customer Payment, a customer payment is scoped to one customer, organization, currency, and cash or bank destination. Allocations support partial settlement and one payment across several invoices.

Together, posting reduces accounts receivable and increases the selected cash or bank balance. Any excess becomes a customer credit instead of disappearing.

### REQ-DOM-CUSTOMER-PAYMENT-001: Customer Payment customer

A customer payment retains customer, payment date, amount, currency, bank or cash account, reference, status, organization, and posting attribution.

A customer payment is scoped to one customer, organization, currency, and cash or bank destination.

Posting reduces accounts receivable and increases the selected cash or bank balance.

### REQ-DOM-CUSTOMER-PAYMENT-002: Payment Customer Payment for allocations relate more

Payment allocations relate one customer payment to one or more invoices and retain the amount applied to each.

Allocations support partial settlement and one payment across several invoices.

A customer payment is scoped to one customer, organization, currency, and cash or bank destination.

### REQ-DOM-CUSTOMER-PAYMENT-003: Creates source-linked accounts-receivable reduction and cash or bank increase

Posting creates source-linked accounts-receivable reduction and cash or bank increase.

Posting reduces accounts receivable and increases the selected cash or bank balance.

A customer payment is scoped to one customer, organization, currency, and cash or bank destination.

### REQ-DOM-CUSTOMER-PAYMENT-004: Becomes a retained customer credit balance

Unallocated overpayment becomes a retained customer credit balance.

Any excess becomes a customer credit instead of disappearing.

A customer payment is scoped to one customer, organization, currency, and cash or bank destination.

## REQ-DOM-SALES-RETURN: Sales Return Lifecycle

For Sales Return, a sales return references the exact shipment and quantities being returned. Approval and physical receipt are distinct lifecycle events.

Together, restockability controls whether stock is restored or a loss is recognized. Refund and credit outcomes keep links to the return and original sale.

### REQ-DOM-SALES-RETURN-001: Sales Return number

A sales return retains number, organization, customer, source shipment, reason, restockability, status, approval history, and lines.

A sales return references the exact shipment and quantities being returned.

Approval and physical receipt are distinct lifecycle events.

### REQ-DOM-SALES-RETURN-002: Sales Return source shipment line

Each return line retains source shipment line, item, quantity, lot or serial, restockable quantity, warehouse, and location.

A sales return references the exact shipment and quantities being returned.

Refund and credit outcomes keep links to the return and original sale.

### REQ-DOM-SALES-RETURN-003: A draft return may become approved or rejected

A draft return may become approved or rejected.

A sales return references the exact shipment and quantities being returned.

Refund and credit outcomes keep links to the return and original sale.

### REQ-DOM-SALES-RETURN-004: An Sales Return for approved become received

An approved return may become received and post stock restoration plus reversal or loss accounting.

Restockability controls whether stock is restored or a loss is recognized.

A sales return references the exact shipment and quantities being returned.

### REQ-DOM-SALES-RETURN-005: A received return may become refunded through a linked credit memo or payment

A received return may become refunded through a linked credit memo or payment.

Refund and credit outcomes keep links to the return and original sale.

A sales return references the exact shipment and quantities being returned.

### REQ-DOM-SALES-RETURN-006: An eligible return may become cancelled

An eligible return may become cancelled while preserving its source reference.

A sales return references the exact shipment and quantities being returned.

Refund and credit outcomes keep links to the return and original sale.

## REQ-DOM-CREDIT-MEMO: Credit Memos

For Credit Memo, a credit memo keeps the reason and invoice, return, or customer-credit source it corrects. The amount stays available until applied or refunded.

Together, application reduces an invoice balance; refund creates cash movement. The memo keeps the original posted invoice instead of mutating it.

### REQ-DOM-CREDIT-MEMO-001: Credit Memo customer

A credit memo retains customer, source invoice or return, reason, amount, currency, remaining balance, organization, status, and posting attribution.

A credit memo keeps the reason and invoice, return, or customer-credit source it corrects.

Application reduces an invoice balance; refund creates cash movement.

### REQ-DOM-CREDIT-MEMO-002: Credit Memo allowed-value catalog

Allowed reasons are return, discount, invoice correction, and customer credit.

A credit memo keeps the reason and invoice, return, or customer-credit source it corrects.

Application reduces an invoice balance; refund creates cash movement.

### REQ-DOM-CREDIT-MEMO-003: Links the memo to one or more invoices and reduces their receivable balance

A credit application links the memo to one or more invoices and reduces their receivable balance.

Application reduces an invoice balance; refund creates cash movement.

A credit memo keeps the reason and invoice, return, or customer-credit source it corrects.

### REQ-DOM-CREDIT-MEMO-004: Settles remaining credit through a linked bank or cash movement

A credit refund settles remaining credit through a linked bank or cash movement.

Application reduces an invoice balance; refund creates cash movement.

A credit memo keeps the reason and invoice, return, or customer-credit source it corrects.

## REQ-DOM-EMPLOYEE: Employee Lifecycle

For Employee, an employee connects one organization to a global user identity and is distinct from membership and credential state. Department, position, manager, role assignments, cost center, employment type, payroll settings, and visibility describe organizational placement.

Together, active, on-leave, deactivated, and terminated statuses determine work eligibility while not erasing history. Hire and termination dates keep employment chronology.

### REQ-DOM-EMPLOYEE-001: Employee user

An employee retains user, organization, roles, department, position, manager, cost center, employment type, status, hire and termination dates, payroll settings, and visibility scope.

Department, position, manager, role assignments, cost center, employment type, payroll settings, and visibility describe organizational placement.

Hire and termination dates keep employment chronology.

### REQ-DOM-EMPLOYEE-002: Employee allowed-value catalog

Employment types are full-time, part-time, contractor, intern, and temporary.

Department, position, manager, role assignments, cost center, employment type, payroll settings, and visibility describe organizational placement.

Hire and termination dates keep employment chronology.

### REQ-DOM-EMPLOYEE-003: Employee status catalog

Employee statuses are active, on leave, deactivated, and terminated.

Active, on-leave, deactivated, and terminated statuses determine work eligibility while not erasing history.

An employee connects one organization to a global user identity and is distinct from membership and credential state.

### REQ-DOM-EMPLOYEE-004: An active employee may be placed on leave and later returned to active status

An active employee may be placed on leave and later returned to active status.

Active, on-leave, deactivated, and terminated statuses determine work eligibility while not erasing history.

An employee connects one organization to a global user identity and is distinct from membership and credential state.

### REQ-DOM-EMPLOYEE-005: An active or on-leave employee may become deactivated or terminated

An active or on-leave employee may become deactivated or terminated while contracts, time, payroll, approvals, and audit history remain attributable.

Active, on-leave, deactivated, and terminated statuses determine work eligibility while not erasing history.

An employee connects one organization to a global user identity and is distinct from membership and credential state.

## REQ-DOM-DEPARTMENT: Departments

For Department, a department is scoped to one organization and can have one parent department. Its manager is a scoped responsibility position instead of an organization-wide role.

Together, cost-center relation connects organizational placement to accounting dimensions. Employees, projects, requests, budgets, journals, and approvals can reference the same department.

### REQ-DOM-DEPARTMENT-001: Department organization

A department retains organization, name, description, manager position, optional parent, status, and cost center.

A department is scoped to one organization and can have one parent department.

Its manager is a scoped responsibility position instead of an organization-wide role.

### REQ-DOM-DEPARTMENT-002: Employees, projects, purchase requests, budgets, journal lines

Employees, projects, purchase requests, budgets, journal lines, and approval routing relate to a department.

Employees, projects, requests, budgets, journals, and approvals can reference the same department.

A department is scoped to one organization and can have one parent department.

### REQ-DOM-DEPARTMENT-003: Department hierarchy remains within one organization

Department hierarchy remains within one organization.

A department is scoped to one organization and can have one parent department.

Its manager is a scoped responsibility position instead of an organization-wide role.

## REQ-DOM-CONTRACT: Employment Contract Lifecycle

For Employment Contract, an employment contract is scoped to one employee and organization. Only one contract is active for an employee at any moment.

Together, activating a replacement automatically closes the prior contract on the preceding day. Past contracts stay immutable evidence for payroll and employment history.

### REQ-DOM-CONTRACT-001: Employment Contract employee

An employment contract retains employee, organization, effective dates, employment and pay terms, status, and creation attribution.

An employment contract is scoped to one employee and organization.

Only one contract is active for an employee at any moment.

### REQ-DOM-CONTRACT-002: A Employment Contract for newly activated automatically

A newly activated contract automatically ends the prior active contract on the day before the new start date.

Activating a replacement automatically closes the prior contract on the preceding day.

Only one contract is active for an employee at any moment.

### REQ-DOM-CONTRACT-003: Only one contract may be active for an employee at a time

Only one contract may be active for an employee at a time.

Only one contract is active for an employee at any moment.

An employment contract is scoped to one employee and organization.

### REQ-DOM-CONTRACT-004: A past or ended contract is immutable and remains available in contract history

A past or ended contract is immutable and remains available in contract history.

Past contracts stay immutable evidence for payroll and employment history.

An employment contract is scoped to one employee and organization.

## REQ-DOM-PROJECT: Project Lifecycle

For Project, a project is scoped to one organization and connects customer, department, project manager, dates, billing, budgets, and cost center. Project Manager is a scoped position and project members carry their own roles, allocations, and effective dates.

Together, active, archived, completed, and cancelled states govern time entry and operational visibility. Archived and completed projects retain their history but accept no new timelogs.

### REQ-DOM-PROJECT-001: Project organization-unique key

A project retains organization-unique key, name, description, customer, owning department, project manager, status, hour and amount budgets, billing type, date range, and cost center.

A project is scoped to one organization and connects customer, department, project manager, dates, billing, budgets, and cost center.

Project Manager is a scoped position and project members carry their own roles, allocations, and effective dates.

### REQ-DOM-PROJECT-002: Project status catalog

Project statuses are active, archived, completed, and cancelled.

Active, archived, completed, and cancelled states govern time entry and operational visibility.

Archived and completed projects retain their history but accept no new timelogs.

### REQ-DOM-PROJECT-003: An active project may become archived, completed, or cancelled

An active project may become archived, completed, or cancelled while retaining members, tasks, time, budgets, billing, and accounting links.

Active, archived, completed, and cancelled states govern time entry and operational visibility.

A project is scoped to one organization and connects customer, department, project manager, dates, billing, budgets, and cost center.

### REQ-DOM-PROJECT-004: Archived or completed projects remain readable but accept no new timelogs

Archived or completed projects remain readable but accept no new timelogs.

Archived and completed projects retain their history but accept no new timelogs.

Active, archived, completed, and cancelled states govern time entry and operational visibility.

## REQ-DOM-PROJECT-MEMBER: Project Membership

For Project Member, project membership is distinguish from organization membership and does not grant organization-wide authority. Each assignment is scoped to one employee and project for a defined interval.

Together, role and allocation explain work responsibility and planned capacity. Timelog eligibility depends on an active assignment and an eligible project.

### REQ-DOM-PROJECT-MEMBER-001: Project Member project

A project member retains project, employee, project role, allocation, start date, end date, and active status.

Each assignment is scoped to one employee and project for a defined interval.

Role and allocation explain work responsibility and planned capacity.

### REQ-DOM-PROJECT-MEMBER-002: Project assignment determines whether an employee may log time to the project

Project assignment determines whether an employee may log time to the project.

Each assignment is scoped to one employee and project for a defined interval.

Timelog eligibility depends on an active assignment and an eligible project.

### REQ-DOM-PROJECT-MEMBER-003: Ending a project assignment preserves earlier timelogs and cost or billing history

Ending a project assignment preserves earlier timelogs and cost or billing history.

Each assignment is scoped to one employee and project for a defined interval.

Timelog eligibility depends on an active assignment and an eligible project.

## REQ-DOM-TASK: Task Lifecycle

For Task, a task is scoped to one project and can have at most one level of subtasks. Current status supports day-to-day work while immutable history keeps each change.

Together, timelogs can reference a task while not making the task a generic substitute for other ERP documents. Project closure controls whether new time can be recorded regardless of task status.

### REQ-DOM-TASK-001: Task project

A task retains project, optional parent task, title, description, assignee context, status, and organization.

Project closure controls whether new time can be recorded regardless of task status.

A task is scoped to one project and can have at most one level of subtasks.

### REQ-DOM-TASK-002: A task may have one level of subtasks; a subtask cannot itself have children

A task may have one level of subtasks; a subtask cannot itself have children.

A task is scoped to one project and can have at most one level of subtasks.

Timelogs can reference a task while not making the task a generic substitute for other ERP documents.

### REQ-DOM-TASK-003: Creates an immutable history entry with prior status, next status, actor

Each task status change creates an immutable history entry with prior status, next status, actor, and timestamp.

Current status supports day-to-day work while immutable history keeps each change.

Project closure controls whether new time can be recorded regardless of task status.

### REQ-DOM-TASK-004: Task and status history remain available after project archive, completion, or cancellation

Task and status history remain available after project archive, completion, or cancellation.

Project closure controls whether new time can be recorded regardless of task status.

A task is scoped to one project and can have at most one level of subtasks.

## REQ-DOM-TIMELOG: Timelogs

For Timelog, a timelog is scoped to one employee, project, and work date, with an optional task. Duration, description, billable flag, cost rate, and billing rate support payroll, costing, and customer billing.

Together, lock state is derived from approved timesheet inclusion and prevents later editing. Ownership and manager authority govern changes while preserving the employee's history.

### REQ-DOM-TIMELOG-001: Timelog employee

A timelog retains employee, date, duration, project, task, description, billable flag, cost rate, billing rate, organization, and lock state.

Duration, description, billable flag, cost rate, and billing rate support payroll, costing, and customer billing.

A timelog is scoped to one employee, project, and work date, with an optional task.

### REQ-DOM-TIMELOG-002: A timelog relates to one weekly timesheet when grouped for approval

A timelog relates to one weekly timesheet when grouped for approval.

A timelog is scoped to one employee, project, and work date, with an optional task.

Lock state is derived from approved timesheet inclusion and prevents later editing.

### REQ-DOM-TIMELOG-003: An approved timesheet locks each included timelog

An approved timesheet locks each included timelog while preserving payroll and billing source links.

Duration, description, billable flag, cost rate, and billing rate support payroll, costing, and customer billing.

Lock state is derived from approved timesheet inclusion and prevents later editing.

## REQ-DOM-TIMESHEET: Timesheet Lifecycle

For Timesheet, a timesheet groups one employee's timelogs for one week. Draft, submitted, approved, rejected, and reopened states distinguish editing from review and locked use.

Together, approval locks the included entries and enables payroll or customer billing. Rejection and reopening keep prior decisions and reasons.

### REQ-DOM-TIMESHEET-001: Timesheet employee

A timesheet retains employee, organization, week, status, timelog membership, submitter, approver, timestamps, and decision reason.

A timesheet groups one employee's timelogs for one week.

Draft, submitted, approved, rejected, and reopened states distinguish editing from review and locked use.

### REQ-DOM-TIMESHEET-002: A Timesheet for draft become submitted

A draft timesheet may become submitted when it contains at least one timelog and no competing submitted or approved sheet exists for that employee and week.

A timesheet groups one employee's timelogs for one week.

Draft, submitted, approved, rejected, and reopened states distinguish editing from review and locked use.

### REQ-DOM-TIMESHEET-003: A submitted timesheet may become approved and lock all included timelogs

A submitted timesheet may become approved and lock all included timelogs.

A timesheet groups one employee's timelogs for one week.

Draft, submitted, approved, rejected, and reopened states distinguish editing from review and locked use.

### REQ-DOM-TIMESHEET-004: A submitted timesheet may become rejected with a reason

A submitted timesheet may become rejected with a reason.

Draft, submitted, approved, rejected, and reopened states distinguish editing from review and locked use.

A timesheet groups one employee's timelogs for one week.

### REQ-DOM-TIMESHEET-005: An approved or rejected timesheet may become reopened with history preserved

An approved or rejected timesheet may become reopened with history preserved.

Draft, submitted, approved, rejected, and reopened states distinguish editing from review and locked use.

A timesheet groups one employee's timelogs for one week.

## REQ-DOM-PAYROLL-CONFIG: Payroll Configuration

For Payroll Configuration, payroll configuration is scoped to one employee and organization. Schedule and rate determine the calculation basis while tax, benefits, bank, and account relationships determine deductions, settlement, and posting.

Together, changes apply to future payroll calculation and do not rewrite posted run details. Sensitive values follow payroll visibility instead of ordinary employee-directory visibility.

### REQ-DOM-PAYROLL-CONFIG-001: Payroll Configuration employee

Payroll configuration retains employee, pay schedule, salary or hourly rate, tax profile, bank account, benefits enrollment, payroll cost center, and default ledger accounts.

Schedule and rate determine the calculation basis while tax, benefits, bank, and account relationships determine deductions, settlement, and posting.

Payroll configuration is scoped to one employee and organization.

### REQ-DOM-PAYROLL-CONFIG-002: Each Payroll Configuration for each imported time

Each payroll run preserves the configuration and imported time details used for its calculation.

Changes apply to future payroll calculation and do not rewrite posted run details.

Payroll configuration is scoped to one employee and organization.

## REQ-DOM-PAY-SCHEDULE: Pay Schedules

For Pay Schedule, a pay schedule is scoped to one organization and groups employees with a common pay cadence. Frequency and cutoff determine which work and adjustments enter a period.

Together, period range and payment date connect calculation, posting, settlement, and payslip publication. Historical runs retain the schedule period they used.

### REQ-DOM-PAY-SCHEDULE-001: Pay Schedule organization

A pay schedule retains organization, name, frequency, period rule, payment-date rule, cutoff, and active status.

Frequency and cutoff determine which work and adjustments enter a period.

Period range and payment date connect calculation, posting, settlement, and payslip publication.

### REQ-DOM-PAY-SCHEDULE-002: A payroll run belongs to one schedule and one concrete period with a payment date

A payroll run belongs to one schedule and one concrete period with a payment date.

Period range and payment date connect calculation, posting, settlement, and payslip publication.

A pay schedule is scoped to one organization and groups employees with a common pay cadence.

## REQ-DOM-PAYROLL-RUN: Payroll Run Lifecycle

For Payroll Run, a payroll run is scoped to one organization, pay schedule, and pay period. Employee lines keep earnings, deductions, taxes, benefits, net pay, dimensions, and imported timesheet detail.

Together, draft, calculated, approval, posted, paid, and reversed states distinguish preparation from immutable payroll history. Reversal and adjustment runs correct posted payroll while not changing the original.

### REQ-DOM-PAYROLL-RUN-001: Payroll Run organization

A payroll run retains organization, schedule, period, payment date, status, approval history, posting, payment, and reversal links.

A payroll run is scoped to one organization, pay schedule, and pay period.

Draft, calculated, approval, posted, paid, and reversed states distinguish preparation from immutable payroll history.

### REQ-DOM-PAYROLL-RUN-002: Payroll Run regular pay

Each employee line retains regular pay, overtime, bonus, commission, reimbursement, deductions, employer and employee taxes, benefits, net pay, and accounting dimensions.

Employee lines keep earnings, deductions, taxes, benefits, net pay, dimensions, and imported timesheet detail.

A payroll run is scoped to one organization, pay schedule, and pay period.

### REQ-DOM-PAYROLL-RUN-003: A Payroll Run for draft become calculated

A draft run may become calculated using eligible employee configuration and approved timesheets.

Draft, calculated, approval, posted, paid, and reversed states distinguish preparation from immutable payroll history.

Employee lines keep earnings, deductions, taxes, benefits, net pay, dimensions, and imported timesheet detail.

### REQ-DOM-PAYROLL-RUN-004: A calculated run may be routed, approved, rejected, or returned for changes

A calculated run may be routed, approved, rejected, or returned for changes.

Draft, calculated, approval, posted, paid, and reversed states distinguish preparation from immutable payroll history.

A payroll run is scoped to one organization, pay schedule, and pay period.

### REQ-DOM-PAYROLL-RUN-005: An approved run may become posted and create payroll expense, tax liability, benefit liability

An approved run may become posted and create payroll expense, tax liability, benefit liability, and payroll payable entries.

Draft, calculated, approval, posted, paid, and reversed states distinguish preparation from immutable payroll history.

Reversal and adjustment runs correct posted payroll while not changing the original.

### REQ-DOM-PAYROLL-RUN-006: A posted run may become paid and reduce payroll payable and the bank balance

A posted run may become paid and reduce payroll payable and the bank balance.

Draft, calculated, approval, posted, paid, and reversed states distinguish preparation from immutable payroll history.

Reversal and adjustment runs correct posted payroll while not changing the original.

### REQ-DOM-PAYROLL-RUN-007: A posted or paid run may be corrected by a linked reversal or adjustment run

A posted or paid run may be corrected by a linked reversal or adjustment run while the original remains immutable.

Reversal and adjustment runs correct posted payroll while not changing the original.

Draft, calculated, approval, posted, paid, and reversed states distinguish preparation from immutable payroll history.

## REQ-DOM-PAYSLIP: Payslips

For Payslip, a payslip is scoped to one employee line, run, organization, and pay period. It presents the earnings, deductions, taxes, benefits, and net-pay breakdown preserved by payroll calculation.

Together, publication is distinct from payroll posting and payment so visibility can be controlled. Historical payslips stay available to the employee whose pay they describe.

### REQ-DOM-PAYSLIP-001: Payslip employee

A payslip retains employee, payroll run and line, period, payment date, earning, deduction, tax, benefit, net-pay details, and publication status.

A payslip is scoped to one employee line, run, organization, and pay period.

Publication is distinct from payroll posting and payment so visibility can be controlled.

### REQ-DOM-PAYSLIP-002: Only the subject employee and authorized payroll roles may view a payslip

Only the subject employee and authorized payroll roles may view a payslip.

A payslip is scoped to one employee line, run, organization, and pay period.

It presents the earnings, deductions, taxes, benefits, and net-pay breakdown preserved by payroll calculation.

### REQ-DOM-PAYSLIP-003: Published payslips preserve the posted calculation and are not rewritten by a later adjustment

Published payslips preserve the posted calculation and are not rewritten by a later adjustment.

It presents the earnings, deductions, taxes, benefits, and net-pay breakdown preserved by payroll calculation.

Historical payslips stay available to the employee whose pay they describe.

## REQ-DOM-BUDGET: Budget Lifecycle

For Budget, a budget is scoped to one organization and fiscal year with one or more business dimensions. Lines distinguish planned amounts, commitments, posted actuals, and remaining capacity.

Together, draft, submitted, active, revised, and archived states keep approved versions. Transactions consume commitment or actual capacity through source links instead of editing an active budget.

### REQ-DOM-BUDGET-001: Budget organization

A budget retains organization, fiscal year, version, status, approval history, reason, and dimensional lines.

A budget is scoped to one organization and fiscal year with one or more business dimensions.

Lines distinguish planned amounts, commitments, posted actuals, and remaining capacity.

### REQ-DOM-BUDGET-002: Budget Budget for dimensions include department

Budget dimensions may include department, project, cost center, profit center, account, item category, customer, and vendor.

A budget is scoped to one organization and fiscal year with one or more business dimensions.

Transactions consume commitment or actual capacity through source links instead of editing an active budget.

### REQ-DOM-BUDGET-003: Budget planned

Each line retains planned, committed, actual, and remaining amounts in its currency and dimensions.

Lines distinguish planned amounts, commitments, posted actuals, and remaining capacity.

A budget is scoped to one organization and fiscal year with one or more business dimensions.

### REQ-DOM-BUDGET-004: A draft budget may become submitted and then approved as the active version

A draft budget may become submitted and then approved as the active version.

Draft, submitted, active, revised, and archived states keep approved versions.

Transactions consume commitment or actual capacity through source links instead of editing an active budget.

### REQ-DOM-BUDGET-005: An Budget for revised only creating

An active budget may be revised only by creating a new linked version with reason and approval history.

Draft, submitted, active, revised, and archived states keep approved versions.

Transactions consume commitment or actual capacity through source links instead of editing an active budget.

### REQ-DOM-BUDGET-006: An active or superseded budget may become archived

An active or superseded budget may become archived while historical commitments and actuals remain visible.

Lines distinguish planned amounts, commitments, posted actuals, and remaining capacity.

Draft, submitted, active, revised, and archived states keep approved versions.

## REQ-DOM-COST-CENTER: Cost Centers

For Cost Center, a cost center is scoped to one organization and can have a parent. Its manager is a responsibility relation used in dimensions and allocation governance.

Together, departments, employees, projects, payroll, assets, maintenance, production, and journal lines can share the same cost-center identity. Inactive centers stay historical dimensions but cannot be selected for new activity.

### REQ-DOM-COST-CENTER-001: Cost Center organization-unique code

A cost center retains organization-unique code, name, manager, optional parent, status, and description.

A cost center is scoped to one organization and can have a parent.

Departments, employees, projects, payroll, assets, maintenance, production, and journal lines can share the same cost-center identity.

### REQ-DOM-COST-CENTER-002: Journal lines, budgets, employees, departments, projects, payroll, work centers, maintenance

Journal lines, budgets, employees, departments, projects, payroll, work centers, maintenance, and allocation rules relate to cost centers.

Departments, employees, projects, payroll, assets, maintenance, production, and journal lines can share the same cost-center identity.

A cost center is scoped to one organization and can have a parent.

### REQ-DOM-COST-CENTER-003: Cost-center hierarchy remains within one organization

Cost-center hierarchy remains within one organization.

A cost center is scoped to one organization and can have a parent.

Departments, employees, projects, payroll, assets, maintenance, production, and journal lines can share the same cost-center identity.

## REQ-DOM-PROFIT-CENTER: Profit Centers

For Profit Center, a profit center is scoped to one organization and can have a parent. Its manager and status govern responsibility and future selection.

Together, budgets and journal lines use the center as a financial dimension. Inactive centers keep historical reporting relationships.

### REQ-DOM-PROFIT-CENTER-001: Profit Center organization-unique code

A profit center retains organization-unique code, name, manager, optional parent, status, and description.

A profit center is scoped to one organization and can have a parent.

Its manager and status govern responsibility and future selection.

### REQ-DOM-PROFIT-CENTER-002: Journal lines and budgets relate to profit centers for managerial reporting

Journal lines and budgets relate to profit centers for managerial reporting.

Budgets and journal lines use the center as a financial dimension.

Inactive centers keep historical reporting relationships.

### REQ-DOM-PROFIT-CENTER-003: Profit-center hierarchy remains within one organization

Profit-center hierarchy remains within one organization.

A profit center is scoped to one organization and can have a parent.

Budgets and journal lines use the center as a financial dimension.

## REQ-DOM-ALLOCATION-RULE: Allocation Rules

For Allocation Rule, an allocation rule is scoped to one organization and identifies source expense plus destination cost centers. Its basis controls the measurable share assigned to each destination.

Together, execution keeps the input measures and calculated distribution. Posting creates a source-linked journal entry while not replacing the rule.

### REQ-DOM-ALLOCATION-RULE-001: Allocation Rule organization

An allocation rule retains organization, source expense scope, destination cost centers, basis, parameters, status, and effective dates.

An allocation rule is scoped to one organization and identifies source expense plus destination cost centers.

Its basis controls the measurable share assigned to each destination.

### REQ-DOM-ALLOCATION-RULE-002: Allocation Rule allowed-value catalog

Allowed bases are fixed percentage, headcount, floor area, revenue, labor hours, machine hours, and inventory quantity.

An allocation rule is scoped to one organization and identifies source expense plus destination cost centers.

Its basis controls the measurable share assigned to each destination.

### REQ-DOM-ALLOCATION-RULE-003: Allocation Rule its input measures

Each allocation execution retains its input measures, calculated shares, resulting amounts, operator, date, and source rule.

Execution keeps the input measures and calculated distribution.

An allocation rule is scoped to one organization and identifies source expense plus destination cost centers.

### REQ-DOM-ALLOCATION-RULE-004: A posted allocation relates its calculation detail to the resulting balanced journal entry

A posted allocation relates its calculation detail to the resulting balanced journal entry.

Posting creates a source-linked journal entry while not replacing the rule.

An allocation rule is scoped to one organization and identifies source expense plus destination cost centers.

## REQ-DOM-ASSET-CATEGORY: Asset Categories

For Asset Category, an asset category is scoped to one organization and classifies assets with common accounting treatment. Default asset, accumulated-depreciation, and expense accounts guide capitalization and depreciation posting.

Together, default useful life and method seed an asset while not preventing an approved asset-specific value. Historical assets retain the category and parameters used.

### REQ-DOM-ASSET-CATEGORY-001: Asset Category organization

An asset category retains organization, code, name, status, default asset account, accumulated-depreciation account, depreciation-expense account, useful life, and depreciation method.

Default asset, accumulated-depreciation, and expense accounts guide capitalization and depreciation posting.

Default useful life and method seed an asset while not preventing an approved asset-specific value.

### REQ-DOM-ASSET-CATEGORY-002: Fixed assets retain their selected category and copied depreciation parameters

Fixed assets retain their selected category and copied depreciation parameters.

Historical assets retain the category and parameters used.

An asset category is scoped to one organization and classifies assets with common accounting treatment.

## REQ-DOM-FIXED-ASSET: Fixed Asset Lifecycle

For Fixed Asset, a fixed asset originates from a vendor bill or manual acquisition and keeps that source link. Identity, category, acquisition, location, custodian, depreciation, and accounts keep its book meaning.

Together, draft, active, impaired, transferred, disposed, and retired states reflect independently recorded events. Posted depreciation, impairment, and disposal stay immutable while later events change carrying value.

### REQ-DOM-FIXED-ASSET-001: Fixed Asset organization-unique number

A fixed asset retains organization-unique number, name, category, acquisition date and cost, vendor, source bill or manual source, location, custodian, depreciation method, useful life, residual value, status, and linked ledger accounts.

A fixed asset originates from a vendor bill or manual acquisition and keeps that source link.

Identity, category, acquisition, location, custodian, depreciation, and accounts keep its book meaning.

### REQ-DOM-FIXED-ASSET-002: Depreciation methods are straight-line, declining-balance, units-of-production

Depreciation methods are straight-line, declining-balance, units-of-production, and manual.

A fixed asset originates from a vendor bill or manual acquisition and keeps that source link.

Identity, category, acquisition, location, custodian, depreciation, and accounts keep its book meaning.

### REQ-DOM-FIXED-ASSET-003: A draft asset may become active through approved capitalization

A draft asset may become active through approved capitalization.

Draft, active, impaired, transferred, disposed, and retired states reflect independently recorded events.

A fixed asset originates from a vendor bill or manual acquisition and keeps that source link.

### REQ-DOM-FIXED-ASSET-004: An active asset may receive depreciation and transfer events

An active asset may receive depreciation and transfer events while remaining active.

Draft, active, impaired, transferred, disposed, and retired states reflect independently recorded events.

Posted depreciation, impairment, and disposal stay immutable while later events change carrying value.

### REQ-DOM-FIXED-ASSET-005: An active asset may become impaired with a reduced carrying value

An active asset may become impaired with a reduced carrying value.

Draft, active, impaired, transferred, disposed, and retired states reflect independently recorded events.

Posted depreciation, impairment, and disposal stay immutable while later events change carrying value.

### REQ-DOM-FIXED-ASSET-006: An asset may become disposed through sale, scrap, donation, or loss, or may become retired

An asset may become disposed through sale, scrap, donation, or loss, or may become retired.

Draft, active, impaired, transferred, disposed, and retired states reflect independently recorded events.

A fixed asset originates from a vendor bill or manual acquisition and keeps that source link.

### REQ-DOM-FIXED-ASSET-007: Every lifecycle event preserves acquisition cost and the prior event history

Every lifecycle event preserves acquisition cost and the prior event history.

A fixed asset originates from a vendor bill or manual acquisition and keeps that source link.

Identity, category, acquisition, location, custodian, depreciation, and accounts keep its book meaning.

## REQ-DOM-DEPRECIATION-SCHEDULE: Depreciation Schedules

For Depreciation Schedule, a schedule is scoped to one asset and follows its method, cost, residual value, useful life, and fiscal calendar. Each period row distinguishes opening book value, planned depreciation, accumulated depreciation, and closing value.

Together, posted rows relate to a depreciation run and journal entry. Future schedule rows can be recalculated after a new asset event while posted rows stay fixed.

### REQ-DOM-DEPRECIATION-SCHEDULE-001: Depreciation Schedule asset

A depreciation schedule retains asset, fiscal periods, method, depreciable basis, residual value, planned amount, accumulated amount, and opening and closing book values.

Each period row distinguishes opening book value, planned depreciation, accumulated depreciation, and closing value.

A schedule is scoped to one asset and follows its method, cost, residual value, useful life, and fiscal calendar.

### REQ-DOM-DEPRECIATION-SCHEDULE-002: Posted schedule rows relate to the depreciation run and journal entry that realized them

Posted schedule rows relate to the depreciation run and journal entry that realized them.

Posted rows relate to a depreciation run and journal entry.

Future schedule rows can be recalculated after a new asset event while posted rows stay fixed.

### REQ-DOM-DEPRECIATION-SCHEDULE-003: Posted depreciation periods remain immutable

Posted depreciation periods remain immutable.

Posted rows relate to a depreciation run and journal entry.

Each period row distinguishes opening book value, planned depreciation, accumulated depreciation, and closing value.

## REQ-DOM-DEPRECIATION-RUN: Depreciation Runs

For Depreciation Run, a depreciation run is scoped to one organization and fiscal period. Run lines select eligible unposted schedule rows and keep the calculation.

Together, posting updates accumulated depreciation and expense through source-linked journals. The run is immutable after posting and is corrected through a new adjustment or reversal.

### REQ-DOM-DEPRECIATION-RUN-001: Depreciation Run organization

A depreciation run retains organization, fiscal period, status, operator, asset schedule lines, totals, and posting journal links.

A depreciation run is scoped to one organization and fiscal period.

Run lines select eligible unposted schedule rows and keep the calculation.

### REQ-DOM-DEPRECIATION-RUN-002: Creates depreciation-expense and accumulated-depreciation entries for each included asset

Posting creates depreciation-expense and accumulated-depreciation entries for each included asset.

Posting updates accumulated depreciation and expense through source-linked journals.

A depreciation run is scoped to one organization and fiscal period.

### REQ-DOM-DEPRECIATION-RUN-003: A posted depreciation run and its lines are immutable

A posted depreciation run and its lines are immutable.

A depreciation run is scoped to one organization and fiscal period.

Run lines select eligible unposted schedule rows and keep the calculation.

## REQ-DOM-ASSET-TRANSFER: Asset Transfers

For Asset Transfer, an asset transfer is scoped to one asset and records old and new custody or location. Transfer attribution and reason provide operational accountability.

Together, the event changes current assignment but not acquisition cost or prior depreciation. Each transfer emits sensitive audit evidence.

### REQ-DOM-ASSET-TRANSFER-001: Asset Transfer asset

An asset transfer retains asset, prior and next custodian, prior and next location, effective date, actor, reason, organization, and audit relation.

An asset transfer is scoped to one asset and records old and new custody or location.

Transfer attribution and reason provide operational accountability.

### REQ-DOM-ASSET-TRANSFER-002: Changes the asset's current custodian and location

Applying a transfer changes the asset's current custodian and location while preserving acquisition cost.

The event changes current assignment but not acquisition cost or prior depreciation.

An asset transfer is scoped to one asset and records old and new custody or location.

## REQ-DOM-ASSET-IMPAIRMENT: Asset Impairments

For Asset Impairment, an impairment is scoped to one asset and records the business date, reason, and amount. The event reduces carrying value while not rewriting acquisition or depreciation history.

Together, posting creates an impairment-loss accounting effect. A posted impairment stays immutable and visible in asset history.

### REQ-DOM-ASSET-IMPAIRMENT-001: Asset Impairment asset

An asset impairment retains asset, date, reason, amount, pre- and post-impairment carrying value, organization, approver if required, and posting journal.

An impairment is scoped to one asset and records the business date, reason, and amount.

The event reduces carrying value while not rewriting acquisition or depreciation history.

### REQ-DOM-ASSET-IMPAIRMENT-002: Creates the source-linked impairment entry

Posting reduces the asset carrying value and creates the source-linked impairment entry.

The event reduces carrying value while not rewriting acquisition or depreciation history.

Posting creates an impairment-loss accounting effect.

### REQ-DOM-ASSET-IMPAIRMENT-003: A posted impairment is immutable

A posted impairment is immutable.

A posted impairment stays immutable and visible in asset history.

An impairment is scoped to one asset and records the business date, reason, and amount.

## REQ-DOM-ASSET-DISPOSAL: Asset Disposals

For Asset Disposal, a disposal is scoped to one asset and uses the book value existing at its disposal date. Sale, scrap, donation, and loss distinguish proceeds and business reason.

Together, posting removes cost and accumulated depreciation and recognizes proceeds plus gain or loss. The disposal and its accounting evidence are immutable.

### REQ-DOM-ASSET-DISPOSAL-001: Asset Disposal asset

An asset disposal retains asset, type, date, reason, proceeds, carrying value, accumulated depreciation, gain or loss, organization, actor, and posting journal.

Posting removes cost and accumulated depreciation and recognizes proceeds plus gain or loss.

A disposal is scoped to one asset and uses the book value existing at its disposal date.

### REQ-DOM-ASSET-DISPOSAL-002: Asset Disposal allowed-value catalog

Disposal types are sale, scrap, donation, and loss.

Sale, scrap, donation, and loss distinguish proceeds and business reason.

A disposal is scoped to one asset and uses the book value existing at its disposal date.

### REQ-DOM-ASSET-DISPOSAL-003: Calculates and records the disposal gain or loss and moves the asset to disposed status

Posting calculates and records the disposal gain or loss and moves the asset to disposed status.

Posting removes cost and accumulated depreciation and recognizes proceeds plus gain or loss.

A disposal is scoped to one asset and uses the book value existing at its disposal date.

### REQ-DOM-ASSET-DISPOSAL-004: A posted disposal is immutable

A posted disposal is immutable.

The disposal and its accounting evidence are immutable.

A disposal is scoped to one asset and uses the book value existing at its disposal date.

## REQ-DOM-BOM: Bill of Materials Lifecycle

For Bill of Materials, a BOM identifies one finished item and a versioned set of component requirements. Each component keeps quantity, scrap, unit, issue warehouse, and required operation.

Together, draft, active, inactive, and superseded states distinguish editable design from production evidence. Changing active content creates a new version and keeps prior production references.

### REQ-DOM-BOM-001: Bill of Materials organization

A bill of materials retains organization, finished item, version, status, effective dates, and component lines.

A BOM identifies one finished item and a versioned set of component requirements.

Each component keeps quantity, scrap, unit, issue warehouse, and required operation.

### REQ-DOM-BOM-002: Bill of Materials component item

Each component line retains component item, quantity per unit, scrap factor, unit, issue warehouse, and required routing operation.

Each component keeps quantity, scrap, unit, issue warehouse, and required operation.

A BOM identifies one finished item and a versioned set of component requirements.

### REQ-DOM-BOM-003: A draft BOM version may become active

A draft BOM version may become active.

Draft, active, inactive, and superseded states distinguish editable design from production evidence.

Changing active content creates a new version and keeps prior production references.

### REQ-DOM-BOM-004: An active BOM may become inactive or superseded

An active BOM may become inactive or superseded.

Draft, active, inactive, and superseded states distinguish editable design from production evidence.

Changing active content creates a new version and keeps prior production references.

### REQ-DOM-BOM-005: Creates a new draft version

Changing an active BOM creates a new draft version while preserving the active version and every production order that references it.

Changing active content creates a new version and keeps prior production references.

Draft, active, inactive, and superseded states distinguish editable design from production evidence.

## REQ-DOM-ROUTING: Routing Lifecycle

For Routing, a routing identifies one finished item and an ordered versioned sequence of operations. Each operation connects work center, times, labor grade, machine, rate, and instructions.

Together, draft and active use are separated so production orders retain the exact process selected. Changing active content creates a new version instead of overwriting prior evidence.

### REQ-DOM-ROUTING-001: Routing organization

A routing retains organization, finished item, version, status, effective dates, and ordered operations.

A routing identifies one finished item and an ordered versioned sequence of operations.

Changing active content creates a new version instead of overwriting prior evidence.

### REQ-DOM-ROUTING-002: Routing sequence

Each operation retains sequence, work center, setup time, run time, labor grade, machine, standard rate, and instructions.

Each operation connects work center, times, labor grade, machine, rate, and instructions.

A routing identifies one finished item and an ordered versioned sequence of operations.

### REQ-DOM-ROUTING-003: A draft routing version may become active or inactive

A draft routing version may become active or inactive.

Draft and active use are separated so production orders retain the exact process selected.

Changing active content creates a new version instead of overwriting prior evidence.

### REQ-DOM-ROUTING-004: Creates a new draft version

Changing an active routing creates a new draft version while preserving the prior version and every production order that references it.

Changing active content creates a new version instead of overwriting prior evidence.

Draft and active use are separated so production orders retain the exact process selected.

## REQ-DOM-WORK-CENTER: Work Centers

For Work Center, a work center is scoped to one organization and warehouse. Capacity calendar, labor rate, machine rate, status, and cost center support scheduling and costing.

Together, routing operations and machines relate to the work center. Inactive or unavailable capacity affects future scheduling while not changing prior production reports.

### REQ-DOM-WORK-CENTER-001: Work Center organization-unique code

A work center retains organization-unique code, name, warehouse, capacity calendar, labor rate, machine rate, status, and cost center.

Capacity calendar, labor rate, machine rate, status, and cost center support scheduling and costing.

A work center is scoped to one organization and warehouse.

### REQ-DOM-WORK-CENTER-002: Routing operations, machines, production labor

Routing operations, machines, production labor, and utilization reporting relate to the work center.

Routing operations and machines relate to the work center.

A work center is scoped to one organization and warehouse.

## REQ-DOM-MACHINE: Machines

For Machine, a machine is scoped to one work center and can also relate to an equipment record for maintenance. Capacity and maintenance status influence routing execution and production scheduling.

Together, machine time contributes to actual production cost and utilization reports. Historical operations retain the machine used even after retirement.

### REQ-DOM-MACHINE-001: Machine organization

A machine retains organization, work center, code, name, capacity, status, maintenance status, and related equipment.

A machine is scoped to one work center and can also relate to an equipment record for maintenance.

Capacity and maintenance status influence routing execution and production scheduling.

### REQ-DOM-MACHINE-002: Routing operations, production reports, maintenance work, downtime

Routing operations, production reports, maintenance work, downtime, and utilization retain the machine relationship.

Machine time contributes to actual production cost and utilization reports.

A machine is scoped to one work center and can also relate to an equipment record for maintenance.

## REQ-DOM-MRP-RUN: MRP Runs

For MRP Run, an MRP run evaluates sales orders, forecasts, purchase supply, on-hand stock, safety stock, and production supply. The run keeps its planning time and input horizon so recommendations stay explainable.

Together, manual and scheduled runs share the same organization and attribution boundaries. Recommendations are distinct records whose acceptance or rejection never rewrites the run.

### REQ-DOM-MRP-RUN-001: MRP Run organization

An MRP run retains organization, planning time and horizon, triggering principal, input supply and demand references, status, and calculation summary.

The run keeps its planning time and input horizon so recommendations stay explainable.

An MRP run evaluates sales orders, forecasts, purchase supply, on-hand stock, safety stock, and production supply.

### REQ-DOM-MRP-RUN-002: The run balances sales orders, forecasts, purchase documents, stock on hand, safety stock

The run balances sales orders, forecasts, purchase documents, stock on hand, safety stock, and production orders.

An MRP run evaluates sales orders, forecasts, purchase supply, on-hand stock, safety stock, and production supply.

The run keeps its planning time and input horizon so recommendations stay explainable.

### REQ-DOM-MRP-RUN-003: Runs preserve equivalent tenant and audit attribution

Manual User and scheduled System runs preserve equivalent tenant and audit attribution.

Manual and scheduled runs share the same organization and attribution boundaries.

An MRP run evaluates sales orders, forecasts, purchase supply, on-hand stock, safety stock, and production supply.

## REQ-DOM-MRP-RECOMMENDATION: MRP Recommendations

For MRP Recommendation, each recommendation is scoped to one MRP run and item-location planning context. Planned purchase, planned production, expedite, delay, and shortage outcomes stay distinct types.

Together, acceptance creates a linked sourcing or production document; dismissal keeps the planning evidence. Quantities and dates explain the recommended response.

### REQ-DOM-MRP-RECOMMENDATION-001: MRP Recommendation MRP run

An MRP recommendation retains MRP run, organization, type, item, warehouse, quantity, required date, source demand, status, and rationale.

Each recommendation is scoped to one MRP run and item-location planning context.

Planned purchase, planned production, expedite, delay, and shortage outcomes stay distinct types.

### REQ-DOM-MRP-RECOMMENDATION-002: MRP Recommendation allowed-value catalog

Recommendation types are planned purchase order, planned production order, expedite, delay, and shortage alert.

Planned purchase, planned production, expedite, delay, and shortage outcomes stay distinct types.

Each recommendation is scoped to one MRP run and item-location planning context.

### REQ-DOM-MRP-RECOMMENDATION-003: An MRP Recommendation for accepted planned relates

An accepted planned recommendation relates to the purchase or production document created from it.

Planned purchase, planned production, expedite, delay, and shortage outcomes stay distinct types.

Acceptance creates a linked sourcing or production document; dismissal keeps the planning evidence.

## REQ-DOM-PRODUCTION-ORDER: Production Order Lifecycle

For Production Order, a production order keeps the exact finished item, BOM version, routing version, warehouse, dates, quantities, and source demand. Draft, released, in-progress, partially completed, completed, closed, and cancelled states distinguish planning from irreversible inventory and cost effects.

Together, component reservations, consumption, labor, machine, overhead, quality, output, scrap, and variance stay traceable to the order. Closure occurs only after all operational and cost evidence is resolved.

### REQ-DOM-PRODUCTION-ORDER-001: Production Order organization

A production order retains organization, finished item, exact BOM and routing versions, planned and completed quantities, scrap, dates, warehouse, source recommendation or demand, status, and detailed lines.

A production order keeps the exact finished item, BOM version, routing version, warehouse, dates, quantities, and source demand.

Component reservations, consumption, labor, machine, overhead, quality, output, scrap, and variance stay traceable to the order.

### REQ-DOM-PRODUCTION-ORDER-002: Production Order component requirements

The order retains component requirements and reservations, consumption movements, labor reports, machine and overhead cost, output receipts, quality inspections, planned cost, actual cost, and variance.

Component reservations, consumption, labor, machine, overhead, quality, output, scrap, and variance stay traceable to the order.

A production order keeps the exact finished item, BOM version, routing version, warehouse, dates, quantities, and source demand.

### REQ-DOM-PRODUCTION-ORDER-003: A draft order may become released and reserve components

A draft order may become released and reserve components.

Draft, released, in-progress, partially completed, completed, closed, and cancelled states distinguish planning from irreversible inventory and cost effects.

A production order keeps the exact finished item, BOM version, routing version, warehouse, dates, quantities, and source demand.

### REQ-DOM-PRODUCTION-ORDER-004: A released order may become in progress and record source-linked component consumption

A released order may become in progress and record source-linked component consumption.

Component reservations, consumption, labor, machine, overhead, quality, output, scrap, and variance stay traceable to the order.

A production order keeps the exact finished item, BOM version, routing version, warehouse, dates, quantities, and source demand.

### REQ-DOM-PRODUCTION-ORDER-005: An Production Order for progress become partially

An in-progress order may become partially completed or completed and create finished-goods output movements.

Draft, released, in-progress, partially completed, completed, closed, and cancelled states distinguish planning from irreversible inventory and cost effects.

A production order keeps the exact finished item, BOM version, routing version, warehouse, dates, quantities, and source demand.

### REQ-DOM-PRODUCTION-ORDER-006: A completed order may become closed and create manufacturing-variance journal entries

A completed order may become closed and create manufacturing-variance journal entries.

Draft, released, in-progress, partially completed, completed, closed, and cancelled states distinguish planning from irreversible inventory and cost effects.

Component reservations, consumption, labor, machine, overhead, quality, output, scrap, and variance stay traceable to the order.

### REQ-DOM-PRODUCTION-ORDER-007: An eligible order may become cancelled

An eligible order may become cancelled while preserving reservations and posted movement effects.

Draft, released, in-progress, partially completed, completed, closed, and cancelled states distinguish planning from irreversible inventory and cost effects.

Component reservations, consumption, labor, machine, overhead, quality, output, scrap, and variance stay traceable to the order.

## REQ-DOM-INSPECTION-PLAN: Inspection Plans

For Inspection Plan, an inspection plan is scoped to one organization, item, and inspection type. Sampling rules determine which quantity or units are tested.

Together, characteristics state the measurements or observations required. Incoming receipt, in-process, final production, and sales-return types keep quality expectations contextual.

### REQ-DOM-INSPECTION-PLAN-001: Inspection Plan organization

An inspection plan retains organization, item, inspection type, sample rules, test characteristics, status, and effective dates.

An inspection plan is scoped to one organization, item, and inspection type.

Sampling rules determine which quantity or units are tested.

### REQ-DOM-INSPECTION-PLAN-002: Inspection Plan allowed-value catalog

Inspection types are incoming receipt, in-process production, final production, and sales return.

Incoming receipt, in-process, final production, and sales-return types keep quality expectations contextual.

An inspection plan is scoped to one organization, item, and inspection type.

### REQ-DOM-INSPECTION-PLAN-003: Inspection Plan the plan version used

Each generated inspection order retains the plan version used.

An inspection plan is scoped to one organization, item, and inspection type.

Sampling rules determine which quantity or units are tested.

## REQ-DOM-INSPECTION-ORDER: Inspection Order Lifecycle

For Inspection Order, an inspection order originates from a purchase receipt, production operation, production completion, or sales return. Pending and in-progress states distinguish queued work from recorded testing.

Together, passed, failed, partially accepted, and waived outcomes drive availability and disposition. Approval freezes the results and keeps test evidence.

### REQ-DOM-INSPECTION-ORDER-001: Inspection Order organization

An inspection order retains organization, inspection plan, source receipt, production operation or completion, or sales return, item, quantity, lot or serial, status, inspector, and results.

An inspection order originates from a purchase receipt, production operation, production completion, or sales return.

Approval freezes the results and keeps test evidence.

### REQ-DOM-INSPECTION-ORDER-002: Inspection Order status catalog

Inspection statuses are pending, in progress, passed, failed, partially accepted, and waived.

Passed, failed, partially accepted, and waived outcomes drive availability and disposition.

Pending and in-progress states distinguish queued work from recorded testing.

### REQ-DOM-INSPECTION-ORDER-003: A pending inspection may become in progress and receive characteristic results

A pending inspection may become in progress and receive characteristic results.

Pending and in-progress states distinguish queued work from recorded testing.

An inspection order originates from a purchase receipt, production operation, production completion, or sales return.

### REQ-DOM-INSPECTION-ORDER-004: Completed testing may become passed, failed, partially accepted, or waived

Completed testing may become passed, failed, partially accepted, or waived.

Passed, failed, partially accepted, and waived outcomes drive availability and disposition.

Pending and in-progress states distinguish queued work from recorded testing.

### REQ-DOM-INSPECTION-ORDER-005: An approved quality result and its measurements are immutable

An approved quality result and its measurements are immutable.

An inspection order originates from a purchase receipt, production operation, production completion, or sales return.

Pending and in-progress states distinguish queued work from recorded testing.

## REQ-DOM-QUARANTINE: Stock Quarantine Lifecycle

For Stock Quarantine, a quarantine links an inspection failure to identified item, location, lot, or serial stock. Held quantity stays in stock history but is excluded from availability.

Together, allocation, shipment, consumption, and available-stock reporting all honor the hold. Approved disposition ends the hold through release, return, scrap, or rework relationships.

### REQ-DOM-QUARANTINE-001: Stock Quarantine organization

A stock quarantine retains organization, inspection order, item, warehouse, location, lot or serial, held quantity, status, reason, and dates.

A quarantine links an inspection failure to identified item, location, lot, or serial stock.

Held quantity stays in stock history but is excluded from availability.

### REQ-DOM-QUARANTINE-002: Failed Stock Quarantine for failed inspection place

Failed inspection may place identified quantity into quarantined status through a source-linked movement.

A quarantine links an inspection failure to identified item, location, lot, or serial stock.

Held quantity stays in stock history but is excluded from availability.

### REQ-DOM-QUARANTINE-003: Quarantined Stock Quarantine for quarantined quantity remains

Quarantined quantity remains traceable but unavailable for allocation, shipment, consumption, or available-stock counts.

Allocation, shipment, consumption, and available-stock reporting all honor the hold.

Held quantity stays in stock history but is excluded from availability.

### REQ-DOM-QUARANTINE-004: Approved Stock Quarantine for approved release disposition

Approved release or disposition ends the hold through traceable release, return, scrap, or rework activity.

Approved disposition ends the hold through release, return, scrap, or rework relationships.

Allocation, shipment, consumption, and available-stock reporting all honor the hold.

## REQ-DOM-DISPOSITION: Quality Disposition Lifecycle

For Quality Disposition, a disposition is scoped to one inspection and affected stock quantity. Accept, reject, rework, return to vendor, scrap, and use-as-is outcomes carry different stock and accounting effects.

Together, material dispositions route for approval before execution. Execution keeps links from inspection and quarantine to the resulting movement or work.

### REQ-DOM-DISPOSITION-001: Quality Disposition organization

A quality disposition retains organization, inspection order, quarantine, affected quantity, decision, reason, requester, approver, status, and resulting action links.

A disposition is scoped to one inspection and affected stock quantity.

Execution keeps links from inspection and quarantine to the resulting movement or work.

### REQ-DOM-DISPOSITION-002: Quality Disposition allowed-value catalog

Allowed decisions are accept, reject, rework, return to vendor, scrap, and use as is.

Accept, reject, rework, return to vendor, scrap, and use-as-is outcomes carry different stock and accounting effects.

A disposition is scoped to one inspection and affected stock quantity.

### REQ-DOM-DISPOSITION-003: A disposition above the configured threshold requires approval before execution

A disposition above the configured threshold requires approval before execution.

Material dispositions route for approval before execution.

A disposition is scoped to one inspection and affected stock quantity.

### REQ-DOM-DISPOSITION-004: Links Quality Disposition for execution links release

Execution links the disposition to release, purchase return, scrap movement, or rework activity and preserves the approved result.

Accept, reject, rework, return to vendor, scrap, and use-as-is outcomes carry different stock and accounting effects.

Execution keeps links from inspection and quarantine to the resulting movement or work.

## REQ-DOM-EQUIPMENT: Equipment Lifecycle

For Equipment, equipment is scoped to one organization and can relate to a production machine, location, cost center, and maintenance plans. Machine, vehicle, tool, and facility types share maintenance identity.

Together, active, under-maintenance, out-of-service, and retired states govern operational availability. Criticality connects downtime to production scheduling consequences.

### REQ-DOM-EQUIPMENT-001: Equipment organization

Equipment retains organization, code, name, type, location, custodian, cost center, criticality, status, and related production machine.

Equipment is scoped to one organization and can relate to a production machine, location, cost center, and maintenance plans.

Criticality connects downtime to production scheduling consequences.

### REQ-DOM-EQUIPMENT-002: Equipment allowed-value catalog

Equipment types are machine, vehicle, tool, and facility.

Machine, vehicle, tool, and facility types share maintenance identity.

Equipment is scoped to one organization and can relate to a production machine, location, cost center, and maintenance plans.

### REQ-DOM-EQUIPMENT-003: Equipment status catalog

Equipment statuses are active, under maintenance, out of service, and retired.

Active, under-maintenance, out-of-service, and retired states govern operational availability.

Equipment is scoped to one organization and can relate to a production machine, location, cost center, and maintenance plans.

### REQ-DOM-EQUIPMENT-004: Maintenance start may move active equipment under maintenance

Maintenance start may move active equipment under maintenance, and completion may restore it to active or leave it out of service.

Active, under-maintenance, out-of-service, and retired states govern operational availability.

Equipment is scoped to one organization and can relate to a production machine, location, cost center, and maintenance plans.

### REQ-DOM-EQUIPMENT-005: Retirement preserves maintenance, downtime, parts, labor, cost

Retirement preserves maintenance, downtime, parts, labor, cost, and production history.

Equipment is scoped to one organization and can relate to a production machine, location, cost center, and maintenance plans.

Criticality connects downtime to production scheduling consequences.

## REQ-DOM-MAINTENANCE-PLAN: Maintenance Plans

For Maintenance Plan, a maintenance plan is scoped to one equipment record. Frequency and next-due date determine when scheduled work should be created.

Together, checklist tasks, required parts, and labor skills define expected execution. Completion advances the next due date while not rewriting earlier work orders.

### REQ-DOM-MAINTENANCE-PLAN-001: Maintenance Plan organization

A maintenance plan retains organization, equipment, frequency, checklist tasks, required parts, required labor skills, next due date, and active status.

Checklist tasks, required parts, and labor skills define expected execution.

A maintenance plan is scoped to one equipment record.

### REQ-DOM-MAINTENANCE-PLAN-002: Maintenance work orders retain the plan and checklist version from which they were scheduled

Maintenance work orders retain the plan and checklist version from which they were scheduled.

A maintenance plan is scoped to one equipment record.

Frequency and next-due date determine when scheduled work should be created.

### REQ-DOM-MAINTENANCE-PLAN-003: Updates the plan's next due date

Completing planned maintenance updates the plan's next due date.

A maintenance plan is scoped to one equipment record.

Frequency and next-due date determine when scheduled work should be created.

## REQ-DOM-MAINTENANCE-ORDER: Maintenance Work Order Lifecycle

For Maintenance Work Order, a maintenance work order is scoped to one equipment item and cost center. Type, priority, schedule, assignee, parts, labor, downtime, and completion notes describe the job.

Together, draft, scheduled, in-progress, completed, and cancelled states distinguish planning from consumed stock and posted cost. Completion updates equipment and the related plan while preserving parts and labor evidence.

### REQ-DOM-MAINTENANCE-ORDER-001: Maintenance Work Order organization

A maintenance work order retains organization, equipment, plan if any, type, priority, scheduled date, assignee, status, parts, labor, downtime, cost center, and completion notes.

Type, priority, schedule, assignee, parts, labor, downtime, and completion notes describe the job.

A maintenance work order is scoped to one equipment item and cost center.

### REQ-DOM-MAINTENANCE-ORDER-002: A draft work order may become scheduled and assigned

A draft work order may become scheduled and assigned.

A maintenance work order is scoped to one equipment item and cost center.

Draft, scheduled, in-progress, completed, and cancelled states distinguish planning from consumed stock and posted cost.

### REQ-DOM-MAINTENANCE-ORDER-003: A scheduled order may become in progress and place equipment under maintenance

A scheduled order may become in progress and place equipment under maintenance.

A maintenance work order is scoped to one equipment item and cost center.

Draft, scheduled, in-progress, completed, and cancelled states distinguish planning from consumed stock and posted cost.

### REQ-DOM-MAINTENANCE-ORDER-004: In-progress work may consume parts through stock movements and record labor and downtime

In-progress work may consume parts through stock movements and record labor and downtime.

Type, priority, schedule, assignee, parts, labor, downtime, and completion notes describe the job.

Draft, scheduled, in-progress, completed, and cancelled states distinguish planning from consumed stock and posted cost.

### REQ-DOM-MAINTENANCE-ORDER-005: Updates equipment status

Completion may create cost-center expense entries, updates equipment status, and advances the maintenance plan's next due date.

A maintenance work order is scoped to one equipment item and cost center.

Completion updates equipment and the related plan while preserving parts and labor evidence.

### REQ-DOM-MAINTENANCE-ORDER-006: An eligible order may become cancelled

An eligible order may become cancelled while preserving already recorded activity.

A maintenance work order is scoped to one equipment item and cost center.

Draft, scheduled, in-progress, completed, and cancelled states distinguish planning from consumed stock and posted cost.

## REQ-DOM-SERVICE-CASE: Service Case Lifecycle

For Service Case, a service case is scoped to one customer and can identify a sold item and serial number. Open, investigating, waiting-on-customer, resolved, closed, and cancelled states capture support progress and SLA timing.

Together, service orders execute work while the case stays the customer-facing issue record. Closure keeps item, serial, order, communication, and resolution history.

### REQ-DOM-SERVICE-CASE-001: Service Case organization

A service case retains organization, customer, item, serial number, issue, priority, SLA timing, assignee, status, dates, and resolution links.

A service case is scoped to one customer and can identify a sold item and serial number.

Service orders execute work while the case stays the customer-facing issue record.

### REQ-DOM-SERVICE-CASE-002: Service Case status catalog

Case statuses are open, investigating, waiting on customer, resolved, closed, and cancelled.

Open, investigating, waiting-on-customer, resolved, closed, and cancelled states capture support progress and SLA timing.

A service case is scoped to one customer and can identify a sold item and serial number.

### REQ-DOM-SERVICE-CASE-003: An open case may become investigating or waiting on customer

An open case may become investigating or waiting on customer.

Open, investigating, waiting-on-customer, resolved, closed, and cancelled states capture support progress and SLA timing.

A service case is scoped to one customer and can identify a sold item and serial number.

### REQ-DOM-SERVICE-CASE-004: An investigated case may become resolved and then closed

An investigated case may become resolved and then closed.

Open, investigating, waiting-on-customer, resolved, closed, and cancelled states capture support progress and SLA timing.

A service case is scoped to one customer and can identify a sold item and serial number.

### REQ-DOM-SERVICE-CASE-005: An eligible case may become cancelled

An eligible case may become cancelled while preserving its service-order and audit history.

A service case is scoped to one customer and can identify a sold item and serial number.

Service orders execute work while the case stays the customer-facing issue record.

## REQ-DOM-SERVICE-ORDER: Service Order Lifecycle

For Service Order, a service order is scoped to one customer and service case and keeps item or serial context. Schedule, assignee, parts, labor, warranty decision, billing decision, and resolution describe execution.

Together, draft, scheduled, in-progress, completed, invoiced, and cancelled states distinguish planning, work, and settlement. Parts and labor create inventory, revenue, or warranty-expense effects according to the decisions.

### REQ-DOM-SERVICE-ORDER-001: Service Order organization

A service order retains organization, customer, case, type, scheduled date, assignee, parts, labor, warranty decision, billing decision, resolution, status, and source links.

Schedule, assignee, parts, labor, warranty decision, billing decision, and resolution describe execution.

A service order is scoped to one customer and service case and keeps item or serial context.

### REQ-DOM-SERVICE-ORDER-002: A draft service order may become scheduled and assigned

A draft service order may become scheduled and assigned.

A service order is scoped to one customer and service case and keeps item or serial context.

Draft, scheduled, in-progress, completed, invoiced, and cancelled states distinguish planning, work, and settlement.

### REQ-DOM-SERVICE-ORDER-003: A scheduled order may become in progress and record service parts and labor

A scheduled order may become in progress and record service parts and labor.

A service order is scoped to one customer and service case and keeps item or serial context.

Schedule, assignee, parts, labor, warranty decision, billing decision, and resolution describe execution.

### REQ-DOM-SERVICE-ORDER-004: An in-progress order may become completed after warranty and billing decisions are recorded

An in-progress order may become completed after warranty and billing decisions are recorded.

Schedule, assignee, parts, labor, warranty decision, billing decision, and resolution describe execution.

Draft, scheduled, in-progress, completed, invoiced, and cancelled states distinguish planning, work, and settlement.

### REQ-DOM-SERVICE-ORDER-005: Links to warranty expense

A completed billable order may become invoiced through a linked sales invoice, while non-billable warranty work links to warranty expense.

Draft, scheduled, in-progress, completed, invoiced, and cancelled states distinguish planning, work, and settlement.

Parts and labor create inventory, revenue, or warranty-expense effects according to the decisions.

### REQ-DOM-SERVICE-ORDER-006: An eligible order may become cancelled

An eligible order may become cancelled while preserving any stock or cost effects.

A service order is scoped to one customer and service case and keeps item or serial context.

Draft, scheduled, in-progress, completed, invoiced, and cancelled states distinguish planning, work, and settlement.

## REQ-DOM-APPROVAL-WORKFLOW: Approval Workflow Lifecycle

For Approval Workflow, an approval workflow is scoped to one organization and target document type. Priority and conditions select the applicable workflow from amount, context, party, warehouse, role, currency, risk, and budget facts.

Together, ordered steps resolve approver type, approval count, escalation interval, and fallback. Configuration change keeps the workflow version used by an in-flight request.

### REQ-DOM-APPROVAL-WORKFLOW-001: Approval Workflow organization

An approval workflow retains organization, target document type, priority, status, effective version, conditions, and ordered steps.

An approval workflow is scoped to one organization and target document type.

Ordered steps resolve approver type, approval count, escalation interval, and fallback.

### REQ-DOM-APPROVAL-WORKFLOW-002: Supported Approval Workflow for supported targets purchase

Supported targets are purchase request, purchase order, vendor bill, vendor bank-account change, sales order, customer credit change, stock adjustment, manual journal, period reopening, tax return, payroll run, asset capitalization, production-order closure, and quality disposition.

Configuration change keeps the workflow version used by an in-flight request.

An approval workflow is scoped to one organization and target document type.

### REQ-DOM-APPROVAL-WORKFLOW-003: Conditions Approval Workflow for conditions amount business

Conditions may use amount, business context, vendor, customer, warehouse, requester role, currency, risk flags, and budget status.

Priority and conditions select the applicable workflow from amount, context, party, warehouse, role, currency, risk, and budget facts.

An approval workflow is scoped to one organization and target document type.

### REQ-DOM-APPROVAL-WORKFLOW-004: Approval Workflow approver type

Each step retains approver type, required approval count, escalation time, and fallback approver.

Ordered steps resolve approver type, approval count, escalation interval, and fallback.

An approval workflow is scoped to one organization and target document type.

### REQ-DOM-APPROVAL-WORKFLOW-005: Approval Workflow allowed-value catalog

Approver types are specific employee, role, department manager, project manager, organization owner, finance manager, and dynamic account owner.

An approval workflow is scoped to one organization and target document type.

Priority and conditions select the applicable workflow from amount, context, party, warehouse, role, currency, risk, and budget facts.

### REQ-DOM-APPROVAL-WORKFLOW-006: Creates a new effective version

Changing an active workflow creates a new effective version while in-flight requests retain the version on which they began.

Configuration change keeps the workflow version used by an in-flight request.

An approval workflow is scoped to one organization and target document type.

## REQ-DOM-APPROVAL-REQUEST: Approval Request Lifecycle

For Approval Request, an approval request is scoped to one source document and one workflow version. Current step and resolved assignments determine who can act.

Together, approve, reject, request changes, delegate, and escalate actions build immutable history. Business fields stay locked while approval is active.

### REQ-DOM-APPROVAL-REQUEST-001: Approval Request organization

An approval request retains organization, source document, workflow version, requester, current step, resolved approvers, status, timestamps, and immutable action history.

An approval request is scoped to one source document and one workflow version.

Current step and resolved assignments determine who can act.

### REQ-DOM-APPROVAL-REQUEST-002: Creates an active request and locks its business fields

Submitting an eligible document creates an active request and locks its business fields.

Business fields stay locked while approval is active.

An approval request is scoped to one source document and one workflow version.

### REQ-DOM-APPROVAL-REQUEST-003: An assigned approver may approve, reject, or request changes

An assigned approver may approve, reject, or request changes.

Approve, reject, request changes, delegate, and escalate actions build immutable history.

An approval request is scoped to one source document and one workflow version.

### REQ-DOM-APPROVAL-REQUEST-004: An assigned approver may delegate an active assignment to another eligible approver

An assigned approver may delegate an active assignment to another eligible approver.

Approve, reject, request changes, delegate, and escalate actions build immutable history.

Business fields stay locked while approval is active.

### REQ-DOM-APPROVAL-REQUEST-005: An overdue step may be escalated to its fallback approver

An overdue step may be escalated to its fallback approver.

Current step and resolved assignments determine who can act.

An approval request is scoped to one source document and one workflow version.

### REQ-DOM-APPROVAL-REQUEST-006: Approves the source document

Meeting a step's required approval count advances the request to the next step, and completing the final step approves the source document.

An approval request is scoped to one source document and one workflow version.

Current step and resolved assignments determine who can act.

### REQ-DOM-APPROVAL-REQUEST-007: Changes ends the current approval path

Rejection or requested changes ends the current approval path while preserving all history.

Approve, reject, request changes, delegate, and escalate actions build immutable history.

An approval request is scoped to one source document and one workflow version.

## REQ-DOM-AUDIT-EVENT: Audit Events

For Audit Event, an audit event is scoped to one organization and identifies the human or System principal responsible. Action, target, before and after values, reason, request context, time, and risk make the event useful for investigation.

Together, audit history outlives deactivation of referenced users, vendors, customers, items, and accounts. Sensitive actions across access, finance, parties, inventory, assets, quality, and tenant administration create events.

### REQ-DOM-AUDIT-EVENT-001: Audit Event organization

An audit event retains organization, principal, action, target entity and identity, before and after values, reason, IP address, user agent, timestamp, and risk level.

Action, target, before and after values, reason, request context, time, and risk make the event useful for investigation.

An audit event is scoped to one organization and identifies the human or System principal responsible.

### REQ-DOM-AUDIT-EVENT-002: Sensitive Audit Event for sensitive classes include

Sensitive event classes include role, permission and workflow changes; journal posting and reversal; period close and reopen; payment posting; reconciliation; payroll posting; vendor-bank and customer-credit changes; inventory adjustment; asset disposal; quality disposition; and organization deletion.

Sensitive actions across access, finance, parties, inventory, assets, quality, and tenant administration create events.

An audit event is scoped to one organization and identifies the human or System principal responsible.

### REQ-DOM-AUDIT-EVENT-003: Records are deactivated

Audit events are immutable and preserve reference meaning after related master records are deactivated.

An audit event is scoped to one organization and identifies the human or System principal responsible.

Action, target, before and after values, reason, request context, time, and risk make the event useful for investigation.

## REQ-DOM-NOTIFICATION: Notification Lifecycle

For Notification, a notification is scoped to one organization, recipient, event or reminder, category, and risk level. Queued and dispatched states distinguish required communication from delivery completion.

Together, high-risk audit events target Owners and relevant managers regardless of ordinary preferences. Failed delivery stays visible for retry while not duplicating the originating business action.

### REQ-DOM-NOTIFICATION-001: Notification organization

A notification retains organization, recipient, source event or reminder, category, risk, delivery choice, status, timestamps, and attempt history.

A notification is scoped to one organization, recipient, event or reminder, category, and risk level.

Queued and dispatched states distinguish required communication from delivery completion.

### REQ-DOM-NOTIFICATION-002: Creates a queued notification

An audit event or scheduled reminder creates a queued notification.

A notification is scoped to one organization, recipient, event or reminder, category, and risk level.

Queued and dispatched states distinguish required communication from delivery completion.

### REQ-DOM-NOTIFICATION-003: Dispatches a queued notification and records successful delivery

A System principal dispatches a queued notification and records successful delivery.

Queued and dispatched states distinguish required communication from delivery completion.

A notification is scoped to one organization, recipient, event or reminder, category, and risk level.

### REQ-DOM-NOTIFICATION-004: A Notification for failed attempt remains

A failed attempt remains queued or failed with history so it can be retried without recreating the source event.

Failed delivery stays visible for retry while not duplicating the originating business action.

A notification is scoped to one organization, recipient, event or reminder, category, and risk level.
