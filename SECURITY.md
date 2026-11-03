# Security policy

## Supported versions

ConRAG is pre-1.0. Security fixes are made on the `main` branch only.

| Version | Supported |
|---|---|
| `main` | Yes |
| anything else | No |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, discussions or pull requests.**

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. If that option is not available, open an issue titled "Security contact request" that contains **no technical details**, and a maintainer will arrange a private channel.

Please include:

- a description of the issue and its impact;
- the steps, requests or documents needed to reproduce it;
- the commit or version you tested;
- any suggested fix, if you have one.

This is a small project maintained by volunteers. We aim to acknowledge a report within **7 days**, to share an assessment within **14 days**, and to agree a disclosure date with you once a fix is ready. Reporters are credited in the changelog unless they prefer otherwise.

## Scope

In scope: authentication and session handling, authorisation (role checks), injection (SQL, prompt, HTML), CSRF, rate limiting, secret handling, and anything that lets a lower-privileged user read or change data they should not.

Out of scope: the demo credentials created by `npm run db:seed` (they exist for local demos and use the password you chose), findings that require a compromised host or database, denial of service by volume against a development instance, and the limits already listed under [Known limits](docs/SECURITY.md#known-limits-honest-list).

## How the system is protected

The controls (password hashing, sessions, role checks on every handler, CSRF defence, parameterised SQL, prompt-injection handling, rate limits, audit triggers) and the honest list of known limits are documented in [docs/SECURITY.md](docs/SECURITY.md).

## Deploying safely

- Set a strong, unique `SESSION_SECRET` and never reuse the demo password. Do not run `npm run db:seed` against a real deployment.
- Serve over HTTPS (session cookies are `Secure` in production).
- Run a single server instance, or move the in-process rate limiter into shared storage first.
- Treat ingested documents as untrusted input. Prompt-injection defences are best-effort.
