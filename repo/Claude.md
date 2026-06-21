# Claude Notes

## Project Overview

`nyc-tennis-slots-finder` is a Next.js + TypeScript frontend with Python ETL scripts and PostgreSQL-backed data.

- Frontend: Next.js app router
- APIs: Next.js route handlers in `src/app/api`
- ETL: Python scripts in `src/`
- Data files: `data/court_availability/raw_files/`

## Runbook

Install dependencies:

```bash
pip install -r requirements.txt
pip install -r requirements-test.txt
npm install
```

Run app locally:

```bash
npm run dev
```

Build/test checks:

```bash
npm run type-check
npm test
npm run build
```

Python tests:

```bash
python -m pytest tests/ -v
```

## Manual Data Refresh

Main entry points:

- UI page: `/etl-refresh`
- API trigger: `POST /api/etl-refresh`
- Status: `GET /api/etl-status`
- Availability summary: `GET /api/park-availability`

Refresh uses `src/court_availability_finder.py` and writes timestamped CSV files to:

- `data/court_availability/raw_files/court_availability_<YYYYMMDD_HHMMSS>.csv`

## Important Implementation Notes

- Dev server uses polling watch mode to avoid `EMFILE` watcher issues:
  - `package.json` `dev` script: `WATCHPACK_POLLING=true next dev`
- ETL refresh API now treats "no data collected" as a failure response (not a silent success).
- Proxy handling has safeguards:
  - API routes sanitize loopback proxy variables for spawned Python processes.
  - Python scraper tries both direct and env-proxy network modes.

## Known Troubleshooting Tips

If ETL refresh fails:

1. Check API response from `POST /api/etl-refresh` for exact network error details.
2. Verify newest file from `GET /api/etl-status`.
3. If DNS/proxy issues appear, inspect shell env:
   - `echo $HTTP_PROXY $HTTPS_PROXY $ALL_PROXY`
4. Validate connectivity from the same runtime environment used by the app server.

## Git / Branch Workflow

Typical branch flow in this repo:

- `feature/*` -> `dev` -> `qa` -> `main`

When committing local changes, avoid committing generated artifacts unless explicitly intended:

- `tsconfig.tsbuildinfo`
- ad-hoc raw CSV files in `data/court_availability/raw_files/`
