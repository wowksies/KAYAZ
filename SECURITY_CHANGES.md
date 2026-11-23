# License administration hardening — 2026-11-23

Key reset/revoke/ban flags must be actual JSON booleans. Strings such as
`"false"` are rejected rather than interpreted as a request to unbind a PC.
The normal panel already sends booleans; its UI is unchanged.

R6 record edits use Firebase ETags and conditional PUT, retrying conflicts.
Each edit preserves the latest record and increments `auth_version`. The auth
Worker checks this generation, so resetting, revoking and restoring a key does
not revive its earlier tokens. No existing keys are reset by deployment.
The first edit creates generation 1 for records without this field.

The Worker and native clients live outside this website repository:
`D:/Important/potenial side projects/needed/Worker` and `2/shared`.
The generation check only takes effect once the updated Worker is deployed.
Older Worker versions ignore the extra field and remain compatible.

Reset audit entries include the previous HWID prefix; normal renewal and
duration changes preserve hardware binding. Bulk pruning checks the latest
binding inside a conditional write, so a newly bound key is not removed based
on an old listing.

Validation: `node scripts/test-panel.mjs` (107 checks). All database requests
in this suite use a local mock. No production keys or sessions are changed.

This is scoped licensing hardening, not a claim of a comprehensive security
audit. Keep Firebase client rules default-deny and all database/admin secrets
server-side. Browser obfuscation does not enforce permissions.
