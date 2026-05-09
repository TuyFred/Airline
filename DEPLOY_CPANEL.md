# cPanel Deployment Guide (Frontend + Backend)

## 1) Prepare Backend Environment

1. Copy `backend/.env.production.example` to `backend/.env`.
2. Fill all production values:
   - DB credentials from cPanel MySQL
   - `JWT_SECRET`
   - `APP_URL` and `CORS_ORIGINS`
3. Make sure `NODE_ENV=production`.

## 2) Build Frontend for Production

From `frontend/`:

```bash
npm install
npm run build:prod
```

This creates `frontend/dist/`.

## 3) Choose Hosting Layout

### Option A (Recommended): Backend serves frontend

1. Copy all files from `frontend/dist/` into `backend/public/`.
2. Deploy `backend/` to your cPanel Node.js app path.
3. In cPanel Node.js App:
   - Startup file: `index.js`
   - Run command: `npm install`
   - Restart app

### Option B: Frontend static + backend API separately

1. Upload `frontend/dist/` to `public_html/` (or subfolder).
2. Deploy backend as cPanel Node.js app separately.
3. Set `frontend/.env.production` with:
   - `VITE_API_URL=https://api.your-domain.com` (or your backend URL)
4. Rebuild frontend and re-upload `dist/`.

## 4) Backend Startup on cPanel

- `backend/package.json` uses:
  - `start: node index.js`
- cPanel should provide `NODE_ENV=production` in app environment.

## 5) Important Runtime Notes

- Uploads are served from `/uploads`, so keep `backend/uploads/` writable.
- API health check: `GET /health`
- If you use domain changes, update:
  - `APP_URL`
  - `CORS_ORIGINS`

## 6) Quick Verification Checklist

1. `https://your-domain.com/health` returns JSON `status: ok`.
2. Frontend loads without blank page.
3. Login works.
4. Dashboard API calls return 200.
5. File upload and document download work.
