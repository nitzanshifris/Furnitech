## AR Furniture Platform – `newfurniture.live`

A serverless platform for uploading, managing, and viewing 3D furniture models in AR, powering `newfurniture.live`.

### Tech stack

- **Runtime/hosting**: Vercel serverless functions (`api/`), static assets in `public/`
- **Database**: Supabase (Postgres) for models, variants, customers, users, analytics
- **Storage/CDN**: AWS S3 (+ optional CloudFront) for `.glb` models and assets
- **Sync & backoffice**: Google Sheets API for customer sheets and data sync
- **Auth & security**: Custom user system in Supabase, bcrypt password hashing, request rate limiting utilities, file-content validation helpers
- **3D/AR**: `<model-viewer>` and Three.js for web and mobile AR experiences
- **QR & tooling**: Local QR generator, migration scripts, AWS/Cloudinary tools, and Supabase helpers in `lib/` and `api/`

### Getting started

- **Prerequisites**
  - Node.js 18+
  - Vercel account
  - Supabase project (Postgres DB)
  - AWS account with an S3 bucket (and optional CloudFront distribution)
  - Google Cloud project/service account if you want the Sheets integrations

- **Install and run locally**

```bash
npm install
npm run dev        # vercel dev
```

Then open `http://localhost:3000/login` (routes are configured via `vercel.json`).

### Environment variables (summary)

Configure these (for example in `.env.local`, which is git‑ignored):

- **Supabase**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- **AWS**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`, optional `AWS_CLOUDFRONT_DOMAIN`
- **Google Sheets**: `GOOGLE_PROJECT_ID`, `GOOGLE_PRIVATE_KEY_ID`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_SHEET_ID`
- **Other legacy integrations** (optional): Cloudinary envs if you use the older migration tooling

### What you’ll find in the code

- **`api/`** – All Vercel functions: core API router, upload endpoints, customer/admin APIs, QR and analytics, plus rich **migration helpers** (Cloudinary → AWS, batch tools, debug endpoints).
- **`lib/`** – Shared libraries that show how the platform uses:
  - Supabase (`supabase.js`), including higher‑level data helpers and SQL-like utilities
  - AWS S3 (`aws-s3-simple.js`) for model/logo upload and URL generation
  - Google Sheets (`google-sheets.js`, `sheets-*.js`) for customer spreadsheets
  - QR code generation, SKU generation, syncing/comparison utilities, security utilities
- **`public/`** – The actual HTML frontends for login, admin, customer dashboards, AR viewer, wallpaper viewer, and several internal test/demo pages used during development.
- **Architecture/migration docs** – High‑level docs like `PLATFORM_ARCHITECTURE.md`, `SYSTEM_ARCHITECTURE_DIAGRAM.md`, and `AWS_S3_SETUP.md` that explain how Supabase, AWS, Google Sheets, and Vercel work together and how the Cloudinary→AWS migration was handled.

This repo is intentionally left close to the real production setup of `newfurniture.live` so you can see the **full toolchain** (Supabase, AWS, Google APIs, Vercel, QR tooling, migration scripts) and adapt it to your own AR content platforms.