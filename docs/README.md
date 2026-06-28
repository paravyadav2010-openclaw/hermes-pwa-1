# Hermes Mobile Docs

User and operator documentation for the Hermes Mobile PWA.

## Quick start

1. [Install the plugin](./INSTALL.md)
2. Set up [Tailscale Serve](./NETWORK_TAILSCALE.md) so your phone reaches Hermes Dashboard over HTTPS inside your tailnet.
3. Open the **Mobile** tab in Hermes Dashboard and install the PWA on your phone.

## Reference

- [Installation contract & release checklist](./INSTALL.md)
- [Rollback and reinstall](./ROLLBACK_AND_REINSTALL.md)
- [Security & Privacy](./SECURITY.md)
- [Third-party client guide](./THIRD_PARTY_CLIENT.md) — positioning, licensing, and the constraints this client operates under
- [Planned improvements](./IMPROVEMENTS.md) — UX backlog and ideas worth borrowing from other Hermes frontends
- [Architecture & coding rules](../ARCHITECTURE.md) · [Coding conventions](../CODING_RULES.md)

## Troubleshooting

If the PWA does not install or cannot connect:

1. Confirm the URL is reachable from the phone (not `127.0.0.1` or `localhost`).
2. Confirm the URL uses the Tailscale Serve HTTPS origin: `https://<machine-name>.<tailnet-name>.ts.net/...`.
3. Check that Tailscale is connected on both the Hermes host and the phone.
4. Open the Mobile tab on a desktop browser and check the diagnostics readout.
5. See [ROLLBACK_AND_REINSTALL.md](./ROLLBACK_AND_REINSTALL.md) for a clean reinstall.
