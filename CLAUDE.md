# CLAUDE.md (Developer Runbook - Active Applet)

This contains development guidelines, APIs, and commands for the active **CourtAdvantage** Vite + Express + Firestore applet.

---

## 🚀 Commands & Getting Started

### Local Setup
```bash
# Install dependencies
npm install

# Start local server (Vite frontend + Express backend on port 3000)
npm run dev

# Start local server on a custom port (e.g. if port 3000 is occupied)
PORT=3005 npm run dev
```

### Build & Run
```bash
# Build production assets (Vite frontend + server CJS bundle)
npm run build

# Start compiled production bundle
npm run start
```

---

## 🔌 API Endpoints (Local/Production)

* **`/api/courts`** - Returns all tennis courts parsed from `./repo/nyc_tennis_courts.csv`.
* **`/api/availability`** - Fetches the latest available slots snapshot from Firestore `tennisData/latest`.
* **`/api/sync`** - Manually triggers the web scraper for courts 1–13, filters for available-only slots, and uploads to Firestore (`tennisData/latest` and `tennisHistory/<timestamp>`).
* **`/api/debug-cache`** - Retrieves summary metrics (total counts, available counts) from Firestore.
* **`/api/geocode?q=<address>`** - Translates ZIP/address queries to lat/lon coordinates via US Census Geocoder API.

---

## 🗄️ Database Structure (Cloud Firestore)

Configured via [firebase-applet-config.json](file:///Users/yogendrarao/antigravity/CourtAdvantage/firebase-applet-config.json) under database ID `ai-studio-19a22120-779e-47a7-99d0-7d05f105cb4b`:

1. **`tennisData/latest`**
   * Overwritten on every sync run.
   * Schema: `{ slots: Array<Slot>, lastUpdated: string }`
   * Only stores active, available slots (`is_available = true`). Booked slots are filtered out.
2. **`tennisHistory/<timestamp>`**
   * Appended as a new document on every sync run (timestamp format: `YYYY-MM-DDTHH-mm-ss-SSSZ` to avoid colon issues).
   * Schema matches `tennisData/latest` to log historical sync run records.
3. **`courts`** (Firestore collection)
   * Seeded via `seed.ts` (runs `firebase-admin`).

---

## 🚨 Deployment & Troubleshooting

* **Hosting URL**: Deployed on Google Cloud Run via Google AI Studio at:
  [https://ai.studio/apps/19a22120-779e-47a7-99d0-7d05f105cb4b](https://ai.studio/apps/19a22120-779e-47a7-99d0-7d05f105cb4b)
* **GCP Project**: `gen-lang-client-0591625831` (Region: `us-east1`, Service name: `courtadvantage`).
* **Scaling Restrictions**: Strictly throttled to `Max Instances = 1` by AI Studio to manage costs.
* **Troubleshooting 'Rate exceeded' (429)**:
  * Check the logs using:
    ```bash
    gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=courtadvantage" --limit=20
    ```
  * GFE (Google Frontend) will return 429 if the single instance is cold-starting or receives multiple concurrent requests. Allow 15-30 minutes for billing changes to propagate across GCP edge servers if billing was recently reactivated.
