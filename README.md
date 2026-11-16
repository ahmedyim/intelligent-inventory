# Inventory Management System

A multi-tenant, multi-branch inventory system with a FastAPI backend and a React frontend. Each business (tenant) can run several branches, each with its own stock, users and activity. A data-driven forecasting service predicts demand and suggests when and how much to reorder.

> Sections marked **(planned)** or **(example)** describe the intended design. Adjust names to match your code.

---

## Repository layout

```
backend/     FastAPI API, database models, migrations, Dockerfile and docker-compose.yml
frontend/    React + TypeScript + Vite web app (public site and dashboards)
README.md
.gitignore
```

Run the two apps separately: the API on port **8000**, the web app on port **5173**. The API and its database can also be started with one command using [Docker](#run-with-docker).

---

## Features

**Platform**

- **Multi-tenant with branches**: one super admin manages the platform; each branch has its own admin and staff, and users only see data of their own branch.
- **Secure authentication**: short-lived access token plus rotating refresh token stored in an httpOnly cookie, one refresh token per device.
- **Session management**: list active devices, log out one device or all devices.
- **Password flows**: change password, admin reset, forgot/reset by one-time e-mail link (always answers "ok" so registered e-mails are not leaked).
- **CSRF protection** on login, refresh and logout (`X-Requested-With` header plus Origin check).
- **Activity log**: every security-relevant or state-changing action is written in the same database transaction.
- **Inventory**: products, stock per branch, receive / issue / stock count, reorder levels, movement history, low-stock list.
- **Inventory** (planned): categories, suppliers, purchases, transfers between branches.
- **Forecasting service** (planned): demand forecast, reorder point and safety stock computed from sales history.
- **Swagger / OpenAPI** documentation out of the box.
- **Docker support**: API and PostgreSQL start together with `docker compose up`, with a health-checked database and a persistent volume.

**Web app**

- **Public site**: home page with live statistics, product catalog (with in-stock status) and branch list, with no login needed.
- **Role-based dashboards**: each role gets its own layout and menu; the header and logo send a signed-in user to their dashboard.
- **Inventory page**: stock per branch with search and paging, low-stock tab, movement history, receive / issue / count dialogs, per-branch reorder level.
- **Point of sale** and **payment methods** pages.
- **Responsive**: sidebar on desktop, bottom tab bar and drawer menu on phones.

---

## Tech stack

| Layer | Technology |
|---|---|
| API | FastAPI, Uvicorn |
| Database access | SQLAlchemy 2.x (async) |
| Database | PostgreSQL (row locks via `SELECT ... FOR UPDATE` are used) |
| Migrations | Alembic |
| Settings | pydantic-settings (`.env`) |
| Auth | JWT access + refresh tokens, password hashing |
| Forecasting | pandas, NumPy, statsmodels |
| Containers | Docker, Docker Compose |
| Web app | React, TypeScript, Vite |
| UI | Tailwind CSS, shadcn/ui, lucide-react icons, sonner toasts |
| State and data | Redux Toolkit, RTK Query |
| Routing | React Router |

---

## Roles

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Whole platform. Created by the seed script, cannot be created through the API. |
| `BRANCH_ADMIN` | One branch. Only one admin per branch. Manages users of own branch. |
| Staff roles (planned) | Cashier, store keeper, and similar, limited to their branch. |

Branch scoping rule: a branch admin who asks for a user or record of another branch gets the same "not found" error as for a missing id, so ids of other branches never leak. The web app also locks the branch filter to the user's own branch.

---

## Project structure (example)

### Backend

```
backend/
  app/
    main.py                 # FastAPI app, CORS, routers
    core/
      config.py             # Settings from .env
      db.py                 # Async engine and session
      security.py           # Password hashing
      tokens.py             # JWT create/decode
      dependencies.py       # get_current_user, require_admin
      device.py             # Device info (name, user agent, IP)
      exceptions.py         # Typed API errors with codes
    models/                 # SQLAlchemy models
    schemas/                # Pydantic schemas
    crud/                   # Business logic (users, auth, activity logs, inventory)
    routers/                # auth.py, users.py, ...
    services/
      forecasting.py        # Demand forecasting (planned)
    scripts/
      seed_super_admin.py   # Creates the first super admin
  alembic/
  Dockerfile
  docker-compose.yml
  docker-compose.override.yml
  .dockerignore
  .env.example
  .env                      # local only, never committed
  requirements.txt
```

### Frontend

```
frontend/
  src/
    app/                    # store, typed hooks, baseApi (RTK Query), router
    features/               # one folder per area: auth, inventory, products,
                            #   branches, sales, paymentMethods, public, ...
    layouts/                # DashboardLayout, SuperAdminLayout, public layout
    pages/                  # route pages (e.g. pages/super-admin/Inventory.tsx)
    components/             # Logo, Header, ProductImage, ui/ (shadcn/ui)
    hooks/                  # use-mobile, use-debounced-value, ...
    lib/                    # brand, roles, format, utils
    types/                  # shared TypeScript types matching the API
  index.html
  vite.config.ts
  tsconfig.json
  tsconfig.app.json
  package.json
```

---

## Getting started

> Prefer containers? Skip to [Run with Docker](#run-with-docker) to start the API and the database without installing Python or PostgreSQL.

### 1. Requirements

- Python 3.11 or newer
- PostgreSQL 14 or newer
- Node.js 20 or newer (for the web app)

### 2. Clone

```bash
git clone <your-repo-url>
cd <your-project>
```

### 3. Backend setup

```bash
cd backend

python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
```

Install packages. If you have a `requirements.txt`:

```bash
pip install -r requirements.txt
```

Otherwise install the core packages (adjust to the libraries your code imports):

```bash
pip install fastapi "uvicorn[standard]" "sqlalchemy[asyncio]" asyncpg alembic \
            pydantic-settings "pydantic[email]" python-multipart \
            pyjwt "passlib[bcrypt]" \
            pandas numpy statsmodels
pip freeze > requirements.txt
```

### 4. Configure the backend environment

Create `backend/.env`:

```env
# --- Database ---
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/inventory

# --- Tokens ---
ALGORITHM=HS256
ACCESS_TOKEN_SECRET_KEY=change-me-access
REFRESH_TOKEN_SECRET_KEY=change-me-refresh
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAY=7
RESET_TOKEN_EXPIRE_MINUTES=30

# --- Super admin (used by the seed script) ---
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=ChangeThisPassword123
SUPER_ADMIN_FULL_NAME=Super Admin
SUPER_ADMIN_PHONE=+251900000000

# --- Frontend, CORS, cookies ---
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=["http://localhost:5173"]
COOKIE_SECURE=false          # MUST be true in production (HTTPS)
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=
REFRESH_COOKIE_NAME=refresh_token
REFRESH_COOKIE_PATH=/api/v1/auth

# --- CSRF ---
CSRF_REQUIRED=true           # set false only for quick local testing
```

`FRONTEND_URL` and `CORS_ORIGINS` must match the address of the web app (Vite uses `http://localhost:5173`), or login and the refresh cookie will fail with CORS or CSRF errors.

Generate strong secrets with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 5. Create the database tables

```bash
alembic upgrade head
```

### 6. Create the super admin

```bash
python -m app.scripts.seed_super_admin
```

Running it again is safe: if the super admin already exists, nothing is created.

### 7. Run the API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Production (no reload, several workers):

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 8. Run the web app

Open a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env` (the variable name must match the one your code reads; commit a `.env.example` and keep the real `.env` out of Git):

```env
VITE_API_URL=http://localhost:8000
```

Start the dev server:

```bash
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # type-check (tsc -b) and production build
npm run preview      # serve the production build locally
```

Log in at `http://localhost:5173/login` with the super admin e-mail and password from the backend `.env`.

---

## Run with Docker

Docker starts the API and PostgreSQL together with one command, so you do not need Python or PostgreSQL installed on your machine. It is also the same setup you can deploy to a server.

### What you get

| Service | Image | Purpose | Port |
|---|---|---|---|
| `api` | built from `backend/Dockerfile` | FastAPI application | `8000` |
| `db` | `postgres:16` | PostgreSQL database | `5433` on your PC (`5432` inside Docker) |

Docker Compose creates a private network for both services, so the API reaches the database by the name `db`. The database files live in a named volume (`pgdata`), so your data survives when containers are stopped, rebuilt or deleted.

The web app is not containerized yet. Run it with `npm run dev` as described above; it talks to the API on `http://localhost:8000`.

### Files

All Docker files live in `backend/`:

```
backend/
  Dockerfile                    # how to build the API image
  docker-compose.yml            # API + database (production-like base)
  docker-compose.override.yml   # development extras: auto-reload and live code mount
  .dockerignore                 # files that must not enter the image
  .env.example                  # copy to .env and fill in
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /code

# Build tools needed by some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so Docker can cache this layer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code and migrations
COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

The `alembic` folder and `alembic.ini` are copied so you can run migrations inside the container. The database driver in your `DATABASE_URL` (for example `asyncpg` or `psycopg`) must be listed in `requirements.txt`.

### docker-compose.yml

```yaml
services:
  api:
    build: .
    container_name: inventory-api
    env_file: .env
    environment:
      # Inside Docker the database host is the service name "db", not localhost
      DATABASE_URL: postgresql+asyncpg://postgres:${DB_PASSWORD}@db:5432/inventory
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16
    container_name: inventory-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: inventory
    ports:
      - "5433:5432"            # optional: connect with pgAdmin or DBeaver on localhost:5433
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d inventory"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

volumes:
  pgdata:
```

`docker-compose.override.yml` is read automatically in development and adds auto-reload and a live mount of your code:

```yaml
services:
  api:
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./app:/code/app
```

### .dockerignore

```
.env
.env.*
!.env.example
__pycache__/
*.pyc
.pytest_cache/
.venv/
venv/
.git/
.vscode/
.idea/
*.log
```

### Environment for Docker

Use the same `backend/.env` as for a local run and add the database password:

```env
DB_PASSWORD=change-me
```

The `DATABASE_URL` line in `.env` may keep `localhost` for running without Docker. The `environment:` entry in `docker-compose.yml` overrides it inside the container.

For plain `http://localhost`, keep `COOKIE_SECURE=false`, otherwise the browser will not store the refresh cookie.

### First run

```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env  (then edit the values)

docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python -m app.scripts.seed_super_admin
```

Open `http://localhost:8000/docs`. Then start the web app in another terminal (`cd frontend && npm run dev`) and log in with the super admin from your `.env`.

### Everyday commands

| Task | Command |
|---|---|
| Start (build if needed) | `docker compose up -d --build` |
| Show running services | `docker compose ps` |
| Follow API logs | `docker compose logs -f api` |
| Open a shell in the API container | `docker compose exec api bash` |
| Run migrations | `docker compose exec api alembic upgrade head` |
| Open a database shell | `docker compose exec db psql -U postgres -d inventory` |
| Restart the API | `docker compose restart api` |
| Stop and remove containers (data is kept) | `docker compose down` |
| Stop and delete the database volume | `docker compose down -v` |

### Key concepts

| Term | Meaning |
|---|---|
| Image | A built, read-only package of your app and its dependencies (from the Dockerfile). |
| Container | A running instance of an image. |
| Volume | Storage outside the container. `pgdata` keeps the database when containers are removed. |
| Network | A private virtual network. Services reach each other by name (`api` talks to `db`). |

### Development and production

- **Development**: `docker compose up -d --build` loads the override file, so the server reloads when you edit files in `backend/app`.
- **Production**: run only the base file so there is no reload and no code mount:
  ```bash
  docker compose -f docker-compose.yml up -d --build
  ```
  Also set `COOKIE_SECURE=true`, `CSRF_REQUIRED=true`, real `FRONTEND_URL` and `CORS_ORIGINS`, new random secrets, and put the API behind HTTPS (for example a reverse proxy such as Nginx or Caddy). Do not publish the database port (`5433`) on a public server.

### Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| API cannot connect to the database | `DATABASE_URL` still uses `localhost`. Inside Docker the host must be `db`. |
| `alembic: command not found` or no `alembic.ini` | The Dockerfile must copy `alembic.ini` and `alembic/` (see above), then rebuild with `--build`. |
| `libpq` or driver import error | Add the driver to `requirements.txt` (for example `psycopg[binary]` or `asyncpg`) and rebuild. |
| Login works but the session is lost on reload | `COOKIE_SECURE=true` on plain `http://localhost`, or `FRONTEND_URL` and `CORS_ORIGINS` do not match the web app address. |
| Port already in use | Another service uses port 8000 or 5433. Change the left side of the mapping, for example `"8001:8000"`. |
| Changes in the code do not appear | You ran only the base file. Use `docker compose up -d --build` (with the override) in development. |
| Need a clean database | `docker compose down -v`, then run the migrations and the seed script again. |

---

## How the web app talks to the API

- **API calls** go through one RTK Query `baseApi`. Each feature adds its endpoints with `injectEndpoints` and uses cache tags (`Product`, `Stock`, `Report`, ...) so lists refresh after changes, for example after receiving stock.
- **Access token** is kept in memory only (Redux), never in `localStorage`. The auth state has three values: `loading`, `authenticated` and `anonymous`.
- **Refresh token** lives in the httpOnly cookie. On page load the app calls `POST /auth/refresh` to restore the session, so requests must send credentials (`credentials: "include"`) and the `X-Requested-With: XMLHttpRequest` header.
- **Logout** calls the API (which clears the cookie), clears the auth state and resets the RTK Query cache so the next user never sees cached data.
- **Route access** depends on the user's role; each role has its own home route, which the header "Dashboard" button and the logo use.
- **Path alias**: `@/` points to `frontend/src` (set in `tsconfig.app.json` and `vite.config.ts`).

---

## API documentation (Swagger)

| URL | What it is |
|---|---|
| http://localhost:8000/docs | Swagger UI |
| http://localhost:8000/redoc | ReDoc |
| http://localhost:8000/openapi.json | Raw OpenAPI schema |

### Logging in with Swagger

1. Open `/docs`, choose `POST /auth/login`, click **Try it out**.
2. Fill `x-requested-with` with `XMLHttpRequest` (no quotes). Without it you get `403 csrf_failed`.
3. Send email and password. The response contains `access_token`; the refresh token is set as an httpOnly cookie.
4. Click **Authorize** (top right), paste the access token, and call protected endpoints.

### Getting a new access token

`POST /auth/refresh` with the header `X-Requested-With: XMLHttpRequest`, no body. The refresh token is read from the cookie, then rotated (old one revoked, new one set). Each refresh token works only once. In a browser, send requests with credentials (`withCredentials: true` in Axios, `credentials: "include"` in fetch).

### Auth endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Log in, get access token and refresh cookie |
| POST | `/auth/refresh` | New access token, rotated refresh cookie |
| POST | `/auth/logout` | Log out this device |
| POST | `/auth/logout-all` | Log out all devices |
| GET | `/auth/sessions` | List active devices |
| DELETE | `/auth/sessions/{session_id}` | Log out one device |
| POST | `/auth/forgot-password` | Send reset link (same answer for any e-mail) |
| POST | `/auth/reset-password` | Set a new password with the one-time token |

### User endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/users` | List users (branch admins see only their branch) |
| POST | `/users` | Create user |
| GET | `/users/me` | Current user |
| POST | `/users/me/change-password` | Change own password |
| GET / PATCH / DELETE | `/users/{user_id}` | Read, update, delete |
| POST | `/users/{user_id}/reset-password` | Admin password reset |
| PATCH | `/users/{user_id}/status` | Activate, deactivate or suspend |

### Inventory endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/inventory` | Stock rows (with product), filter by branch, product or search |
| POST | `/inventory` | Create an empty stock row for a product in a branch |
| GET / PATCH | `/inventory/{inventory_id}` | Read a row, change its reorder level |
| GET | `/inventory/low-stock` | Items at or below their reorder level |
| GET | `/inventory/movements` | Stock movement history |
| POST | `/inventory/receive` | Stock in (updates weighted-average cost, optional new price) |
| POST | `/inventory/issue` | Stock out: sale, damage, loss, expired, other (409 if not enough stock) |
| POST | `/inventory/adjust` | Stock count: send the counted quantity, the difference is recorded |

---

## Business rules

### Users and branches

- A super admin cannot be created or assigned through the API.
- Email is trimmed and lowercased; email and phone must be unique.
- A branch can have only one `BRANCH_ADMIN`; the `branch_id` is required for that role.
- A branch admin can only create and edit users of their own branch and cannot create or assign admin roles.
- Deactivating or suspending a user revokes all their sessions. Hard delete is only for users created by mistake; prefer deactivation.
- Changing or resetting a password logs the user out of every device.

### Tokens and sessions

- Access token: 15 minutes by default. Refresh token: 7 days by default.
- Refresh tokens rotate on every use. If an already used token comes back, it may be stolen, so all sessions of that user are revoked and an activity log row is written.
- Logout is idempotent and never treats a repeated logout as theft.
- Run `delete_expired_tokens` from a scheduled job (cron, APScheduler, Celery beat) because rotation adds a row on every refresh.

### Inventory

- Stock is stored per product per branch; every change creates a stock movement row (receive, issue, count adjustment).
- Stock can never go negative; the check and the update happen in one transaction with a row lock.
- A per-branch reorder level overrides the product's default; leaving it empty means "use the product default".
- Every stock change also changes the product's total stock, so product lists and dashboard figures refresh with it.
- Planned: transfers between branches create two linked movements (out and in) in the same transaction, and all inventory changes write an activity log row.

---

## Forecasting service (planned)

The forecasting service turns sales history into purchasing decisions, per product and per branch.

### Data flow

```
stock movements (sales)  ->  daily demand series  ->  clean and fill gaps
        ->  choose model  ->  forecast + error  ->  reorder point, safety stock, order quantity
        ->  suggestions stored and shown to the branch admin
```

### Steps

1. **Collect**: aggregate sales movements into a daily (or weekly) quantity per product and branch. Days with no sales become 0.
2. **Clean**: remove returns that cancel a sale, cap extreme outliers, mark stock-out days (zero sales because there was no stock) so they are not mistaken for zero demand.
3. **Choose a model** based on how much history there is:
   - Less than 4 weeks: simple average of recent days.
   - Stable demand: moving average or simple exponential smoothing.
   - Trend and seasonality (weekly, monthly): Holt-Winters (`statsmodels` ExponentialSmoothing).
   - Slow-moving or irregular items: Croston's method.
4. **Back-test**: hold out the last N days, compare models by MAPE / MAE / RMSE, and keep the best one per product.
5. **Forecast** the next 7, 30 and 90 days with a confidence range.
6. **Recommend**:

```
lead_time_demand = forecast_daily_demand * lead_time_days
safety_stock     = z * std_dev_daily_demand * sqrt(lead_time_days)
reorder_point    = lead_time_demand + safety_stock
order_quantity   = max(0, reorder_point + review_period_demand - stock_on_hand - stock_on_order)
```

`z` comes from the target service level (for example 1.65 for 95%).

### Outputs (example)

| Field | Meaning |
|---|---|
| `product_id`, `branch_id` | What the forecast is for |
| `forecast` | Predicted quantity per day for the horizon |
| `lower`, `upper` | Confidence range |
| `model` | Model that won the back-test |
| `mape` | Back-test error |
| `reorder_point`, `safety_stock` | Stock levels that trigger an order |
| `suggested_order_qty` | Recommended purchase amount |
| `days_of_cover` | Days until stock runs out at the forecast rate |

### Endpoints (example)

| Method | Path | Purpose |
|---|---|---|
| GET | `/forecasts?branch_id=&product_id=&horizon=30` | Get forecast for a product |
| GET | `/forecasts/reorder-suggestions?branch_id=` | Products that need ordering now |
| POST | `/forecasts/run` | Recompute forecasts (admin) |

### Scheduling

Forecasts should be recomputed automatically, for example every night, using a scheduled job (APScheduler, Celery beat or cron). Never run model training inside a normal request; run it in the background and store results in a table that the API reads.

---

## Security notes

- Set `COOKIE_SECURE=true` and use HTTPS in production.
- Keep `CSRF_REQUIRED=true` in production; set `FRONTEND_URL` and `CORS_ORIGINS` to your real origins only.
- Use long random values for both token secret keys and never commit `.env` files (backend or frontend).
- The frontend keeps the access token in memory only; never store tokens in `localStorage`.
- Change the seed super admin password after the first login.
- Never log passwords or reset tokens (the code already follows this).
- Docker: keep `.env` out of the image (`.dockerignore`) and out of Git; pass settings at run time with `env_file`. Do not publish the database port on a public server.

---

## Testing

Backend:

```bash
cd backend
pip install pytest pytest-asyncio httpx
pytest -q
```

Frontend (type-check and build):

```bash
cd frontend
npm run build
```

---

## Roadmap

- [x] Authentication, sessions, CSRF, activity log
- [x] Users and branch scoping
- [x] Public site (home, catalog, branches)
- [x] Dashboard layouts, inventory page, point of sale
- [ ] Categories and suppliers
- [ ] Transfers between branches
- [ ] Purchases and sales reports
- [ ] Forecasting service and reorder suggestions
- [ ] Reports and dashboards
- [x] Docker (API and PostgreSQL with Docker Compose)
- [ ] CI pipeline and frontend container

---

## License

Add your license here.
