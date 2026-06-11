# Deploying CrisisPilot

Recommended stack: **Render** (backend, Docker) + **Vercel** (frontend) +
**MongoDB Atlas** (already provisioned). Free tiers are sufficient for a demo.

---

## 1. MongoDB Atlas — allow cloud access

Render's free tier has no static egress IP, so:

1. Atlas → **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`).
   - This is fine for a hackathon demo; tighten or pause the cluster afterward.

---

## 2. Backend → Render (Docker)

1. Push this repo to GitHub (done: `github.com/gyamini25/crisispilot`).
2. [Render dashboard](https://dashboard.render.com) → **New** → **Blueprint** →
   connect the repo. Render reads [`render.yaml`](render.yaml) and creates the
   `crisispilot-backend` web service from [`backend/Dockerfile`](backend/Dockerfile).
3. Set the secret env vars (marked `sync:false`) in the Render dashboard:
   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | your Gemini API key |
   | `DT_ENVIRONMENT` | `https://<env-id>.apps.dynatrace.com` |
   | `DT_PLATFORM_TOKEN` | your Dynatrace platform token (`dt0s16…`) |
   | `MONGODB_URI` | your Atlas connection string |
4. Deploy. When live, note the URL, e.g. `https://crisispilot-backend.onrender.com`.
5. Verify: open `https://<backend>/healthz` — it should report
   `dynatrace: live`, `agent_builder: adk`.

> Free Render services sleep after inactivity; the first request cold-starts in
> ~30–60s. WebSockets are supported on all plans.

---

## 3. Frontend → Vercel

1. [Vercel](https://vercel.com) → **Add New Project** → import the repo.
2. Set **Root Directory** to `frontend`.
3. Add environment variables:
   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_BACKEND_HTTP` | `https://<backend>.onrender.com` |
   | `NEXT_PUBLIC_BACKEND_WS` | `wss://<backend>.onrender.com/ws/stream` |
4. Deploy. The dashboard auto-connects to the backend WebSocket and the
   simulator fires incidents on its own.

---

## 4. Update the submission

- **Hosted Project URL** → your Vercel URL.
- The backend CORS already allows all origins, so no extra config is needed.

## Notes

- The Dynatrace MCP server runs via `npx` inside the backend container (Node is
  installed in the image, and the package is pre-fetched in the Dockerfile).
- Everything degrades gracefully: missing/rate-limited credentials fall back to
  scripted agent reasoning, so the hosted demo never hard-fails.
