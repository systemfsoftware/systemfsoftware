# Actors, Authentication, Memberships, and Authority

One global User identity authenticates by email and password and may participate in several organizations. The active organization, its membership state, assigned role union, and scoped department or project responsibilities determine what that User may do. Customers and vendors remain non-authenticating external parties, while scheduled work is attributed to an organization-specific System principal.

## REQ-AUTH-PROVISION: Account Provisioning and Login

Membership begins with an Owner-issued invitation, not public registration. Accepting that invitation either creates the recipient's single global identity or adds another organization to an existing identity; the membership itself remains organization-specific.

Email-and-password authentication establishes only the global signed-in context. The user must still choose an active membership before operational work, and inactive accounts or users without an active membership cannot enter the ERP.

### REQ-AUTH-PROVISION-001: Owner issues membership invitation

An organization Owner sends a membership invitation to a person's email for one organization.

The invitation identifies the issuing organization, intended email, inviter, initial Employee role, status, and creation time.

Invitation issuance does not create public self-registration or grant authority before acceptance. A non-Owner or an invitation for an email that already has a pending membership in the organization is refused without creating another invitation.

### REQ-AUTH-PROVISION-002: Accept invitation and establish identity

When a recipient presents an active organization invitation issued to their email, the recipient accepts it, establishes their global email-and-password identity, and activates the invited organization membership.

The accepted email becomes the identity used for later sign-in and global profile ownership. The account remains global while the new membership and Employee baseline remain specific to the inviting organization.

An invitation that is revoked, already accepted, or issued to another email is refused without establishing membership.

### REQ-AUTH-PROVISION-003: Accept invitation into another organization

When an invitation email resolves to an existing global user, that user accepts it and gains an active membership in the inviting organization without creating another account or profile.

Existing credentials and the global profile remain unchanged. The additional membership begins with the invited organization's Employee baseline, and every other membership remains unchanged.

Acceptance is refused when the user already has an active, suspended, or revoked membership in that organization; an Owner must use the applicable membership command instead.

### REQ-AUTH-PROVISION-004: Authenticate and begin a session

An active user with at least one active organization membership authenticates with email and password and receives a signed-in session that has no operating organization until selection.

The session identifies the global user but grants no organization data access before an active membership is selected. The user can inspect their active memberships solely for choosing the operating organization.

### REQ-AUTH-PROVISION-005: Refuse ineligible authentication

When a person attempts email-and-password authentication, the product refuses the attempt if credentials are invalid, the global account is inactive, or no active organization membership remains.

No signed-in session or active organization context is created. The response does not reveal whether the email, password, account status, or membership status caused the refusal.

## REQ-AUTH-SESSION: Session and Logout

For Session and Logout, a signed-in user can keep more than one concurrent session so work on one device does not silently terminate another. Session continuation keeps the authenticated identity but never bypasses current membership eligibility.

Together, ending the current session and ending every session are distinct user choices with different scope. A membership or account status change takes effect on later requests even when a session was issued earlier.

### REQ-AUTH-SESSION-001: Issues an independent session after successful login and allows concurrent active sessions

The product issues an independent session after successful login and allows concurrent active sessions.

A signed-in user can keep more than one concurrent session so work on one device does not silently terminate another.

Session continuation keeps the authenticated identity but never bypasses current membership eligibility.

### REQ-AUTH-SESSION-002: Continues an eligible current session without re-entering credentials

A user continues an eligible current session without re-entering credentials.

Ending the current session and ending every session are distinct user choices with different scope.

A signed-in user can keep more than one concurrent session so work on one device does not silently terminate another.

### REQ-AUTH-SESSION-003: Logs out the current session without ending other active sessions

A user logs out the current session without ending other active sessions.

Ending the current session and ending every session are distinct user choices with different scope.

A signed-in user can keep more than one concurrent session so work on one device does not silently terminate another.

### REQ-AUTH-SESSION-004: Revokes all of their active sessions in one action

A user revokes all of their active sessions in one action.

A signed-in user can keep more than one concurrent session so work on one device does not silently terminate another.

Ending the current session and ending every session are distinct user choices with different scope.

### REQ-AUTH-SESSION-005: Rechecks that the account and selected organization membership remain active

Every continued request rechecks that the account and selected organization membership remain active.

A membership or account status change takes effect on later requests even when a session was issued earlier.

Session continuation keeps the authenticated identity but never bypasses current membership eligibility.

## REQ-AUTH-ACCOUNT User Account Management

One global user profile follows the person across organization memberships, while roles and employee placement stay scoped to each organization. Only the user controls personal profile and credential actions. Password change, recovery, deactivation, and reactivation have different proof and session effects, and none silently changes a separately revoked membership. After authentication, explicit active-organization selection is the boundary for every operational action; switching repeats membership eligibility before moving that boundary.

### REQ-AUTH-ACCOUNT-001 View the global user profile

A user views their global profile containing display name, avatar, phone, locale, and timezone preference.

- The view represents one identity across every organization membership and does not merge organization roles or employee placement into the global profile.
- The user can see only their own credential-bound profile through this self-service outcome.

### REQ-AUTH-ACCOUNT-002 Update the global user profile

A user updates their own global profile fields.

- The editable fields are display name, avatar, phone, locale, and timezone preference; login email and password use their own credential actions.
- A successful change is visible in every membership because the profile belongs to the global user, not to one organization.

### REQ-AUTH-ACCOUNT-003 Change the password while signed in

A signed-in user changes their password after proving the current password.

- The new password replaces the credential for the global account after current-password verification succeeds.
- Other active sessions for the same account are revoked; the session completing the change remains usable and retains its current organization context.

An incorrect current password refuses the change and leaves the existing credential and sessions unchanged.

### REQ-AUTH-ACCOUNT-004 Recover account access by email

A user who cannot authenticate recovers access through an email-bound recovery flow.

- Recovery sends a short-lived, single-use credential-reset proof to the account's verified login email without disclosing whether another email exists.
- Completing recovery replaces the password and revokes existing sessions but does not choose an active organization.

An expired, reused, or mismatched recovery proof is refused without changing the password or membership state.

### REQ-AUTH-ACCOUNT-005 Deactivate the global user account

A user deactivates their global account and immediately loses access in every organization while business history remains attributable.

- Deactivation revokes every active session and prevents authentication regardless of still-resident organization memberships.
- Documents, postings, approvals, comments, time, payroll, and audit events retain the deactivated user's identity as historical attribution.

### REQ-AUTH-ACCOUNT-006 Reactivate a deactivated account

A deactivated user reactivates the global account through credential recovery without restoring a membership that was separately revoked.

- Successful email-bound recovery returns the global account to active status and permits login.
- Each organization membership keeps its own invited, active, suspended, or revoked state; reactivation does not change those states or role assignments.

Recovery is refused when the email-bound proof is invalid, and the account remains deactivated.

### REQ-AUTH-ACCOUNT-007 Select the active organization after login

After login, a user selects one active organization membership as the operating context.

- The selectable catalog contains only organizations in which the user has an active membership.
- Every subsequent query, command, report, export, approval, audit event, and background request initiated in the session carries the selected organization context.

A nonmember, invited, suspended, or revoked membership cannot be selected and does not establish an operating context.

### REQ-AUTH-ACCOUNT-008 Switch the active organization

A signed-in user switches the operating context to another active membership without signing in again.

- The target is rechecked as an active membership before the context changes.
- After switching, authorization, roles, data visibility, reports, and commands use only the target organization; no prior-organization query or draft context carries forward.

If the target membership is no longer active, the switch is refused and the current valid organization context remains selected.
## REQ-AUTH-MEMBERSHIP: Organization Membership Lifecycle

For Organization Membership, one global user can have a different membership state and different roles in each organization. Invited, active, suspended, and revoked states distinguish pending entry, usable access, temporary loss, and terminal removal.

Together, membership suspension or revocation removes organization access while not erasing documents, approvals, audit attribution, or employment history. Only Owners administer later membership entry and status changes, subject to last-owner protection.

### REQ-AUTH-MEMBERSHIP-001: Records invited, active, suspended, or revoked status for one user and one organization

An organization membership records invited, active, suspended, or revoked status for one user and one organization.

Invited, active, suspended, and revoked states distinguish pending entry, usable access, temporary loss, and terminal removal.

One global user can have a different membership state and different roles in each organization.

### REQ-AUTH-MEMBERSHIP-002: Accepts the invitation

An Owner activates a pending membership after the recipient accepts the invitation.

Only Owners administer later membership entry and status changes, subject to last-owner protection.

One global user can have a different membership state and different roles in each organization.

### REQ-AUTH-MEMBERSHIP-003: Removes its organization authority

An Owner suspends an active membership and immediately removes its organization authority.

Membership suspension or revocation removes organization access while not erasing documents, approvals, audit attribution, or employment history.

One global user can have a different membership state and different roles in each organization.

### REQ-AUTH-MEMBERSHIP-004: Reactivates a suspended membership with its retained role assignments

An Owner reactivates a suspended membership with its retained role assignments.

Only Owners administer later membership entry and status changes, subject to last-owner protection.

One global user can have a different membership state and different roles in each organization.

### REQ-AUTH-MEMBERSHIP-005: Revokes a membership and prevents later access unless a new invitation is issued

An Owner revokes a membership and prevents later access unless a new invitation is issued.

Only Owners administer later membership entry and status changes, subject to last-owner protection.

Membership suspension or revocation removes organization access while not erasing documents, approvals, audit attribution, or employment history.

### REQ-AUTH-MEMBERSHIP-006: Refuses membership actions that would leave it without an active Owner

An organization refuses membership actions that would leave it without an active Owner.

Membership suspension or revocation removes organization access while not erasing documents, approvals, audit attribution, or employment history.

One global user can have a different membership state and different roles in each organization.

## REQ-AUTH-ROLE: Organization Roles and Permissions

For Organization Role, effective authority is the union of all roles held within the currently selected organization; no role grants authority in another organization. Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

Together, Department Manager and Project Manager stay responsibility positions and never become organization-wide permission profiles. Role assignment and removal are Owner-controlled sensitive actions whose effects apply immediately.

### REQ-AUTH-ROLE-001: The Organization Role for built catalog owner

The built-in role catalog preserves Owner, Finance Manager, Procurement Manager, Sales Manager, Warehouse Manager, HR Manager, Production Manager, and Employee with their source-defined module boundaries.

Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

Role assignment and removal are Owner-controlled sensitive actions whose effects apply immediately.

### REQ-AUTH-ROLE-002: A member's effective authority is the union of every built-in and custom role assigned in the active organization

A member's effective authority is the union of every built-in and custom role assigned in the active organization.

Effective authority is the union of all roles held within the currently selected organization; no role grants authority in another organization.

Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

### REQ-AUTH-ROLE-003: Every manager role includes the Employee self-service baseline

Every manager role includes the Employee self-service baseline, and Owner includes every built-in manager capability.

Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

Role assignment and removal are Owner-controlled sensitive actions whose effects apply immediately.

### REQ-AUTH-ROLE-004: An Owner composes a custom role from any available permission combination

An Owner composes a custom role from any available permission combination.

Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

Role assignment and removal are Owner-controlled sensitive actions whose effects apply immediately.

### REQ-AUTH-ROLE-005: Updates the permission composition of a custom role

An Owner updates the permission composition of a custom role.

Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

Role assignment and removal are Owner-controlled sensitive actions whose effects apply immediately.

### REQ-AUTH-ROLE-006: Assigns one or more built-in or custom roles to an active member

An Owner assigns one or more built-in or custom roles to an active member.

Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

Effective authority is the union of all roles held within the currently selected organization; no role grants authority in another organization.

### REQ-AUTH-ROLE-007: Revokes a named role from an active member

An Owner revokes a named role from an active member.

Effective authority is the union of all roles held within the currently selected organization; no role grants authority in another organization.

Role assignment and removal are Owner-controlled sensitive actions whose effects apply immediately.

### REQ-AUTH-ROLE-008: Built-in roles cannot be deleted, and a custom role can be deleted only while no member holds it

Built-in roles cannot be deleted, and a custom role can be deleted only while no member holds it.

Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

Effective authority is the union of all roles held within the currently selected organization; no role grants authority in another organization.

### REQ-AUTH-ROLE-009: Becomes Organization Role for creator becomes first

The organization creator becomes the first Owner and a later member begins as Employee unless an Owner assigns another role.

Effective authority is the union of all roles held within the currently selected organization; no role grants authority in another organization.

Built-in roles express the source-defined gradient from Owner access to Employee self-service, while custom roles select individual permissions.

## REQ-AUTH-PRINCIPAL: Acting Principals

For Acting Principal, a User is the sole credentialed actor and carries organization-scoped roles from Owner to Employee. Customers and vendors stay referenced external parties whose interactions are mediated by authorized users and documents.

Together, automated work is attributed to an organization-scoped System principal while not a human login or session. Human and automated actions share tenant isolation, immutability, and audit attribution boundaries.

### REQ-AUTH-PRINCIPAL-001: The product distinguishes credentialed Users, non-authenticating external parties

The product distinguishes credentialed Users, non-authenticating external parties, and non-interactive System principals as one cohesive acting-principal catalog.

Customers and vendors stay referenced external parties whose interactions are mediated by authorized users and documents.

Automated work is attributed to an organization-scoped System principal while not a human login or session.

### REQ-AUTH-PRINCIPAL-002: Customers Acting Principal for customers vendors never

Customers and vendors never receive portal credentials and users mediate all interaction with them.

Customers and vendors stay referenced external parties whose interactions are mediated by authorized users and documents.

A User is the sole credentialed actor and carries organization-scoped roles from Owner to Employee.

### REQ-AUTH-PRINCIPAL-003: Each Acting Principal for each system scheduled

Each organization has a System principal for scheduled depreciation, MRP, exchange-rate refresh, numbering, reminders, and notification dispatch.

Automated work is attributed to an organization-scoped System principal while not a human login or session.

A User is the sole credentialed actor and carries organization-scoped roles from Owner to Employee.

### REQ-AUTH-PRINCIPAL-004: Every Acting Principal for system action scoped

Every System action is scoped to one organization and attributed under the same audit and immutability rules as a User action.

Automated work is attributed to an organization-scoped System principal while not a human login or session.

A User is the sole credentialed actor and carries organization-scoped roles from Owner to Employee.

## REQ-AUTH-POSITION: Scoped Manager Positions

For Manager Position, a manager position is attached to one department or project instead of to the user's global identity. Department and project positions provide contextual approval responsibility while not granting unrelated module authority.

Together, position assignment changes who resolves a matching approval step but does not alter the member's role union. Only an authorized organization administrator can assign or clear these responsibility positions.

### REQ-AUTH-POSITION-001: Assigns or clears the Department Manager of a specific department

An authorized Owner or HR Manager assigns or clears the Department Manager of a specific department.

A manager position is attached to one department or project instead of to the user's global identity.

Department and project positions provide contextual approval responsibility while not granting unrelated module authority.

### REQ-AUTH-POSITION-002: Assigns or clears the Project Manager of a specific project

An authorized Owner or project administrator assigns or clears the Project Manager of a specific project.

A manager position is attached to one department or project instead of to the user's global identity.

Only an authorized organization administrator can assign or clear these responsibility positions.

### REQ-AUTH-POSITION-003: Approval Manager Position for approval routing resolves

Approval routing resolves Department Manager and Project Manager approvers from the document's own department or project context.

A manager position is attached to one department or project instead of to the user's global identity.

Department and project positions provide contextual approval responsibility while not granting unrelated module authority.
