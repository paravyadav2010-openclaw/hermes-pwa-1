# Private access with Tailscale

Required production network setup for Hermes Mobile. The PWA is installed from the Hermes Dashboard origin, exposed over HTTPS with Tailscale Serve.

```
Laptop/VPS/NAS with Hermes
↕ Tailscale tailnet
Phone with Tailscale app
```

## Why Tailscale

- No open ports to the internet.
- Devices see each other inside a private network.
- HTTPS name via MagicDNS / Tailscale Serve, which satisfies browser PWA install requirements.
- Same-origin Dashboard/gateway auth and CORS behavior; Hermes Mobile does not need a separate public origin.
- Strong fit for keeping your agent on your own private network.

Trade-offs:

- You must install Tailscale on the phone.
- If Tailscale is disconnected, the PWA cannot reach Hermes.
- iOS background behavior may limit reconnects.

## Prerequisites

- Hermes Dashboard is running and reachable on the server.
- Both server and phone have internet access for Tailscale setup.
- Tailscale is installed and signed in on the server and on every phone that will install Hermes Mobile.
- Tailscale Serve is enabled for the Dashboard port.

## Step-by-step

1. **Install Tailscale on the server** running Hermes.
   ```bash
   # macOS / Linux / Windows installers: https://tailscale.com/download
   sudo tailscale up
   ```

2. **Install Tailscale on your phone** from the App Store / Play Store and sign in with the same tailnet.

3. **Enable MagicDNS** in the Tailscale admin console so devices get stable hostnames.

4. **Expose Hermes Dashboard** using Tailscale Serve:
   ```bash
   sudo tailscale serve --bg --https 443 localhost:9119
   ```
   This gives you a URL like:
   ```
   https://<machine-name>.<tailnet-name>.ts.net
   ```

5. **Open the Mobile tab** in Hermes Dashboard on the server, then scan the QR code or share the URL to your phone.

6. **Install the PWA** from that URL in Chrome (Android) or Safari (iOS).

## Verify

From the phone, with Tailscale connected, open:

```
https://<machine-name>.<tailnet-name>.ts.net/dashboard-plugins/hermes-pwa/dist/mobile/
```

You should see the Hermes Mobile splash screen and be able to log in.

The origin should be the same for the PWA shell and Dashboard API calls. This is intentional: Hermes Mobile uses the same cookies and CORS/auth boundary as the Dashboard/gateway.

## Troubleshooting

- **Cannot reach the URL** — check that Tailscale is connected on both devices.
- **MagicDNS not resolving** — use the Tailscale IP (100.x.y.z) directly as a temporary test.
- **HTTPS warning** — Tailscale Serve provides HTTPS; plain HTTP over tailnet may trigger browser warnings.
