
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

Everything under `/api` needs a session. `CollectRoutes` installs that check for the
whole group before it registers anything, so a new domain route is protected without
doing anything for it. Opting out means putting the exact path into `publicPaths` in
`routes/routes.go` - currently only `/api/health` and `/api/auth/login`. Routes
registered in `main.go` before `CollectRoutes` are not covered by it.

Domain handlers read the logged in user with:

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

Anyone can register, nobody can sign in until an admin approves: `POST /api/auth/register`
is public and leaves `users.approved_at` at NULL, login answers `403` with
`{"not_approved": true}` until `POST /api/auth/approve` with `{"name": "..."}` runs.
`GET /api/auth/pending` lists who is waiting; both need an admin. The approval is checked
after bcrypt, so a wrong password still answers `401` and does not reveal the state.

Passwords are hashed twice. The browser derives
`pbkdf2-sha256(password, "home-v4:" + name, 600000, 32)` and sends it as hex in the
`passwordHash` field; the server runs bcrypt on top of that. The name is trimmed and
lowercased before it goes into the salt, and `users.name` is `COLLATE NOCASE`, so
two spellings that differ only in case are one account. The derivation lives in
`frontend/app/lib/password.ts` and in `clientHash` in `services/auth/password.go` -
both have to stay identical, and a user cannot be renamed without invalidating their
password. Go, WebCrypto and python hashlib were cross checked against each other.

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

### Endpoints

| Method and path | Needs | Body | Answers |
| --- | --- | --- | --- |
| `GET /api/health` | - | - | `200` |
| `POST /api/auth/register` | - | `name`, `passwordHash` | `201`, `409` taken, `400` not hashed |
| `POST /api/auth/login` | - | `name`, `passwordHash`, `code` | `200` `{token, expires_at}`, `401`, `403` not approved, `423` locked, `429` throttled |
| `POST /api/auth/logout` | session | - | `204` |
| `GET /api/auth/me` | session | - | `200` `{name, is_admin, two_factor}` |
| `POST /api/auth/password` | session | `passwordHash`, `newPasswordHash` | `204`, `401`, `400` |
| `POST /api/auth/2factor/setup` | session | `passwordHash` | `200` `{secret, uri}`, `401`, `409` already on |
| `POST /api/auth/2factor/confirm` | session | `code` | `204`, `401`, `404`, `409` |
| `POST /api/auth/2factor/disable` | session | `passwordHash`, `code` | `204`, `401`, `404` |
| `GET /api/admin/users` | admin | - | `200` `{users: [...]}` |
| `POST /api/admin/users/approve` | admin | `name` | `204`, `404`, `409` already approved |
| `POST /api/admin/users/revoke` | admin | `name` | `204`, `404`, `409`, `403` self |
| `POST /api/admin/users/unlock` | admin | `name` | `204`, `404` |
| `POST /api/admin/users/role` | admin | `name`, `is_admin` | `204`, `404`, `409`, `403` self |
| `POST /api/admin/users/2factor/reset` | admin | `name` | `204`, `404`, `403` self |
| `POST /api/admin/users/delete` | admin | `name` | `204`, `404`, `403` self |

`/api/auth/*` is what a user does to their own account, `/api/admin/*` is what an admin
does to someone else's. Every `/api/admin/users/*` call refuses to target the caller's
own account with `403`: an admin cannot revoke, demote, delete or reset the two factor of
themselves, because each of those is either a way to lock the last admin out or a way to
drop two factor without knowing the password. Revoking an approval and deleting a user
also drop that user's sessions, and a user row cascades into its sessions, settings, two
factor and lockout rows.

A user list entry carries `Name`, `IsAdmin`, `Approved`, `TwoFactor`, `Locked` and
`CreatedAt`, so one call drives the whole admin view - including who is waiting for
approval, which replaces a separate pending endpoint.

Resetting the two factor of another account is the recovery path for a lost
authenticator, since there are no backup codes.

A password change drops every session of that user, including the one that made the
request, so the client has to sign in again. Two factor stays as it was. `passwordHash`
and `newPasswordHash` are both client hashes; the salt is the name, so it does not
change when the password does.

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
