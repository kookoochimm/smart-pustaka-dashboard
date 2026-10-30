# SMART PUSTAKA Dashboard

React + Vite admin dashboard and Node.js/Express API. The dashboard backend is intended to share the existing Aiven MySQL `library_db` database with the SMART PUSTAKA kiosk.

## Project structure

- `dashboard/` — React + Vite frontend (Cloudflare Pages)
- `dashboard_backend/` — Express API (Render)

## Local development

Requirements: Node.js 20 LTS (or newer supported LTS) and npm.

### 1. Start backend

```bash
cd dashboard_backend
npm install
copy .env.example .env
```

Edit `dashboard_backend/.env` with your database connection details. For local MySQL, use `DB_HOST=localhost`, `DB_PORT=3306`, your local DB username/password, and `DB_NAME=library_db`. For Aiven, use the host, port, username, password and CA certificate supplied by Aiven. Never commit `.env`.

```bash
npm run dev
```

Backend health check: `http://localhost:5002/api/health`

### 2. Start frontend (new terminal)

```bash
cd dashboard
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to `http://localhost:5002`.

## Cloud deployment settings

### Render (backend)

- Root Directory: `dashboard_backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Add environment variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=library_db`, `DB_SSL_CA` (Aiven CA certificate), and `CORS_ORIGINS` (the exact Cloudflare Pages URL). Render supplies `PORT`.

### Cloudflare Pages (frontend)

- Root Directory: `dashboard`
- Build Command: `npm run build`
- Build output directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`

The frontend API base URL is centralized in `dashboard/src/config.js`.

## Important

- Use the existing Aiven `library_db`; do not create a second database for the dashboard.
- Do not commit `.env`, passwords, Aiven certificates, or other credentials.
- The dashboard backend currently uses in-memory RFID scan state and sessions. Deploy it as a single Render instance for the current design; restarting the service clears active login sessions and pending scan state.
- Before public launch, review admin password storage and session security.
