# Inventory Management System

A multi-tenant, multi-branch inventory system built with FastAPI. Each business (tenant) can run several branches, each with its own stock, users and activity. A data-driven forecasting service predicts demand and suggests when and how much to reorder.

> Sections marked **(planned)** or **(example)** describe the intended design. Adjust names to match your code.

---

## Features

- **Multi-tenant with branches**: one super admin manages the platform; each branch has its own admin and staff, and users only see data of their own branch.
- **Secure authentication**: short-lived access token plus rotating refresh token stored in an httpOnly cookie, one refresh token per device.
- **Session management**: list active devices, log out one device or all devices.
- **Password flows**: change password, admin reset, forgot/reset by one-time e-mail link (always answers "ok" so registered e-mails are not leaked).
- **CSRF protection** on login, refresh and logout (`X-Requested-With` header plus Origin check).
- **Activity log**: every security-relevant or state-changing action is written in the same database transaction.
- **Inventory** (planned): products, categories, suppliers, stock per branch, purchases, sales, transfers between branches, adjustments.
- **Forecasting service** (planned): demand forecast, reorder point and safety stock computed from sales history.
- **Swagger / OpenAPI** documentation out of the box.

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

---

## Roles

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Whole platform. Created by the seed script, cannot be created through the API. |
| `BRANCH_ADMIN` | One branch. Only one admin per branch. Manages users of own branch. |
| Staff roles (planned) | Cashier, store keeper, and similar, limited to their branch. |

Branch scoping rule: a branch admin who asks for a user or record of another branch gets the same "not found" error as for a missing id, so ids of other branches never leak.

---

## Project structure (example)

```
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
.env
requirements.txt
```

---

## Getting started

### 1. Requirements

- Python 3.11 or newer
- PostgreSQL 14 or newer

### 2. Clone and create a virtual environment

```bash
git clone <your-repo-url>
cd <your-project>

python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
```

### 3. Install packages

If you have a `requirements.txt`:

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

### 4. Configure the environment

Create a `.env` file in the project root:

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
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=[]
COOKIE_SECURE=false          # MUST be true in production (HTTPS)
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=
REFRESH_COOKIE_NAME=refresh_token
REFRESH_COOKIE_PATH=/api/v1/auth

# --- CSRF ---
CSRF_REQUIRED=true           # set false only for quick local testing
```

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

### 7. Run the server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Production (no reload, several workers):

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

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

### Inventory (planned)

- Stock is stored per product per branch; every change creates a stock movement row (purchase, sale, transfer in/out, adjustment, return).
- Stock can never go negative; the check and the update happen in one transaction with a row lock.
- Transfers between branches create two linked movements (out and in) in the same transaction.
- All inventory changes write an activity log row.

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
- Use long random values for both token secret keys and never commit `.env`.
- Change the seed super admin password after the first login.
- Never log passwords or reset tokens (the code already follows this).

---

## Testing

```bash
pip install pytest pytest-asyncio httpx
pytest -q
```

---

## Roadmap

- [x] Authentication, sessions, CSRF, activity log
- [x] Users and branch scoping
- [ ] Products, categories, suppliers
- [ ] Stock movements and transfers between branches
- [ ] Purchases and sales
- [ ] Forecasting service and reorder suggestions
- [ ] Reports and dashboards
- [ ] Docker and CI

---

## License

Add your license here.
