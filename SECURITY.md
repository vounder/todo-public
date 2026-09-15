# Security Policy

## Private reporting

Please use GitHub's private vulnerability-reporting flow for this repository.
Do not place hostnames, addresses, ports, credentials, private keys, production
data, or unsanitized logs in a public issue.

If private reporting is unavailable, open a minimal issue requesting a private
channel without including exploit details.

## Deployment boundary

The backend requires a randomly generated shared server access key. REST uses
Bearer authorization; WebSocket sessions authenticate in their first REGISTER
message before receiving data or subscribing to broadcasts. The public health
endpoint exposes readiness only. The server refuses to start without a valid
key. The key grants access to all lists in that server, not separate user accounts.

The setup binds to loopback or a deliberately selected private network/VPN
address. Use HTTPS through a reverse proxy or an encrypted VPN when traffic
leaves a trusted local network. Plain HTTP on a LAN does not encrypt the key or
list contents. No automatic firewall changes or Internet exposure are performed.

The local setup-card.local.html contains a QR code with the access key. Treat
it as a credential and share it only with intended household/team members.
The app stores native credentials using the operating system's secure store;
web credentials are limited to the browser tab's session storage. Rotating
TODO_ACCESS_KEY in .env and recreating the server revokes all existing clients;
rerun setup to regenerate the card, then reconnect authorized devices.

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
