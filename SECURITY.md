# Security Policy

## Private reporting

Please use GitHub's private vulnerability-reporting flow for this repository.
Do not place hostnames, addresses, ports, credentials, private keys, production
data, or unsanitized logs in a public issue.

If private reporting is unavailable, open a minimal issue requesting a private
channel without including exploit details.

## Deployment boundary

The included backend is intended for a trusted self-hosted environment. Its API
does not implement user accounts or application-level authorization. Do not
expose it directly to an untrusted network. Use an authenticated reverse proxy,
a VPN, or another reviewed access-control layer, together with TLS and
restrictive firewall rules.

DeployDesk executes the repository's PowerShell runner with the current user's
permissions. Its trust decision covers the selected DeployLink and runner, not
the complete repository, external commands, container images, or remote host.

## Secrets and personal infrastructure

Never commit:

- `.env` or a real `*.deploylink`;
- passwords, access tokens, database credentials, or private keys;
- personal hostnames, addresses, ports, user names, or remote paths;
- production data or backups.

Use an SSH agent or protected user-profile keys for SSH. Keep application
secrets in a protected server-side store. Review all runner output before
sharing it.

## Supported versions

Security fixes target the latest commit on `main`.
