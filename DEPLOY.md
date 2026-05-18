# Deploying SBU Air Cargo to cPanel (sbuexport.com)

## Architecture

```
sbuexport.com  ──►  cPanel Node.js App  ──►  Express (index.js)
                                               ├── /api/*        (REST API)
                                               ├── /uploads/*    (files)
                                               └── /*            (React SPA)
```

The Express backend serves **both** the API and the built React frontend files from a single Node.js process.

---

## Step 1 — Build the React Frontend (on your local machine)

```bash
cd frontend
npm install
npm run build:prod
```

This creates `frontend/dist/` with the optimised production files.  
`VITE_API_URL=https://sbuexport.com` is picked up automatically from `.env.production`.

---

## Step 2 — Prepare Files for Upload

Create a folder on your computer called `sbuapp/` with this exact structure:

```
sbuapp/
├── index.js
├── package.json
├── .env                  ← your real production .env (see Step 3)
├── routes/
├── controllers/
├── config/
├── Midleware/
├── models/
├── services/
├── utils/
├── scripts/
├── uploads/              ← leave empty; created at runtime
└── public/               ← copy ALL contents of frontend/dist/ here
    ├── index.html
    ├── assets/
    └── ...
```

> **Important:** Copy the *contents* of `frontend/dist/` into `sbuapp/public/`  
> — not the `dist` folder itself, but everything inside it.

---

## Step 3 — Create Production `.env`

Copy `backend/.env.example` to `sbuapp/.env` and fill in every value:

```env
NODE_ENV=production
PORT=5000
APP_URL=https://sbuexport.com

# cPanel MySQL — get these from cPanel → MySQL Databases
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=cpanelusername_dbuser        # format: cPanelUser_dbUser
DB_PASSWORD=YourStrongDbPassword
DB_NAME=cpanelusername_sbu_export_hub # format: cPanelUser_dbName

JWT_SECRET=generate_with_openssl_rand_hex_64

ADMIN_FULL_NAME=System Admin
ADMIN_EMAIL=admin@sbuexport.com
ADMIN_PASSWORD=ChangeThisNow@2026

BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=no-reply@sbuexport.com
BREVO_SENDER_NAME=SBU Air Cargo

SUPPORT_EMAIL=justin@sbuexport.com
BREVO_GMAIL_TO=justin@sbuexport.com
```

---

## Step 4 — Set Up MySQL Database in cPanel

1. Go to **cPanel → MySQL Databases**
2. Create a new database: `sbu_export_hub`  
   Full name will be `cpanelusername_sbu_export_hub`
3. Create a new database user with a strong password
4. Add the user to the database with **All Privileges**
5. Note the exact DB_USER, DB_PASSWORD, DB_NAME for your `.env`

---

## Step 5 — Upload Files to cPanel

### Option A: File Manager
1. Open **cPanel → File Manager**
2. Navigate to your home directory (`/home/yourusername/`)
3. Create a folder called `sbuapp` (NOT inside `public_html`)
4. Upload all files from your local `sbuapp/` folder into `/home/yourusername/sbuapp/`

### Option B: FTP
Connect with an FTP client and upload to `/home/yourusername/sbuapp/`

---

## Step 6 — Set Up Node.js App in cPanel

1. Go to **cPanel → Software → Setup Node.js App**
2. Click **Create Application**
3. Fill in:
   | Field | Value |
   |-------|-------|
   | Node.js version | **18.x** or **20.x** |
   | Application mode | **Production** |
   | Application root | `/home/yourusername/sbuapp` |
   | Application URL | `sbuexport.com` (select from dropdown) |
   | Application startup file | `index.js` |

4. Click **Create**

---

## Step 7 — Install Dependencies via cPanel Terminal

1. Go to **cPanel → Advanced → Terminal**
2. Run:

```bash
cd ~/sbuapp
npm install --omit=dev
```

---

## Step 8 — Initialize the Database

In the cPanel Terminal:

```bash
cd ~/sbuapp
node scripts/initDb.js
```

This creates all tables and seeds demo data. Do this **only once**.  
If the database already has data, skip it.

---

## Step 9 — Start the Application

Back in **cPanel → Setup Node.js App**:
1. Find your app in the list
2. Click **Start** (or **Restart** if it was already running)

---

## Step 10 — Verify Deployment

Open your browser and test:

| URL | Expected |
|-----|----------|
| `https://sbuexport.com/` | React home page loads |
| `https://sbuexport.com/health` | `{"status":"ok","env":"production"}` |
| `https://sbuexport.com/api/health` | `{"status":"ok","env":"production"}` |
| `https://sbuexport.com/#login` | Login page loads |
| `https://sbuexport.com/#dashboard/admin` | Admin dashboard (after login) |

---

## Troubleshooting

### App shows "Application Error" or 500
- Check cPanel → Node.js → View log for error messages
- Verify all `.env` values are correct
- Confirm `npm install` ran without errors

### Database connection failed
- Double-check `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env`
- Confirm the DB user has ALL PRIVILEGES on the database
- `DB_HOST` must be `127.0.0.1` on cPanel (not `localhost`)

### React app shows blank page / 404 on refresh
- Ensure `sbuapp/public/index.html` exists
- The app uses hash-based routing (`#`) so browser refreshes always work

### Emails not sending
- Verify `BREVO_API_KEY` is correct and active
- Check Brevo dashboard for sending logs
- Ensure sender domain is verified in Brevo

### Socket.IO / real-time not working
- Some shared cPanel hosts block WebSockets
- Socket.IO automatically falls back to HTTP long-polling — the app still works
- For full WebSocket support, you need a VPS or cPanel with WebSocket support enabled

---

## Updating the App (after code changes)

1. **Frontend change:** Rebuild locally (`npm run build:prod` in `frontend/`)  
   Then re-upload `dist/` contents → `sbuapp/public/` on the server  
   Then restart Node.js app in cPanel

2. **Backend change:** Edit the file(s) and re-upload to `sbuapp/`  
   Then restart Node.js app in cPanel

3. **Both:** Do both steps above

---

## File Structure on cPanel Server

```
/home/yourusername/
├── public_html/               ← Apache webroot (can leave empty or put a redirect)
└── sbuapp/                    ← Your Node.js app
    ├── .env                   ← Production secrets (never publicly accessible)
    ├── index.js               ← Entry point
    ├── package.json
    ├── public/                ← Built React SPA (copied from frontend/dist/)
    │   ├── index.html
    │   └── assets/
    ├── uploads/               ← User-uploaded files (auto-created)
    ├── routes/
    ├── controllers/
    └── ...
```

---

## Security Notes

- `.env` is inside `~/sbuapp/` which is **not** in `public_html/` — it is never publicly accessible
- Change `ADMIN_PASSWORD` immediately after first login
- Keep `JWT_SECRET` secret and at least 64 characters long
- The CORS policy only allows `https://sbuexport.com` in production
