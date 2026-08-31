# Draft issue: Authenticate native BRC-100 callers before reusing saved permissions

**Status:** Draft for maintainer review. Not submitted.

**Observed version:** BSV Desktop 2.8.3

**Relevant standards:** BRC-5, BRC-100, and BRC-116

## Suggested GitHub issue title

Authenticate native app originators before reusing saved BRC-100 permissions

## Plain-English issue body

BSV Desktop exposes the standard BRC-100 wallet methods on its local HTTP and
HTTPS ports. Browser calls have a browser-managed `Origin` header, but native
Node or CLI calls identify themselves with an `Originator` header supplied by
the caller.

At the moment, any process running as the local user can write an `Originator`
header containing another application's domain. BSV Desktop parses that value
and uses it as the application identity passed into the wallet permission
system.

This matters most after a user has saved permissions for an application. A
different local process may be able to claim the same originator and ask the
wallet to reuse those permissions. The wallet lock and permission prompts still
provide useful protection, so this is not a claim that keys are exposed or that
every request succeeds automatically.

BRC-116 says the wallet, browser, operating system, or substrate is expected to
confirm that an originator is authentic and prevent forged requests. A plain
caller-controlled header does not provide that confirmation for native apps.

### Expected behavior

Saved permissions should only be reused when the wallet can verify that the
request came from the application to which they were granted.

### Possible direction

Please keep the existing BRC-5 endpoints for compatibility, but distinguish
verified and unverified native callers. For example:

- Pair a native application once and issue it a local client credential.
- Bind that credential to the approved originator.
- Authenticate later requests with mTLS, signed challenges, or an
  operating-system IPC identity.
- Reuse persistent permissions only on an authenticated channel.
- Continue to prompt, use an ephemeral grant, or reject sensitive calls from an
  unverified `Originator` header.

The exact mechanism can be chosen by the BSV Desktop maintainers. The important
property is that a second local process cannot inherit an application's saved
permissions merely by copying its domain string.

### Safe verification

In a test wallet profile:

1. Grant a harmless protocol permission to a test native application.
2. Make the original request through one process using its originator.
3. Start a separate process with no pairing or application credential.
4. Send the same request with the same `Originator` header.
5. Confirm whether the second process receives the saved permission.

Please avoid using a funded production wallet for this test.

### What this issue is not asking for

- It does not ask BSV Desktop to remove BRC-5 or the standard HTTP API.
- It does not claim the 28 BRC-100 methods are missing.
- It does not ask for removal of BSV Desktop's additional token APIs.
- It does not prescribe one cross-platform authentication technology.

## Evidence for the draft

In BSV Desktop 2.8.3, `parseOrigin` accepts `headers['originator']`, parses it as
a host, and passes the result into the BRC-100 wallet methods. The local server
also permits broad CORS headers. The server is restricted to loopback, which
reduces remote exposure but does not authenticate one local native process from
another.

BRC-116 section 3.1 says permission grants are scoped to originator and assumes
wallets prevent forged originators using IPC, local kernel or
substrate-specific authentication, or another suitable mechanism.

## Before submitting

- Ask a BSV Desktop maintainer whether another pairing or native-client
  authentication layer exists outside the inspected HTTP path.
- Reproduce only with a harmless permission and a test wallet.
- Let the maintainer choose the severity and implementation direction.
- Keep the report focused on origin authentication and persistent permission
  reuse.
