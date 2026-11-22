# Networking Guide: Reaching the Sync Server over HTTPS

The frontend is served by GitHub Pages over **HTTPS**, and browsers block plain-HTTP API
requests from HTTPS pages (Mixed Content). The sync server must therefore be reachable
over HTTPS.

**The application is tunnel-agnostic.** It only ever talks to the *Sync Server URL* you
enter in Settings. Switching networking providers never requires a code or database
change—only that URL changes.

| Option | Status | Who can reach the API | Client requirement |
|---|---|---|---|
| **A. Tailscale serve** | ✅ Current setup | Devices in your tailnet | Tailscale app installed + logged in |
| B. Tailscale Funnel | Future alternative | Anyone with the URL (public HTTPS) | None |
| C. Cloudflare Tunnel | Future alternative | Anyone with the URL (public HTTPS) | None |

---

## Option A (current): Tailscale serve

```text
[ Device with Tailscale ] --tailnet HTTPS (443)--> [ Raspberry Pi ]
                                                      tailscale serve
                                                        │ forwards to
                                                        ▼
                                              127.0.0.1:8090  (docker-compose port)
                                                        │ inside container
                                                        ▼
                                              app listens on :8080
```

- Tailscale terminates TLS for `https://raspberrypi.<tailscale_number>.ts.net`
  (valid certificate, port **443**—the URL has **no port**).
- `tailscale serve` forwards to local port **8090**, which `docker-compose.yml`
  publishes as `127.0.0.1:8090:8080`. Nothing is exposed on your LAN.

### Prerequisites

1. Raspberry Pi with Docker installed and `docker compose` available.
2. Tailscale installed and logged in on the Pi (`tailscale status` shows the tailnet).
3. Tailscale installed and logged in on every client device (phone/laptop).

### 1. Configure `tailscale serve` on the Pi

Your Pi already runs `tailscale serve` targeting local port 8090. Verify it:

```bash
tailscale serve status
```

You should see an HTTPS proxy entry forwarding to local port **8090**. If you need to
(re)create it:

```bash
tailscale serve --bg 8090
```

### 2. Start the sync server

On the Pi, next to `docker-compose.yml`:

```bash
docker compose pull
docker compose up -d
```

Edit `docker-compose.yml` first:

- `API_KEY` — a long random secret (the app's Settings → API Key must match).
- `CORS_ORIGINS` — the frontend origin, e.g. `https://heinipas.github.io`
  (origin only: scheme + host, no path or trailing slash).

### 3. Verify

```bash
# On the Pi (container published on loopback 8090):
curl http://127.0.0.1:8090/api/v1/health
# → {"status":"ok","server_time":...,"version":"..."}

# Over the tailnet (TLS terminated by Tailscale):
curl https://raspberrypi.<tailscale_number>.ts.net/api/v1/health
# → same JSON
```

### 4. Connect the app

Settings → **Sync Server URL** `https://raspberrypi.<tailscale_number>.ts.net`
(no port) → **API Key** → Save → **Sync Now**. The header dot turns green.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Orange dot (disconnected) | Device not on the tailnet / Pi asleep | Open Tailscale app, `tailscale status` on the Pi |
| Red dot, tooltip `401` | API key mismatch | Align Settings key with `docker-compose.yml`, `docker compose up -d` |
| Red dot, tooltip `404` | Wrong URL (path or port appended) | Use `https://raspberrypi.<n>.ts.net` exactly |
| `curl` to `.ts.net` fails | `tailscale serve` not running | `tailscale serve status`, re-run `tailscale serve --bg 8090` |
| CORS error in browser devtools | Frontend origin not allowed | Add it to `CORS_ORIGINS`, recreate container |
| Sync seems stuck with old data | Device clock far behind (LWW uses timestamps) | Fix clocks (NTP) on both devices |

---

## Option B (future): Tailscale Funnel

Same Tailscale infrastructure, but the same URL becomes **publicly reachable** over
HTTPS—no VPN client needed on devices.

Outline of the switch:

1. Enable Funnel for the node (Tailscale admin console + `tailscale funnel` acceptance).
2. Add the funnel flag to the existing serve rule, e.g.
   `tailscale serve --bg --funnel 8090`.
3. Done—clients keep using `https://raspberrypi.<tailscale_number>.ts.net`; new devices
   no longer need the Tailscale app.

## Option C (future): Cloudflare Tunnel

Public HTTPS via a Cloudflare hostname instead of Tailscale.

Outline of the switch:

1. Install `cloudflared` on the Pi, authenticate with your Cloudflare account.
2. Create a tunnel forwarding to `http://127.0.0.1:8090` (or point `tailscale serve`
   aside and target `8080` directly) and map a DNS hostname to it.
3. Update `CORS_ORIGINS` if the frontend origin changes, then set the new
   `https://habits.example.com` URL in each device's Settings.

> Both alternatives change **only** the Sync Server URL in Settings (and optionally
> `CORS_ORIGINS`). The database, Docker setup, and app code stay identical.
