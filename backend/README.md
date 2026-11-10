
# Backend

## Structure

The backend is split into 3 parts:
- `routes`: the full router
- `services`: the logic for the router
- `store`: the sql queries for the services

There are no plans on adding any more than the main 3 folders!
Only subfolders - each for one domain - are added!


Each domain has code for only its domain!

`store` does not know about `services`; `services` does not know about `routes`

## API

everything is listed under `/api/*`

to see what to use implement swagger later :)


## AI assistance

AI may implement and change the login system:
- `services/auth`, `store/auth`, `routes/auth.go`, `routes/admin.go`
- `services/settings`, `store/settings`
- the database setup in `services/db`, including the `*_schema.sql` files

`routes/domain_page/*` is off limits - domain logic is written by hand!

Two factor auth (TOTP) lives in `services/auth/2factor.go`, no extra dependency.

Rules that hold there as well: no magic values, not even for testing - config comes
from the environment, everything else is a named constant. No comments in the code.

## Database

sqlite, one file, path from `DB_PATH`. The `*_schema.sql` files are applied on startup
in the order listed in `schemaFiles` in `services/db/init.go` - a new schema file has to
be added there, after the files it depends on.

Tables owned by a user carry `owner_id` and `ON DELETE CASCADE`. There is one file for
all users - never one per user.

## Auth

Passwords are hashed twice: the browser sends `sha256("home-v4:" + name + ":" + password)`
as hex, the server runs bcrypt on top of that. The format is implemented in
`frontend/app/lib/password.ts` and in `clientHash` in `services/auth/password.go` - both
have to stay identical, and a user cannot be renamed without invalidating their password.

The 8 character minimum is checked in the browser and on `ADMIN_PASSWORD`. The server
only sees the client hash, so it checks that shape instead.

TOTP secrets are encrypted with AES-GCM using `TOTP_SECRET_KEY`. Enabling or disabling
two factor needs the password, not just a session. There are no backup codes - recovery
is `sqlite3 <db> "DELETE FROM user_twofactor WHERE user_id = ?"`.

Failed logins are counted per account in `user_lockouts`, so a lockout survives a
restart. Every 10 failures raise the level: 1 minute, then 2, then 10, then permanent.
A permanent lock answers `423` and also drops that user's sessions; only an admin can
clear it with `POST /api/auth/unlock` and `{"name": "..."}`. A successful login clears
the counter and the level. A temporary lock answers `429`.

`/api/auth/*` also has a per IP rate limit, which only helps once the real client IP is
forwarded - every request currently arrives from the frontend container.

## Environment

| Variable | Used for |
| --- | --- |
| `PORT` | backend listen port |
| `DB_PATH` | sqlite file |
| `SESSION_TTL_MINUTES` | session lifetime, renewed when half of it is left |
| `ADMIN_USER`, `ADMIN_PASSWORD` | first admin, only applied while no user exists |
| `TOTP_SECRET_KEY` | 32 bytes, base64, encrypts the TOTP secrets |
| `SITE_ADDRESS` | Caddy site address in prod |
| `SESSION_COOKIE_SECURE` | frontend, `true` only behind TLS |

Prod runs behind Caddy, which terminates TLS with `tls internal` - a self signed CA whose
root has to be trusted on each device. With a real domain, drop that line from the
`Caddyfile` and Caddy gets a certificate on its own. Dev stays on plain http, so
`SESSION_COOKIE_SECURE` is `false` there.
