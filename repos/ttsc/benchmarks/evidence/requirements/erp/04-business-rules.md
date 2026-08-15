# Business Rules, Exceptions, and Refusals

These rules make tenant scope, quantities, lifecycle transitions, posting, approval, immutability, correction, and reporting deterministic. Threshold values remain organization configuration; the requirements define when a threshold changes the outcome.

## REQ-RULE-ORG-ACCESS: Organization Isolation Rules

For Organization, every operation and automated action resolves one currently selected organization before accessing business information. Explicit active membership is the prerequisite for organization data visibility.

Together, roles are evaluated only inside the selected membership. Deletion is refused while the organization keeps source-named business obligations.

### REQ-RULE-ORG-ACCESS-001: A read, write, command, report, export, approval, audit event, notification, or background job may access only its active organization

A read, write, command, report, export, approval, audit event, notification, or background job may access only its active organization.

Every operation and automated action resolves one currently selected organization before accessing business information.

Explicit active membership is the prerequisite for organization data visibility.

### REQ-RULE-ORG-ACCESS-002: Receives no data or authority from it

A user without active membership in the selected organization receives no data or authority from it.

Explicit active membership is the prerequisite for organization data visibility.

Every operation and automated action resolves one currently selected organization before accessing business information.

### REQ-RULE-ORG-ACCESS-003: Organization refusal

Organization deletion is refused while pending approvals, active employee contracts, unresolved documents in open periods, or retained posted financial or inventory records exist.

Deletion is refused while the organization keeps source-named business obligations.

Every operation and automated action resolves one currently selected organization before accessing business information.

### REQ-RULE-ORG-ACCESS-004: Must retain at least one active Owner

Every organization must retain at least one active Owner.

Every operation and automated action resolves one currently selected organization before accessing business information.

Explicit active membership is the prerequisite for organization data visibility.

## REQ-RULE-ACCOUNT: User Account Rules

For User Account, one normalized email identifies one global account across memberships. Credential decisions never grant organization authority by themselves.

Together, recovery and deactivation have explicit all-session effects. Profile and credential changes belong to the user instead of an organization manager.

### REQ-RULE-ACCOUNT-001: Must be globally unique

Email identity is compared case-insensitively and must be globally unique.

One normalized email identifies one global account across memberships.

Credential decisions never grant organization authority by themselves.

### REQ-RULE-ACCOUNT-002: User Account refusal

Login is refused for invalid credentials, inactive account status, or absence of active memberships.

One normalized email identifies one global account across memberships.

Credential decisions never grant organization authority by themselves.

### REQ-RULE-ACCOUNT-003: Password change requires the current password

Password change requires the current password, while recovery requires control of the account email.

One normalized email identifies one global account across memberships.

Recovery and deactivation have explicit all-session effects.

### REQ-RULE-ACCOUNT-004: Revokes all previously active sessions

Completing credential recovery revokes all previously active sessions.

Credential decisions never grant organization authority by themselves.

Recovery and deactivation have explicit all-session effects.

### REQ-RULE-ACCOUNT-005: Revokes every session and blocks login

Global account deactivation revokes every session and blocks login while retaining attributed business history.

One normalized email identifies one global account across memberships.

Recovery and deactivation have explicit all-session effects.

### REQ-RULE-ACCOUNT-006: Account reactivation does not restore a separately revoked organization membership

Account reactivation does not restore a separately revoked organization membership.

One normalized email identifies one global account across memberships.

Credential decisions never grant organization authority by themselves.

## REQ-RULE-MEMBERSHIP: Membership and Role Rules

For Organization Membership, a user has at most one membership record in an organization. Invited, active, suspended, and revoked states control organization access independently of the global account.

Together, later members receive Employee baseline unless an Owner assigns more. Role and membership loss take effect immediately for continued requests.

### REQ-RULE-MEMBERSHIP-001: The pair of organization and user identifies at most one membership

The pair of organization and user identifies at most one membership.

A user has at most one membership record in an organization.

Invited, active, suspended, and revoked states control organization access independently of the global account.

### REQ-RULE-MEMBERSHIP-002: Only active memberships may select an organization or perform organization work

Only active memberships may select an organization or perform organization work.

Invited, active, suspended, and revoked states control organization access independently of the global account.

A user has at most one membership record in an organization.

### REQ-RULE-MEMBERSHIP-003: Receives Employee as its baseline role

A later accepted membership receives Employee as its baseline role.

Later members receive Employee baseline unless an Owner assigns more.

Role and membership loss take effect immediately for continued requests.

### REQ-RULE-MEMBERSHIP-004: Effective Organization Membership for effective permission union

Effective permission is the union of assigned roles and contains no cross-organization authority.

A user has at most one membership record in an organization.

Invited, active, suspended, and revoked states control organization access independently of the global account.

### REQ-RULE-MEMBERSHIP-005: Only Owners assign or revoke roles and membership status

Only Owners assign or revoke roles and membership status.

A user has at most one membership record in an organization.

Role and membership loss take effect immediately for continued requests.

### REQ-RULE-MEMBERSHIP-006: Removes access from every existing session

Suspending or revoking membership immediately removes access from every existing session.

Role and membership loss take effect immediately for continued requests.

A user has at most one membership record in an organization.

## REQ-RULE-ROLE: Role Integrity Rules

For Organization Role, built-in roles keep the source-defined authority gradient. Custom roles use the same organization permission catalog while not becoming global grades.

Together, assignments target active memberships and are sensitive changes. Deletion protects every current member assignment.

### REQ-RULE-ROLE-001: Built-in roles cannot be deleted

Built-in roles cannot be deleted.

Built-in roles keep the source-defined authority gradient.

Custom roles use the same organization permission catalog while not becoming global grades.

### REQ-RULE-ROLE-002: A custom role may contain any available permission combination within its organization

A custom role may contain any available permission combination within its organization.

Custom roles use the same organization permission catalog while not becoming global grades.

Built-in roles keep the source-defined authority gradient.

### REQ-RULE-ROLE-003: A role may be assigned only to an active membership in the same organization

A role may be assigned only to an active membership in the same organization.

Custom roles use the same organization permission catalog while not becoming global grades.

Assignments target active memberships and are sensitive changes.

### REQ-RULE-ROLE-004: A custom role cannot be deleted while any member holds it

A custom role cannot be deleted while any member holds it.

Custom roles use the same organization permission catalog while not becoming global grades.

Deletion protects every current member assignment.

### REQ-RULE-ROLE-005: A role or permission change emits an immutable audit event

A role or permission change emits an immutable audit event.

Custom roles use the same organization permission catalog while not becoming global grades.

Built-in roles keep the source-defined authority gradient.

## REQ-RULE-DOC-LINK: Operational Document Traceability

For Operational Document, every numbered document stays unique within organization and type. Upstream and downstream links keep the complete business chain.

Together, each line exposes original, consumed, corrected, and remaining quantity. Downstream correction restores upstream progress while not rewriting posted history.

### REQ-RULE-DOC-LINK-001: A document number is unique within its organization and document type

A document number is unique within its organization and document type.

Every numbered document stays unique within organization and type.

Upstream and downstream links keep the complete business chain.

### REQ-RULE-DOC-LINK-002: Operational Document its upstream

Every operational document retains its upstream and downstream document relationships.

Upstream and downstream links keep the complete business chain.

Downstream correction restores upstream progress while not rewriting posted history.

### REQ-RULE-DOC-LINK-003: A conversion, receipt, shipment, invoice, return, allocation, or payment cannot consume more than source remaining quantity without an approved override

A conversion, receipt, shipment, invoice, return, allocation, or payment cannot consume more than source remaining quantity without an approved override.

Each line exposes original, consumed, corrected, and remaining quantity.

Downstream correction restores upstream progress while not rewriting posted history.

### REQ-RULE-DOC-LINK-004: Records approver, reason, original remainder

An approved quantity override records approver, reason, original remainder, and permitted excess.

Each line exposes original, consumed, corrected, and remaining quantity.

Every numbered document stays unique within organization and type.

### REQ-RULE-DOC-LINK-005: Updates upstream remaining quantities and statuses

Voiding, reversing, returning, crediting, or cancelling downstream work updates upstream remaining quantities and statuses.

Upstream and downstream links keep the complete business chain.

Downstream correction restores upstream progress while not rewriting posted history.

### REQ-RULE-DOC-LINK-006: Financial and stock postings reference the source document that generated them

Financial and stock postings reference the source document that generated them.

Every numbered document stays unique within organization and type.

Upstream and downstream links keep the complete business chain.

## REQ-RULE-FIN-POST: Financial Posting Integrity

For Financial Posting, every financial business event creates a source-linked journal result. Base-currency debit and credit equality is a posting prerequisite.

Together, posting occurs only in an eligible fiscal period and commits all inseparable effects together. Posted history is corrected by new linked evidence instead of mutation.

### REQ-RULE-FIN-POST-001: A Financial Posting for transaction post only

A financial transaction may post only when total base-currency debits equal total base-currency credits.

Base-currency debit and credit equality is a posting prerequisite.

Every financial business event creates a source-linked journal result.

### REQ-RULE-FIN-POST-002: Financial Posting transaction currency

Posting retains transaction currency and the exchange rate used to determine base amounts.

Base-currency debit and credit equality is a posting prerequisite.

Posting occurs only in an eligible fiscal period and commits all inseparable effects together.

### REQ-RULE-FIN-POST-003: New operational posting is allowed only in an open fiscal period

New operational posting is allowed only in an open fiscal period.

Posting occurs only in an eligible fiscal period and commits all inseparable effects together.

Base-currency debit and credit equality is a posting prerequisite.

### REQ-RULE-FIN-POST-004: A correction in a soft-closed period requires approval

A correction in a soft-closed period requires approval.

Posting occurs only in an eligible fiscal period and commits all inseparable effects together.

Every financial business event creates a source-linked journal result.

### REQ-RULE-FIN-POST-005: Hard-closed periods refuse every new posting and document change

Hard-closed periods refuse every new posting and document change.

Base-currency debit and credit equality is a posting prerequisite.

Posting occurs only in an eligible fiscal period and commits all inseparable effects together.

### REQ-RULE-FIN-POST-006: A Financial Posting for multi step succeeds

A multi-step financial posting succeeds with all source-document and journal effects or leaves none of them applied.

Every financial business event creates a source-linked journal result.

Posting occurs only in an eligible fiscal period and commits all inseparable effects together.

### REQ-RULE-FIN-POST-007: Records Financial Posting for posted records immutable

Posted financial records are immutable and corrections use reversal, adjustment, return, credit memo, or a new posting document.

Base-currency debit and credit equality is a posting prerequisite.

Every financial business event creates a source-linked journal result.

## REQ-RULE-JOURNAL: Journal Entry Rules

For Journal Entry, drafts stay editable and deletable until approval or posting begins. Manual thresholds determine required approval.

Together, posting requires complete lines, valid accounts, eligible period, balance, and source context. Posted entries never return to editable draft.

### REQ-RULE-JOURNAL-001: Only a draft journal may be edited or deleted

Only a draft journal may be edited or deleted.

Posted entries never return to editable draft.

Drafts stay editable and deletable until approval or posting begins.

### REQ-RULE-JOURNAL-002: A Journal Entry for manual above approval

A manual journal above the organization approval threshold requires completed approval before posting.

Drafts stay editable and deletable until approval or posting begins.

Manual thresholds determine required approval.

### REQ-RULE-JOURNAL-003: Journal Entry refusal

A journal with inactive or missing account relationships, incomplete currency conversion, or unequal base totals is refused posting.

Drafts stay editable and deletable until approval or posting begins.

Posting requires complete lines, valid accounts, eligible period, balance, and source context.

### REQ-RULE-JOURNAL-004: A posted journal cannot be edited or deleted

A posted journal cannot be edited or deleted.

Posted entries never return to editable draft.

Drafts stay editable and deletable until approval or posting begins.

### REQ-RULE-JOURNAL-005: Must identify the posted entry they correct and record a reason

Reversal and adjustment must identify the posted entry they correct and record a reason.

Posted entries never return to editable draft.

Drafts stay editable and deletable until approval or posting begins.

## REQ-RULE-PERIOD: Fiscal Period Rules

For Fiscal Period, soft close begins control while allowing approved correction. Hard close requires every named module validator to pass.

Together, snapshot results stay reproducible by close cycle. Reopening is exceptional Owner action through approval with reason.

### REQ-RULE-PERIOD-001: Fiscal Period refusal

Hard close is refused while any outstanding receipt, uninvoiced shipment, inventory valuation issue, unreconciled bank activity, draft journal, pending approval, unposted payroll, unposted depreciation, unresolved production order, or open tax return remains.

Hard close requires every named module validator to pass.

Soft close begins control while allowing approved correction.

### REQ-RULE-PERIOD-002: Hard Fiscal Period for hard close freezes

Hard close freezes trial balance, balance sheet, P&L, inventory valuation, AR aging, AP aging, cash balance, budget actual, and tax-summary snapshots.

Hard close requires every named module validator to pass.

Soft close begins control while allowing approved correction.

### REQ-RULE-PERIOD-003: Must reproduce its applicable snapshot

A report against a hard-closed period must reproduce its applicable snapshot.

Hard close requires every named module validator to pass.

Snapshot results stay reproducible by close cycle.

### REQ-RULE-PERIOD-004: Only an Owner may initiate reopening

Only an Owner may initiate reopening, and the request requires approval plus a recorded reason.

Reopening is exceptional Owner action through approval with reason.

Hard close requires every named module validator to pass.

### REQ-RULE-PERIOD-005: Reopening and reclose preserve each prior close cycle and audit history

Reopening and reclose preserve each prior close cycle and audit history.

Snapshot results stay reproducible by close cycle.

Soft close begins control while allowing approved correction.

## REQ-RULE-BANK: Bank Reconciliation Rules

For Bank Reconciliation, a match targets only recognized financial documents in the same organization and currency context. Completion requires statement lines and ending balance to reconcile.

Together, completed evidence is immutable. Reopen requires approval and audit before correction.

### REQ-RULE-BANK-001: A Bank Reconciliation for transaction match only

A bank transaction may match only an eligible customer payment, vendor payment, payroll payment, journal entry, bank transfer, or adjustment in the same organization.

A match targets only recognized financial documents in the same organization and currency context.

Completion requires statement lines and ending balance to reconcile.

### REQ-RULE-BANK-002: A reconciliation cannot complete until included statement activity explains the ending balance from the beginning balance

A reconciliation cannot complete until included statement activity explains the ending balance from the beginning balance.

Completion requires statement lines and ending balance to reconcile.

A match targets only recognized financial documents in the same organization and currency context.

### REQ-RULE-BANK-003: A completed reconciliation cannot be edited

A completed reconciliation cannot be edited.

Completed evidence is immutable.

A match targets only recognized financial documents in the same organization and currency context.

### REQ-RULE-BANK-004: Reopening a completed reconciliation requires approval and emits an audit event

Reopening a completed reconciliation requires approval and emits an audit event.

Reopen requires approval and audit before correction.

Completion requires statement lines and ending balance to reconcile.

## REQ-RULE-TAX Tax Return Filing Rules

A tax return belongs to a jurisdiction and period and must reconcile its lines to posted tax and source activity before filing. Filing freezes the reviewed version. Later correction adds a linked amendment, allowing both the original and changed filing evidence to remain reproducible.

### REQ-RULE-TAX-003 Reconcile a return before filing

A return cannot be filed unless its lines reconcile to posted journals and source documents.

- The filing check compares return lines with posted tax journal entries and their sales-invoice, vendor-bill, payroll, duty, or withholding sources.
- A reconciliation difference leaves the return unfiled and identifies the mismatched line or source.

### REQ-RULE-TAX-004 Keep filed returns immutable

A filed return cannot be edited.

- Filing date, preparer, reviewer, jurisdiction, period, and filed lines remain fixed on the filed version.
- Later payment or correction does not edit that filed evidence.

### REQ-RULE-TAX-005 Correct filing through a linked amendment

A filed-return correction must be a new amendment version linked to the original.

- The amendment is a new version that retains the original filing reference and states its changed lines.
- The original version remains reproducible alongside the amendment.
## REQ-RULE-VENDOR: Vendor Integrity Rules

For Vendor, one primary contact makes the responsible vendor contact unambiguous. Bank-account changes are approval-controlled sensitive actions.

Together, historical purchase relationships prevent deletion. Deactivation keeps vendor identity for documents and reports.

### REQ-RULE-VENDOR-001: Must identify exactly one primary contact

A vendor with contacts must identify exactly one primary contact.

One primary contact makes the responsible vendor contact unambiguous.

Deactivation keeps vendor identity for documents and reports.

### REQ-RULE-VENDOR-002: A vendor bank-account change cannot apply without completed approval

A vendor bank-account change cannot apply without completed approval.

Bank-account changes are approval-controlled sensitive actions.

One primary contact makes the responsible vendor contact unambiguous.

### REQ-RULE-VENDOR-003: Every vendor bank-account change emits an audit event with before and after values

Every vendor bank-account change emits an audit event with before and after values.

Bank-account changes are approval-controlled sensitive actions.

One primary contact makes the responsible vendor contact unambiguous.

### REQ-RULE-VENDOR-004: A vendor with historical purchase documents cannot be deleted and may only be deactivated

A vendor with historical purchase documents cannot be deleted and may only be deactivated.

Historical purchase relationships prevent deletion.

Deactivation keeps vendor identity for documents and reports.

## REQ-RULE-PURCHASE-REQUEST: Purchase Request Rules

For Purchase Request, only the requester changes draft business fields. Submission locks the request until a change decision returns it to draft.

Together, routing uses the complete source-named condition set. Conversion protects line remainder.

### REQ-RULE-PURCHASE-REQUEST-001: Only the requester may edit a draft purchase request

Only the requester may edit a draft purchase request.

Only the requester changes draft business fields.

Submission locks the request until a change decision returns it to draft.

### REQ-RULE-PURCHASE-REQUEST-002: Changes and returns it to draft

A submitted request's business fields remain locked until an approver requests changes and returns it to draft.

Only the requester changes draft business fields.

Submission locks the request until a change decision returns it to draft.

### REQ-RULE-PURCHASE-REQUEST-003: Approval Purchase Request for approval routing depend

Approval routing may depend on amount, department or project context, account, vendor, requester role, and budget availability.

Only the requester changes draft business fields.

Routing uses the complete source-named condition set.

### REQ-RULE-PURCHASE-REQUEST-004: A request line cannot be converted beyond remaining quantity

A request line cannot be converted beyond remaining quantity.

Submission locks the request until a change decision returns it to draft.

Conversion protects line remainder.

### REQ-RULE-PURCHASE-REQUEST-005: A cancelled, rejected, or fully converted request cannot be submitted or converted again

A cancelled, rejected, or fully converted request cannot be submitted or converted again.

Submission locks the request until a change decision returns it to draft.

Only the requester changes draft business fields.

## REQ-RULE-PURCHASE-ORDER: Purchase Order Rules

For Purchase Order, source request quantity and direct-create authority govern entry. Approval freezes business fields.

Together, change orders retain complete before and after evidence. Receipt and unresolved downstream work constrain terminal commands.

### REQ-RULE-PURCHASE-ORDER-001: A request-sourced purchase order may consume only approved request-line remainder

A request-sourced purchase order may consume only approved request-line remainder.

Source request quantity and direct-create authority govern entry.

Approval freezes business fields.

### REQ-RULE-PURCHASE-ORDER-002: Only a user with direct-purchase permission may create an order without a request

Only a user with direct-purchase permission may create an order without a request.

Source request quantity and direct-create authority govern entry.

Approval freezes business fields.

### REQ-RULE-PURCHASE-ORDER-003: An approved purchase order cannot be edited directly

An approved purchase order cannot be edited directly.

Source request quantity and direct-create authority govern entry.

Approval freezes business fields.

### REQ-RULE-PURCHASE-ORDER-004: Records before and after values, requester, approver, reason

A change order records before and after values, requester, approver, reason, and timestamp.

Change orders retain complete before and after evidence.

Source request quantity and direct-create authority govern entry.

### REQ-RULE-PURCHASE-ORDER-005: Purchase Order refusal

Cancellation after any receipt is refused until returns or reversals resolve received quantity.

Source request quantity and direct-create authority govern entry.

Change orders retain complete before and after evidence.

### REQ-RULE-PURCHASE-ORDER-006: Closure is refused while receipts, bills, returns, disputes, or payments remain unresolved

Closure is refused while receipts, bills, returns, disputes, or payments remain unresolved.

Receipt and unresolved downstream work constrain terminal commands.

Source request quantity and direct-create authority govern entry.

## REQ-RULE-RECEIPT: Purchase Receipt Rules

For Purchase Receipt, receipt quantity derives from purchase-order remainder. Tracking requirements follow the item.

Together, posting creates immutable stock effects. Correction never changes the receipt.

### REQ-RULE-RECEIPT-001: A receipt line cannot exceed the source order line's remaining receivable quantity without an approved override

A receipt line cannot exceed the source order line's remaining receivable quantity without an approved override.

Receipt quantity derives from purchase-order remainder.

Correction never changes the receipt.

### REQ-RULE-RECEIPT-002: Must identify valid lots or one serial per unit

Lot-tracked and serial-tracked receipt lines must identify valid lots or one serial per unit.

Receipt quantity derives from purchase-order remainder.

Correction never changes the receipt.

### REQ-RULE-RECEIPT-003: Creates immutable source-linked stock movements

Posting an inventory-item receipt creates immutable source-linked stock movements.

Posting creates immutable stock effects.

Receipt quantity derives from purchase-order remainder.

### REQ-RULE-RECEIPT-004: A posted receipt cannot be edited and is corrected only by purchase return or inventory adjustment

A posted receipt cannot be edited and is corrected only by purchase return or inventory adjustment.

Receipt quantity derives from purchase-order remainder.

Correction never changes the receipt.

## REQ-RULE-VENDOR-BILL: Vendor Bill Rules

For Vendor Bill, bill quantities and prices are evaluated against orders and receipts. Material variance adds an approval requirement.

Together, posting creates AP plus expense or inventory accrual in one result. Posted correction keeps bill and settlement history.

### REQ-RULE-VENDOR-BILL-001: A bill line cannot exceed eligible source order or receipt quantity without an approved override

A bill line cannot exceed eligible source order or receipt quantity without an approved override.

Bill quantities and prices are evaluated against orders and receipts.

Posted correction keeps bill and settlement history.

### REQ-RULE-VENDOR-BILL-002: Three-way match compares purchase-order, receipt

Three-way match compares purchase-order, receipt, and bill quantities and prices.

Bill quantities and prices are evaluated against orders and receipts.

Posted correction keeps bill and settlement history.

### REQ-RULE-VENDOR-BILL-003: Variance beyond configured tolerance requires approval before posting

Variance beyond configured tolerance requires approval before posting.

Material variance adds an approval requirement.

Posting creates AP plus expense or inventory accrual in one result.

### REQ-RULE-VENDOR-BILL-004: Applies accounts payable and expense or inventory-accrual effects atomically

Bill posting applies accounts payable and expense or inventory-accrual effects atomically.

Posting creates AP plus expense or inventory accrual in one result.

Bill quantities and prices are evaluated against orders and receipts.

### REQ-RULE-VENDOR-BILL-005: A posted bill cannot be edited

A posted bill cannot be edited.

Posted correction keeps bill and settlement history.

Bill quantities and prices are evaluated against orders and receipts.

### REQ-RULE-VENDOR-BILL-006: A bill cannot be marked fully paid while an unapplied balance remains, and dispute status remains visible until resolved

A bill cannot be marked fully paid while an unapplied balance remains, and dispute status remains visible until resolved.

Bill quantities and prices are evaluated against orders and receipts.

Posted correction keeps bill and settlement history.

## REQ-RULE-INVENTORY Stock Quantity and Valuation Rules

Immutable movements are the quantity ledger for stock increases and decreases, with reservations and quarantine affecting availability. Organization policy decides whether a stock-decreasing posting may cross below zero. Weighted average is the default valuation: receipts change the running cost and shipments consume that cost for COGS.

### REQ-RULE-INVENTORY-001 Derive stock from immutable movements

Stock quantity and history are derived exclusively from immutable stock movements.

- Every increase or decrease contributes an immutable movement with item, warehouse, location, quantity, cost, type, source, date, and operator.
- Stock history is not rewritten when a later return, reversal, transfer, release, or adjustment occurs.

### REQ-RULE-INVENTORY-002 Apply the negative-stock policy

A stock-decreasing posting is refused when it would create negative available stock unless the organization enables negative stock.

- Available quantity includes stock movements less reservations and quarantined quantity at the affected item and location.
- When negative stock is disabled, the refused posting creates neither a movement nor a partial downstream posting.

### REQ-RULE-INVENTORY-003 Use weighted-average valuation by default

Weighted average is the default costing method; receipts update the running average and shipments use it for COGS.

- Each receipt recalculates the running weighted average from prior value and incoming quantity and cost.
- A shipment uses the effective running average to post COGS while preserving its source document.
## REQ-RULE-CUSTOMER: Customer Credit and History Rules

For Customer, one primary contact identifies the responsible customer contact. Credit-limit change is a sensitive approval-controlled action.

Together, exposure is checked before order approval. Historical sales prevent deletion.

### REQ-RULE-CUSTOMER-001: Must identify exactly one primary contact

A customer with contacts must identify exactly one primary contact.

One primary contact identifies the responsible customer contact.

Credit-limit change is a sensitive approval-controlled action.

### REQ-RULE-CUSTOMER-002: A credit-limit change cannot apply without completed approval and an audit event

A credit-limit change cannot apply without completed approval and an audit event.

Credit-limit change is a sensitive approval-controlled action.

Exposure is checked before order approval.

### REQ-RULE-CUSTOMER-003: Sales-order approval checks current credit exposure against the limit

Sales-order approval checks current credit exposure against the limit.

Credit-limit change is a sensitive approval-controlled action.

Exposure is checked before order approval.

### REQ-RULE-CUSTOMER-004: A customer with historical sales cannot be deleted and may only be deactivated

A customer with historical sales cannot be deleted and may only be deactivated.

Historical sales prevent deletion.

One primary contact identifies the responsible customer contact.

## REQ-RULE-SALES-ORDER: Sales Order Rules

For Sales Order, quote-sourced orders require accepted quote status. Credit excess adds approval before allocation.

Together, line quantities stay bounded across allocation, shipment, invoice, return, and cancellation. Post-shipment cancellation waits for corrective documents.

### REQ-RULE-SALES-ORDER-001: A quote may create a sales order only

A quote may create a sales order only while accepted and unconverted.

Quote-sourced orders require accepted quote status.

Credit excess adds approval before allocation.

### REQ-RULE-SALES-ORDER-002: An order that exceeds customer credit limit requires approval before it can become approved

An order that exceeds customer credit limit requires approval before it can become approved.

Credit excess adds approval before allocation.

Quote-sourced orders require accepted quote status.

### REQ-RULE-SALES-ORDER-003: Allocated, shipped, invoiced, returned, and cancelled quantities cannot exceed ordered quantity after approved overrides are considered

Allocated, shipped, invoiced, returned, and cancelled quantities cannot exceed ordered quantity after approved overrides are considered.

Line quantities stay bounded across allocation, shipment, invoice, return, and cancellation.

Quote-sourced orders require accepted quote status.

### REQ-RULE-SALES-ORDER-004: Only approved orders may allocate stock

Only approved orders may allocate stock.

Quote-sourced orders require accepted quote status.

Credit excess adds approval before allocation.

### REQ-RULE-SALES-ORDER-005: An order cannot be cancelled after shipment until returns or credits resolve downstream effects

An order cannot be cancelled after shipment until returns or credits resolve downstream effects.

Line quantities stay bounded across allocation, shipment, invoice, return, and cancellation.

Post-shipment cancellation waits for corrective documents.

### REQ-RULE-SALES-ORDER-006: Sales Order refusal

Closure is refused while fulfillment, invoice, return, credit, or payment work remains unresolved.

Line quantities stay bounded across allocation, shipment, invoice, return, and cancellation.

Credit excess adds approval before allocation.

## REQ-RULE-ALLOCATION: Stock Allocation Rules

For Stock Allocation, only eligible stock is reservable. Reservation accounts for existing allocations and quarantine.

Together, concurrent requests cannot over-allocate. Release is limited to unconsumed quantity.

### REQ-RULE-ALLOCATION-001: Allocation Stock Allocation for only available quarantined

Allocation may use only available, non-quarantined stock in the selected organization and warehouse.

Only eligible stock is reservable.

Reservation accounts for existing allocations and quarantine.

### REQ-RULE-ALLOCATION-002: Concurrent allocations cannot reserve the same available quantity twice

Concurrent allocations cannot reserve the same available quantity twice.

Concurrent requests cannot over-allocate.

Reservation accounts for existing allocations and quarantine.

### REQ-RULE-ALLOCATION-003: A partial allocation preserves unallocated order remainder

A partial allocation preserves unallocated order remainder.

Only eligible stock is reservable.

Reservation accounts for existing allocations and quarantine.

### REQ-RULE-ALLOCATION-004: Only unconsumed allocated quantity may be released

Only unconsumed allocated quantity may be released.

Release is limited to unconsumed quantity.

Only eligible stock is reservable.

### REQ-RULE-ALLOCATION-005: Shipment cannot consume more than the linked allocation and eligible order remainder

Shipment cannot consume more than the linked allocation and eligible order remainder.

Only eligible stock is reservable.

Concurrent requests cannot over-allocate.

## REQ-RULE-SHIPMENT: Shipment Rules

For Shipment, shipment lines derive from order and allocation remainder. Tracked items require lot or serial evidence.

Together, shipping applies stock and COGS atomically. Posted shipment correction uses returns or reversal.

### REQ-RULE-SHIPMENT-001: A shipment line cannot exceed eligible allocated and unshipped order quantity without an approved override

A shipment line cannot exceed eligible allocated and unshipped order quantity without an approved override.

Shipment lines derive from order and allocation remainder.

Posted shipment correction uses returns or reversal.

### REQ-RULE-SHIPMENT-002: Lot-tracked and serial-tracked shipment lines require valid lot or one serial per unit

Lot-tracked and serial-tracked shipment lines require valid lot or one serial per unit.

Tracked items require lot or serial evidence.

Shipment lines derive from order and allocation remainder.

### REQ-RULE-SHIPMENT-003: Applies stock decrease, order shipped quantity, allocation consumption

Posting shipment applies stock decrease, order shipped quantity, allocation consumption, and COGS entry atomically.

Shipping applies stock and COGS atomically.

Shipment lines derive from order and allocation remainder.

### REQ-RULE-SHIPMENT-004: A posted shipment cannot be edited

A posted shipment cannot be edited.

Posted shipment correction uses returns or reversal.

Shipment lines derive from order and allocation remainder.

### REQ-RULE-SHIPMENT-005: A Shipment for posted corrected through

A posted shipment is corrected through a sales return or explicit reversal rather than cancellation.

Posted shipment correction uses returns or reversal.

Shipment lines derive from order and allocation remainder.

## REQ-RULE-SALES-INVOICE: Sales Invoice Rules

For Sales Invoice, billable quantity comes from shipment or approved advance-billing policy. Tax derives from line and party facts.

Together, posting applies receivable, revenue, discount, and tax in one result. Payment, overdue, void, and credit do not rewrite the posted invoice.

### REQ-RULE-SALES-INVOICE-001: Invoice quantity cannot exceed shipped and uninvoiced quantity unless advance billing is enabled by organization policy

Invoice quantity cannot exceed shipped and uninvoiced quantity unless advance billing is enabled by organization policy.

Billable quantity comes from shipment or approved advance-billing policy.

Payment, overdue, void, and credit do not rewrite the posted invoice.

### REQ-RULE-SALES-INVOICE-002: Uses party location, item taxability, date

Invoice output tax uses party location, item taxability, date, and tax code.

Tax derives from line and party facts.

Payment, overdue, void, and credit do not rewrite the posted invoice.

### REQ-RULE-SALES-INVOICE-003: Applies accounts receivable, revenue, discount

Posting applies accounts receivable, revenue, discount, and tax effects atomically.

Posting applies receivable, revenue, discount, and tax in one result.

Billable quantity comes from shipment or approved advance-billing policy.

### REQ-RULE-SALES-INVOICE-004: A posted invoice cannot be edited

A posted invoice cannot be edited.

Payment, overdue, void, and credit do not rewrite the posted invoice.

Billable quantity comes from shipment or approved advance-billing policy.

### REQ-RULE-SALES-INVOICE-005: Becomes overdue

An unpaid posted invoice past its terms becomes overdue.

Payment, overdue, void, and credit do not rewrite the posted invoice.

Billable quantity comes from shipment or approved advance-billing policy.

### REQ-RULE-SALES-INVOICE-006: Uses void, credit memo, refund, or adjustment with source links

Correction uses void, credit memo, refund, or adjustment with source links.

Payment, overdue, void, and credit do not rewrite the posted invoice.

Billable quantity comes from shipment or approved advance-billing policy.

## REQ-RULE-SALES-RETURN Sales Return Rules

A sales return is bounded by the still-returnable quantity on its source shipment. Restockable and non-restockable lines have different inventory consequences, and posting keeps the return as the source for the applicable receivable, revenue, tax, COGS, or loss effects. Credit issuance and settlement are governed independently.

### REQ-RULE-SALES-RETURN-001 Bind a return to remaining shipped quantity

A sales return must reference a source shipment and cannot exceed remaining returnable quantity.

- The return retains its originating shipment line and the quantity already returned against that line.
- A request above the shipment line's unreturned quantity is refused without changing return or shipment balances.

### REQ-RULE-SALES-RETURN-002 Restore only restockable returned stock

Only restockable returned quantity restores inventory.

- Restockability is recorded for each accepted return line.
- Non-restockable quantity remains out of available stock and is accounted for as the applicable loss.

### REQ-RULE-SALES-RETURN-003 Post the return's financial effects

Posting a return creates the applicable revenue, receivable, tax, COGS reversal, or loss effects.

- The posted return remains the source for revenue, receivable, tax, and COGS reversals that apply to the original sale.
- Any non-restockable value is distinguished from inventory restoration.
## REQ-RULE-PAYROLL: Payroll Rules

For Payroll Run, hourly import uses only approved time. Calculation keeps every earning, deduction, tax, benefit, and dimension detail.

Together, posting and payment are distinct financial events. Posted correction uses reversal or adjustment.

### REQ-RULE-PAYROLL-001: Only approved timesheets may be imported for hourly payroll

Only approved timesheets may be imported for hourly payroll.

Hourly import uses only approved time.

Calculation keeps every earning, deduction, tax, benefit, and dimension detail.

### REQ-RULE-PAYROLL-002: Payroll Payroll Run for calculation regular overtime

Payroll calculation preserves regular pay, overtime, bonus, commission, reimbursement, deductions, employer and employee taxes, benefits, net pay, and accounting dimensions per employee.

Calculation keeps every earning, deduction, tax, benefit, and dimension detail.

Hourly import uses only approved time.

### REQ-RULE-PAYROLL-003: A payroll run cannot post before approval

A payroll run cannot post before approval.

Hourly import uses only approved time.

Calculation keeps every earning, deduction, tax, benefit, and dimension detail.

### REQ-RULE-PAYROLL-004: Applies payroll expense, tax liability, benefit liability

Posting applies payroll expense, tax liability, benefit liability, and payroll payable atomically.

Calculation keeps every earning, deduction, tax, benefit, and dimension detail.

Posting and payment are distinct financial events.

### REQ-RULE-PAYROLL-005: Payment cannot exceed payroll payable and reduces the selected bank balance

Payment cannot exceed payroll payable and reduces the selected bank balance.

Posting and payment are distinct financial events.

Hourly import uses only approved time.

### REQ-RULE-PAYROLL-006: A posted payroll run cannot be edited and is corrected through reversal or adjustment run

A posted payroll run cannot be edited and is corrected through reversal or adjustment run.

Posted correction uses reversal or adjustment.

Hourly import uses only approved time.

### REQ-RULE-PAYROLL-007: An Employee may view only their own payslips

An Employee may view only their own payslips.

Hourly import uses only approved time.

Calculation keeps every earning, deduction, tax, benefit, and dimension detail.

## REQ-RULE-BUDGET: Budget Rules

For Budget, approval activates one version. Active content changes through a new version.

Together, commitments stay distinct from actual postings. Organization policy selects warning or hard block.

### REQ-RULE-BUDGET-001: An active budget cannot be edited directly

An active budget cannot be edited directly.

Active content changes through a new version.

Approval activates one version.

### REQ-RULE-BUDGET-002: Creates a new linked version with reason and approval history

A revision creates a new linked version with reason and approval history.

Approval activates one version.

Active content changes through a new version.

### REQ-RULE-BUDGET-003: Purchase requests, purchase orders, vendor bills, payroll runs, manual journals

Purchase requests, purchase orders, vendor bills, payroll runs, manual journals, and production orders may consume budget.

Approval activates one version.

Active content changes through a new version.

### REQ-RULE-BUDGET-004: Commitment and posted actual amounts are tracked separately

Commitment and posted actual amounts are tracked separately.

Commitments stay distinct from actual postings.

Approval activates one version.

### REQ-RULE-BUDGET-005: Refuses the transaction according to organization policy

A budget check either warns or refuses the transaction according to organization policy.

Organization policy selects warning or hard block.

Approval activates one version.

## REQ-RULE-ASSET: Fixed Asset Rules

For Fixed Asset, material capitalization requires approval. Depreciation follows fiscal period and asset parameters.

Together, transfer affects custody, not acquisition value. Impairment and disposal use posted immutable events.

### REQ-RULE-ASSET-001: Capitalization above the organization threshold requires approval

Capitalization above the organization threshold requires approval.

Material capitalization requires approval.

Depreciation follows fiscal period and asset parameters.

### REQ-RULE-ASSET-002: Uses the asset's method, useful life, residual value

Depreciation uses the asset's method, useful life, residual value, and fiscal-period schedule.

Depreciation follows fiscal period and asset parameters.

Transfer affects custody, not acquisition value.

### REQ-RULE-ASSET-003: An asset transfer cannot change acquisition cost

An asset transfer cannot change acquisition cost.

Transfer affects custody, not acquisition value.

Depreciation follows fiscal period and asset parameters.

### REQ-RULE-ASSET-004: Posts impairment loss

Impairment reduces carrying value and posts impairment loss.

Transfer affects custody, not acquisition value.

Impairment and disposal use posted immutable events.

### REQ-RULE-ASSET-005: Calculates gain or loss from proceeds and carrying value and posts the result

Disposal calculates gain or loss from proceeds and carrying value and posts the result.

Transfer affects custody, not acquisition value.

Impairment and disposal use posted immutable events.

### REQ-RULE-ASSET-006: Posted depreciation, impairment, and disposal records cannot be edited

Posted depreciation, impairment, and disposal records cannot be edited.

Impairment and disposal use posted immutable events.

Depreciation follows fiscal period and asset parameters.

## REQ-RULE-BOM BOM Version Rules

An active bill of materials is changed by adding a version, not by rewriting the component design already used by production. Each production order retains the exact version selected for its finished item. Historical drafted, inactive, and superseded versions remain visible, while only an active matching version is eligible for a new order.

### REQ-RULE-BOM-001 Version an active BOM change

Changing an active BOM creates a new version and preserves the prior version.

- The prior BOM version keeps its component quantities, scrap factors, units, issue warehouses, required operations, and status.
- The replacement receives a distinct version identity and may progress independently.

### REQ-RULE-BOM-002 Retain the production order's BOM version

A production order retains the exact BOM version selected at creation.

- Component reservation, consumption, cost, and variance continue to use the version captured when the production order was created.
- Later BOM activation or supersession does not rewrite an existing order.

### REQ-RULE-BOM-003 Select only an active BOM for new production

New production may select only an active BOM valid for the finished item.

- Eligibility is evaluated for the order's finished item at selection time.
- Drafted, inactive, or superseded BOM versions remain visible as history but cannot be chosen for a new order.
## REQ-RULE-PRODUCTION: Production Order Rules

For Production Order, release reserves eligible components. Consumption and output use immutable movements.

Together, cost distinguishes planned and actual categories. Closure waits for complete operational, quality, and financial evidence.

### REQ-RULE-PRODUCTION-001: Release cannot reserve quarantined stock and cannot exceed available components unless negative stock is allowed

Release cannot reserve quarantined stock and cannot exceed available components unless negative stock is allowed.

Release reserves eligible components.

Consumption and output use immutable movements.

### REQ-RULE-PRODUCTION-002: Records component consumption through source-linked movements

Starting or continuing production records component consumption through source-linked movements.

Consumption and output use immutable movements.

Release reserves eligible components.

### REQ-RULE-PRODUCTION-003: Records finished output through source-linked movements

Completion records finished output through source-linked movements.

Consumption and output use immutable movements.

Release reserves eligible components.

### REQ-RULE-PRODUCTION-004: Production Order material

Actual cost separately retains material, labor, machine, and overhead amounts plus variance.

Cost distinguishes planned and actual categories.

Release reserves eligible components.

### REQ-RULE-PRODUCTION-005: Production Order refusal

Production closure is refused while component consumption, labor reporting, output receipt, quality inspection, or cost posting remains unresolved.

Consumption and output use immutable movements.

Closure waits for complete operational, quality, and financial evidence.

### REQ-RULE-PRODUCTION-006: Posts manufacturing variance

Closing posts manufacturing variance.

Release reserves eligible components.

Consumption and output use immutable movements.

### REQ-RULE-PRODUCTION-007: Cancellation preserves every posted reservation release, movement, labor, quality

Cancellation preserves every posted reservation release, movement, labor, quality, and cost effect.

Release reserves eligible components.

Cost distinguishes planned and actual categories.

## REQ-RULE-QUALITY: Quality Rules

For Quality Disposition, failed inspection can create a hold on identified stock. Held stock is excluded from every consumption and availability path.

Together, disposition values are a closed source-defined set. Material decisions require approval and approved results stay immutable.

### REQ-RULE-QUALITY-001: Quarantined stock cannot be allocated, shipped, consumed, or counted as available

Quarantined stock cannot be allocated, shipped, consumed, or counted as available.

Failed inspection can create a hold on identified stock.

Held stock is excluded from every consumption and availability path.

### REQ-RULE-QUALITY-002: Must be accept, reject, rework, return to vendor, scrap, or use as is

A disposition decision must be accept, reject, rework, return to vendor, scrap, or use as is.

Disposition values are a closed source-defined set.

Failed inspection can create a hold on identified stock.

### REQ-RULE-QUALITY-003: A disposition above the configured threshold requires approval

A disposition above the configured threshold requires approval.

Disposition values are a closed source-defined set.

Material decisions require approval and approved results stay immutable.

### REQ-RULE-QUALITY-004: An approved quality result cannot be edited

An approved quality result cannot be edited.

Material decisions require approval and approved results stay immutable.

Failed inspection can create a hold on identified stock.

### REQ-RULE-QUALITY-005: Quality Disposition inspection

Return, scrap, rework, or release retains inspection, quarantine, disposition, and stock-movement links.

Failed inspection can create a hold on identified stock.

Held stock is excluded from every consumption and availability path.

## REQ-RULE-MAINTENANCE: Maintenance Rules

For Maintenance Work Order, part use always creates stock evidence. Labor cost can create a cost-center posting.

Together, completion synchronizes equipment and plan state. Critical downtime can refuse dependent production scheduling.

### REQ-RULE-MAINTENANCE-001: Creates source-linked stock movements

Maintenance parts consumption creates source-linked stock movements.

Part use always creates stock evidence.

Labor cost can create a cost-center posting.

### REQ-RULE-MAINTENANCE-002: Eligible maintenance labor may post cost-center expense

Eligible maintenance labor may post cost-center expense.

Labor cost can create a cost-center posting.

Part use always creates stock evidence.

### REQ-RULE-MAINTENANCE-003: Updates equipment status and maintenance-plan next due date

Completion updates equipment status and maintenance-plan next due date.

Completion synchronizes equipment and plan state.

Part use always creates stock evidence.

### REQ-RULE-MAINTENANCE-004: Maintenance Work Order refusal

Production scheduling is refused when it depends on critical equipment currently in downtime.

Critical downtime can refuse dependent production scheduling.

Completion synchronizes equipment and plan state.

## REQ-RULE-SERVICE: Service Rules

For Service Order, parts always create stock movements. Warranty and billing decisions are explicit and mutually consistent.

Together, billable work creates sales receivable; non-billable warranty work creates expense. Completion keeps case and serial traceability.

### REQ-RULE-SERVICE-001: Creates source-linked stock movements

Service parts consumption creates source-linked stock movements.

Parts always create stock movements.

Billable work creates sales receivable; non-billable warranty work creates expense.

### REQ-RULE-SERVICE-002: Service labor is either billed or posted as warranty expense

Service labor is either billed or posted as warranty expense.

Billable work creates sales receivable; non-billable warranty work creates expense.

Warranty and billing decisions are explicit and mutually consistent.

### REQ-RULE-SERVICE-003: A non-billable warranty decision cannot also create a customer charge for the same work

A non-billable warranty decision cannot also create a customer charge for the same work.

Billable work creates sales receivable; non-billable warranty work creates expense.

Parts always create stock movements.

### REQ-RULE-SERVICE-004: Creates a source-linked sales invoice

Billable service creates a source-linked sales invoice.

Billable work creates sales receivable; non-billable warranty work creates expense.

Parts always create stock movements.

### REQ-RULE-SERVICE-005: Service Order customer

Service completion retains customer, case, item, serial, parts, labor, warranty, billing, and resolution relationships.

Completion keeps case and serial traceability.

Warranty and billing decisions are explicit and mutually consistent.

## REQ-RULE-APPROVAL: Approval Workflow Rules

For Approval Request, one effective workflow version is selected by priority and conditions. Each current step resolves eligible approvers and required count.

Together, documents stay locked while active approval exists. Every action and assignment change stays immutable.

### REQ-RULE-APPROVAL-001: Selects the highest-priority active workflow whose target and conditions match the document

Approval routing selects the highest-priority active workflow whose target and conditions match the document.

One effective workflow version is selected by priority and conditions.

Documents stay locked while active approval exists.

### REQ-RULE-APPROVAL-002: Only a resolved current-step approver may approve, reject, request changes, or delegate

Only a resolved current-step approver may approve, reject, request changes, or delegate.

Each current step resolves eligible approvers and required count.

One effective workflow version is selected by priority and conditions.

### REQ-RULE-APPROVAL-003: The same person cannot count more than once toward one step's required approvals

The same person cannot count more than once toward one step's required approvals.

Each current step resolves eligible approvers and required count.

One effective workflow version is selected by priority and conditions.

### REQ-RULE-APPROVAL-004: A document under active approval cannot have business fields edited

A document under active approval cannot have business fields edited.

Documents stay locked while active approval exists.

One effective workflow version is selected by priority and conditions.

### REQ-RULE-APPROVAL-005: Delegation cannot create a loop and remains recorded in history

Delegation cannot create a loop and remains recorded in history.

Every action and assignment change stays immutable.

One effective workflow version is selected by priority and conditions.

### REQ-RULE-APPROVAL-006: An overdue step escalates to its configured fallback approver

An overdue step escalates to its configured fallback approver.

Each current step resolves eligible approvers and required count.

One effective workflow version is selected by priority and conditions.

### REQ-RULE-APPROVAL-007: Approval history is immutable

Approval history is immutable.

Documents stay locked while active approval exists.

Every action and assignment change stays immutable.

## REQ-RULE-AUDIT: Audit and Notification Rules

For Audit Event, audit evidence is immutable and organization-scoped. Sensitive classes have mandatory event emission.

Together, deactivation never severs historical attribution. High-risk events trigger mandatory recipients.

### REQ-RULE-AUDIT-001: Records Audit Event for records actor action

Every audit event records organization, actor, action, target and identity, before and after values, reason, IP address, user agent, timestamp, and risk level.

Audit evidence is immutable and organization-scoped.

Sensitive classes have mandatory event emission.

### REQ-RULE-AUDIT-002: Audit events cannot be changed or deleted through ordinary product operations

Audit events cannot be changed or deleted through ordinary product operations.

Audit evidence is immutable and organization-scoped.

High-risk events trigger mandatory recipients.

### REQ-RULE-AUDIT-003: Audit Audit Event for history remains readable

Audit history remains readable after referenced users, vendors, customers, items, or accounts are deactivated.

Audit evidence is immutable and organization-scoped.

Sensitive classes have mandatory event emission.

### REQ-RULE-AUDIT-004: Must emit audit events

The source-named sensitive actions must emit audit events.

Audit evidence is immutable and organization-scoped.

Sensitive classes have mandatory event emission.

### REQ-RULE-AUDIT-005: Must Audit Event for high risk must

A high-risk event must notify organization Owners and relevant managers regardless of ordinary notification preferences.

High-risk events trigger mandatory recipients.

Audit evidence is immutable and organization-scoped.

## REQ-RULE-REPORT: Report Rules

For Cross-Module Reporting, every report and export uses currently selected organization and role scope. Named dimensions apply where meaningful to the report.

Together, financial and inventory views exclude editable drafts. Exports and hard-close reports reproduce their source result.

### REQ-RULE-REPORT-001: Reports and exports return only data visible in the active organization and caller authority

Reports and exports return only data visible in the active organization and caller authority.

Every report and export uses currently selected organization and role scope.

Exports and hard-close reports reproduce their source result.

### REQ-RULE-REPORT-002: Applicable Cross-Module Reporting for applicable filters fiscal

Applicable filters are fiscal period, date range, department, project, cost center, warehouse, customer, vendor, item, account, employee, currency, and document status.

Every report and export uses currently selected organization and role scope.

Named dimensions apply where meaningful to the report.

### REQ-RULE-REPORT-003: Reports use posted journal entries rather than editable drafts

Financial reports use posted journal entries rather than editable drafts.

Financial and inventory views exclude editable drafts.

Exports and hard-close reports reproduce their source result.

### REQ-RULE-REPORT-004: Reports use immutable stock movements rather than editable drafts

Inventory reports use immutable stock movements rather than editable drafts.

Financial and inventory views exclude editable drafts.

Exports and hard-close reports reproduce their source result.

### REQ-RULE-REPORT-005: Must preserve the selected report, filters, organization, currency

An export must preserve the selected report, filters, organization, currency, and result.

Every report and export uses currently selected organization and role scope.

Named dimensions apply where meaningful to the report.

### REQ-RULE-REPORT-006: Must reproduce the applicable closing snapshot

A hard-closed-period report must reproduce the applicable closing snapshot.

Exports and hard-close reports reproduce their source result.

Every report and export uses currently selected organization and role scope.

## REQ-RULE-CONCURRENCY: Concurrent Command Rules

For Concurrent Business Command, commands make decisions against a known current business version. A conflicting later command receives refusal instead of silently overwriting accepted work.

Together, remainders, stock, document numbers, and lifecycle states are protected together. Retry reads the current state before proposing a new valid action.

### REQ-RULE-CONCURRENCY-001: Concurrent Business Command refusal

A state-changing command is refused when the target changed after the caller read the version used for its decision.

Commands make decisions against a known current business version.

A conflicting later command receives refusal instead of silently overwriting accepted work.

### REQ-RULE-CONCURRENCY-002: Concurrent source-quantity conversions cannot together exceed remaining quantity

Concurrent source-quantity conversions cannot together exceed remaining quantity.

Remainders, stock, document numbers, and lifecycle states are protected together.

Commands make decisions against a known current business version.

### REQ-RULE-CONCURRENCY-003: Concurrent stock allocations cannot together exceed eligible availability

Concurrent stock allocations cannot together exceed eligible availability.

Remainders, stock, document numbers, and lifecycle states are protected together.

Commands make decisions against a known current business version.

### REQ-RULE-CONCURRENCY-004: Concurrent document creation cannot issue the same organization-and-type number

Concurrent document creation cannot issue the same organization-and-type number.

Remainders, stock, document numbers, and lifecycle states are protected together.

Commands make decisions against a known current business version.

### REQ-RULE-CONCURRENCY-005: Posting, payment, approval, close, and reversal commands cannot apply the same terminal effect twice

Posting, payment, approval, close, and reversal commands cannot apply the same terminal effect twice.

Commands make decisions against a known current business version.

A conflicting later command receives refusal instead of silently overwriting accepted work.

### REQ-RULE-CONCURRENCY-006: A Concurrent Business Command for conflict response returns

A conflict response returns current state information sufficient for an authorized user to refresh and retry.

Retry reads the current state before proposing a new valid action.

Commands make decisions against a known current business version.
## REQ-RULE-EMPLOYEE Employee Identity and Visibility Rules

Employee placement connects a global user to one organization, but it does not replace the membership and scoped roles that authorize work. Placement carries the employee's department, position, manager, and cost center. Personal employment and payroll details use a narrower need-to-know boundary than ordinary directory information, while deactivation or termination leaves attributed work and financial history intact.

### REQ-RULE-EMPLOYEE-001 Separate employee placement from membership authority

An employee links one user and one organization while membership authority remains separately evaluated.

- The employee record carries organizational placement—role, department, position, manager, and cost center—without becoming the source of organization permissions.
- Membership state and scoped-role assignments continue to decide whether the linked user may act in the organization.

### REQ-RULE-EMPLOYEE-005 Limit employee and payroll information visibility

Employee and payroll information is visible only to the employee and authorized HR, payroll, finance, or scoped managers as applicable.

- The employee can view their own employment and payroll details; HR and payroll users may view the details needed for administration, Finance users may view payroll-accounting details, and a scoped manager may view only employees inside that responsibility scope.
- Deactivation or termination does not erase payroll, time, document, approval, or audit attribution.

## REQ-RULE-CONTRACT Employment Contract Rules

An employment contract defines one employee's terms for an effective interval. At most one interval is active: activating a replacement closes the prior interval on the preceding day. Expired terms remain immutable evidence for payroll and employment history instead of being overwritten.

### REQ-RULE-CONTRACT-001 Keep one active employment contract

An employee may have only one active employment contract at a time.

- The active-contract constraint is evaluated per employee, so historical contracts remain alongside the single active interval.

### REQ-RULE-CONTRACT-002 End the prior contract before replacement

Activating a new contract ends the previous active contract the day before the new start.

- The prior active contract receives an end date exactly one calendar day before the replacement contract's start date.
- The replacement does not rewrite the prior contract's other terms.

### REQ-RULE-CONTRACT-003 Keep past contracts immutable

Past employment contracts cannot be edited.

- Past salary, employment terms, and effective dates remain available as payroll and employment evidence.
- A correction to current terms is represented by a new effective contract rather than editing a past one.

## REQ-RULE-PROJECT Project Time Eligibility Rules

Project membership supplies an employee's authority to record time and must cover the work date. A project may retain tasks, membership, budgets, and historical time after completion or archival, but those terminal working states no longer accept new timelogs. Task hierarchy and transition evidence are governed independently below.

### REQ-RULE-PROJECT-001 Require an active dated project assignment

An employee may log time only while assigned to the project for the work date.

- The project-member assignment must include the employee and cover the timelog's work date.
- The assignment's project role and allocation remain available with the resulting timelog.

### REQ-RULE-PROJECT-002 Refuse time on archived or completed projects

Archived or completed projects refuse new timelogs.

- Existing timelogs, membership, tasks, and project history remain visible after archival or completion.
- The refusal applies to creation of new timelogs, not to reading retained history.

## REQ-RULE-TASK Task Structure and History Rules

Every task belongs to one project and may use a single child level for work breakdown. State changes append who moved the task, when, and the prior and next states; later edits do not replace that evidence. The containing project's state separately determines whether time can still be entered.

### REQ-RULE-TASK-001 Limit task nesting to one subtask level

A task may have one level of subtasks and a subtask cannot have children.

- A top-level task may own subtasks, but a subtask cannot itself become a parent.
- Every task and subtask remains owned by the same project.

### REQ-RULE-TASK-002 Preserve immutable task status history

Every task status change records an immutable prior-state, next-state, actor, and time entry.

- Each transition entry records the prior state, next state, actor, and timestamp.
- Later task changes append history instead of replacing earlier transition evidence.

## REQ-RULE-TIMELOG Timelog Authority and Lock Rules

Before approval, an employee controls only their own time entries, while a time manager has scoped correction authority over another employee's unlocked entry. Timesheet approval locks all included timelogs and preserves their payroll and billing evidence. Reopening the sheet is the explicit route back to correction.

### REQ-RULE-TIMELOG-001 Limit employee edits to owned unlocked timelogs

An Employee may edit only their own unlocked timelogs.

- Ownership is evaluated from the employee attached to the active organization membership.
- Approval lock state is checked before any change is retained.

### REQ-RULE-TIMELOG-002 Limit time-manager edits to unlocked timelogs

A time manager may edit another employee's timelog only while it is unlocked.

- A time manager's scoped authority is evaluated for the affected employee and project.
- The manager cannot bypass an approval lock.

### REQ-RULE-TIMELOG-003 Lock timelogs when a timesheet is approved

An approved timesheet locks every included timelog against all ordinary edits.

- Approval changes every included timelog's lock state while preserving its date, duration, project, task, rates, billable flag, and description.
- A later timesheet reopening is the explicit recovery path before ordinary timelog correction.

## REQ-RULE-TIMESHEET Timesheet Submission and Use Rules

A timesheet is the weekly submission unit for one employee and organization. It must contain time and it cannot compete with another submitted or approved sheet for that employee-week. Rejection leaves an explained history; approval both locks the entries and qualifies eligible time for payroll or customer billing.

### REQ-RULE-TIMESHEET-001 Refuse empty timesheet submission

An empty timesheet cannot be submitted.

- Submission requires at least one timelog in the employee's organization week.
- The sheet remains drafted when submission is refused.

### REQ-RULE-TIMESHEET-002 Keep one submitted or approved timesheet per employee-week

One employee and week cannot have more than one submitted or approved timesheet.

- The uniqueness boundary includes both submitted and approved states for the same employee and week.
- Draft, rejected, or reopened sheets do not create a second submitted-or-approved record.

### REQ-RULE-TIMESHEET-003 Require a timesheet rejection reason

Timesheet rejection requires a reason.

- The reason is retained in the immutable approval history with the rejecting actor and time.

### REQ-RULE-TIMESHEET-004 Use only approved timesheets downstream

Only approved timesheets may feed payroll or customer billing.

- Approved hourly time can be imported into payroll and approved billable time can be selected for customer billing.
- Drafted, submitted, rejected, or reopened time remains ineligible for those downstream uses.
## REQ-RULE-CREDIT-MEMO Credit Memo Rules

A credit memo retains why value was granted: a return, discount, invoice correction, or customer credit. Applying it is bounded by both the memo's unapplied amount and the invoice's open balance; refunding is a separate settlement. Customer overpayment remains identifiable credit until one of those explicit outcomes occurs.

### REQ-RULE-CREDIT-MEMO-001 Restrict credit memo reasons

A credit memo reason must be return, discount, invoice correction, or customer credit.

- The retained reason is exactly return, discount, invoice correction, or customer credit.
- The memo keeps the related return or invoice reference when that reason has a source document.

### REQ-RULE-CREDIT-MEMO-002 Bound credit applications by both balances

A credit application cannot exceed the credit or invoice remaining balance.

- An application is limited to the lesser of unapplied credit and the target invoice's open balance.
- A refused application leaves both balances unchanged and available for another settlement.

### REQ-RULE-CREDIT-MEMO-003 Retain customer overpayments as credit

An overpayment remains customer credit until applied or refunded.

- The credit remains associated with the customer and organization until an explicit invoice application or refund.
- Recording the overpayment does not silently increase an unrelated invoice settlement.
## REQ-RULE-TRANSFER Warehouse Transfer Rules

A warehouse transfer separates shipment from receipt. Shipment is bounded by the unshipped request and source availability, while receipt is bounded by what is in transit. The outbound and inbound movements share one transfer reference so partial movement and reconciliation remain visible; cycle-count rules do not govern this journey.

### REQ-RULE-TRANSFER-001 Bound transfer shipment quantity

Transfer shipment cannot exceed requested or available source quantity.

- Shipped quantity is limited by the transfer line's unshipped request and the source location's available stock.
- A partial shipment leaves the balance open for a later shipment or cancellation.

### REQ-RULE-TRANSFER-002 Bound transfer receipt quantity

Transfer receipt cannot exceed the quantity shipped and not yet received.

- Received quantity is limited by the transfer line's shipped quantity less prior receipts.
- A partial receipt preserves in-transit quantity under the same transfer.

### REQ-RULE-TRANSFER-003 Pair transfer outbound and inbound movements

Shipping creates outbound movement and receipt creates inbound movement with the same transfer source.

- Shipment posts a source-warehouse outbound movement and receipt posts a destination-warehouse inbound movement.
- Both movements reference the same transfer and item so in-transit reconciliation remains possible.
## REQ-RULE-CYCLE-COUNT Cycle Count and Adjustment Rules

A cycle count compares observed quantity with a fixed expected snapshot, but observation alone does not alter stock. Approval makes its variance eligible for an adjustment movement. The organization's materiality threshold routes large count or standalone adjustments for approval before posting.

### REQ-RULE-CYCLE-COUNT-001 Post only approved count variance

A cycle count adjustment may post only after count approval.

- The approved difference between the fixed expected snapshot and counted quantity determines the adjustment movement.
- Drafted, performed, submitted, or rejected counts do not change stock.

### REQ-RULE-CYCLE-COUNT-002 Route material adjustments for approval

A standalone or count adjustment above the configured threshold requires approval.

- The organization's adjustment threshold is evaluated before posting.
- A material variance remains pending until the required approval completes.
## REQ-RULE-ITEM Item Stock-Effect Rules

Item type controls the physical-stock boundary. Inventory items participate in tracking and movement-derived quantity, while services remain commercial and accounting lines without warehouse movements. Deactivation does not rewrite the type or effects retained on historical documents.

### REQ-RULE-ITEM-001 Require tracking for inventory items

Inventory items require stock tracking.

- Tracking mode, warehouse quantity, and movement history apply to item types that represent physical inventory.
- The requirement survives deactivation so historical movements remain attributable.

### REQ-RULE-ITEM-002 Prevent service-item stock movements

Service items cannot create stock movements.

- A service line can carry prices, tax, revenue, expense, time, or billing meaning without a warehouse quantity delta.
- A mixed document posts movements only for its stock-tracked lines.
## REQ-RULE-LOT Inventory Lot Rules

A lot identifies a quantity of one item from receipt through shipment and later operational movement. Lot-tracked entry and exit must name that identity, allowing returns, production, quality, maintenance, and service history to follow the same material.

### REQ-RULE-LOT-001 Require lot identity at receipt and shipment

Lot-tracked receipts and shipments require lot identity.

- Receipt establishes the exact lot receiving quantity and shipment selects the exact lot leaving quantity.
- Returns, quality holds, production, maintenance, and service movements retain that lot identity after entry.
## REQ-RULE-SERIAL Item Serial Rules

A serial identifies one physical unit of an item. Each serial-tracked movement accounts for units one by one, and the code cannot be reused for the same item. That identity follows the unit through receipt, shipment, return, quality, asset, and service activity.

### REQ-RULE-SERIAL-001 Require one serial per moved unit

Serial-tracked movements require one serial per unit.

- Each serial-tracked movement line identifies exactly one unit, so a multi-unit operation provides one serial identity per unit.
- The same serial follows receipt, shipment, return, quality, asset, and service history.

### REQ-RULE-SERIAL-002 Keep serial codes unique per item

A serial code is unique per item.

- Uniqueness is evaluated for the serial code within its item and organization.
- A duplicate serial for the same item is refused before a stock movement is posted.
## REQ-RULE-TAX-CODE Tax Code Calculation Rules

Tax treatment is resolved from the party location, item taxability, transaction date, jurisdiction, and effective code rate. Sales invoices calculate output tax and vendor bills calculate input tax. The code and direction select the payable or receivable account retained on the source-linked journal line.

### REQ-RULE-TAX-CODE-001 Resolve transaction tax from effective facts

Sales-invoice output tax and vendor-bill input tax use party location, item taxability, transaction date, jurisdiction, and tax code to select the rate.

- Output tax applies to sales-invoice lines and input tax applies to vendor-bill lines.
- Rate selection uses party location, item taxability, transaction date, jurisdiction, and code effective history.

### REQ-RULE-TAX-CODE-002 Post tax through the code's ledger account

Tax amounts post to the tax payable or receivable account configured by the code.

- The posted tax amount uses the payable or receivable ledger account selected for that code and tax direction.
- The journal line retains the tax code and source document needed for reconciliation.
## REQ-RULE-ROUTING Routing Version Rules

An active routing is changed by adding a version, leaving the operation sequence already referenced by production intact. Each production order retains its selected routing for labor, machine, and cost evidence. Historical versions remain inspectable, but a new order may select only an active routing for its finished item.

### REQ-RULE-ROUTING-001 Version an active routing change

Changing an active routing creates a new version and preserves the prior version.

- The prior routing keeps its operation sequence, work centers, setup and run times, labor grade, machine, rate, and instructions.
- The replacement receives a distinct version identity and may progress independently.

### REQ-RULE-ROUTING-002 Retain the production order's routing version

A production order retains the exact routing version selected at creation.

- Labor, machine, operation progress, and cost continue to use the version captured when the production order was created.
- Later routing activation or supersession does not rewrite an existing order.

### REQ-RULE-ROUTING-003 Select only an active routing for new production

New production may select only an active routing valid for the finished item.

- Eligibility is evaluated for the order's finished item at selection time.
- Drafted, inactive, or superseded routing versions remain visible as history but cannot be chosen for a new order.
