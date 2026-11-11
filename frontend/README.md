# home-v4 frontend

React Router 8 (framework mode, SSR) + Tailwind 4. Talks to the Go backend
through `/api`.

## Layout contract

Every page renders inside the same shell. A new domain only provides a body —
the chrome is already there.

```
root.tsx                   h-screen, bg-ctp-crust — the frame
└── <Sidebar />            transparent, sits on the frame, flush left
└── <Outlet />
    └── <Page>             card filling the rest, bg-ctp-mantle
        ├── header         h-12, colored icon + title, border-b
        └── body           scrolls — a domain writes only this
            └── <Block>    module card, bg-ctp-base
```

Tone follows elevation: the further forward something is, the lighter it gets.
The frame is darkest so the chrome recedes and the eye lands on the content.

**Components never name a palette colour.** They use semantic roles, and each
role points at a different tone per theme, because the same tone does not hold
contrast in both:

| role | mocha | latte | used for |
| --- | --- | --- | --- |
| `ui-frame` | crust | crust | shell + sidebar |
| `ui-surface` | mantle | mantle | content card |
| `ui-raised` | base | base | block bodies, menu popup |
| `ui-field` | mantle | mantle | inputs |
| `ui-border` | surface1 | surface2 | card + panel borders |
| `ui-hover` | surface0 | surface0 | row hover |
| `ui-fg` | text | text | body text |
| `ui-fg-muted` | subtext0 | subtext1 | secondary text, nav labels |
| `ui-fg-faint` | overlay2 | subtext1 | panel titles |
| `ui-ring` | overlay0 | subtext0 | focus ring |
| `ui-danger` | red | red | destructive actions |

So `bg-ui-raised`, `text-ui-fg-muted`, `border-ui-border` — not `bg-ctp-base`.
Only genuine status colours stay direct: `ctp-green` and `ctp-mauve` for the
wordmark. Destructive UI goes through `ui-danger`, including its tints —
`bg-[color-mix(in_oklab,var(--ui-danger)_14%,transparent)]` — so the red adapts
per theme instead of being a fixed palette value that fights the background.

Do not invert this by making panels darker than the surface they sit on — a
recessed card reads as an input field, not as a module.

### Accent colours and contrast

Every combination holds WCAG AA (4.5:1 text, 3:1 UI) in **both** themes;
verified, not estimated. Worst case mocha 7.58:1, latte 4.69:1.

An accent therefore exists in two forms:

- `var(--accent)` — the raw colour, for icons, tints and borders
- `var(--accent-fg)` — the text-safe variant

Latte accents are too light for text on a light surface (pink on mantle is
2.17:1). `--accent-fg` mixes the accent toward `--ui-fg` by `--accent-mix`,
which is `100%` in mocha (no change) and `30%` in latte. Use `--accent` on
surfaces and icons, `--accent-fg` on anything that is read as text.

A new scheme therefore needs a `:root[data-theme="..."]` block with the palette,
any role overrides, and an `--accent-mix` that keeps the worst accent above
4.5:1.

The active nav row is tinted with its own accent, not a neutral grey:
`bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]` plus
`text-[var(--accent)]`. Hover stays neutral (`surface0`) so the two states
never read as the same thing.

## Grid

Everything is a multiple of 4px. Only these values are used:

| token | value | used for |
| --- | --- | --- |
| `h-12` | 48px | sidebar toggle, page header |
| `h-9` | 36px | nav rows (both navs), account row, menu items |
| `h-10` | 40px | block header |
| `size-5` | 20px | icon slot, both states |
| `size-4` | 16px | every icon |
| `p-3` | 12px | shell gap, sidebar vertical padding |
| `p-4` | 16px | content body, panel padding |
| `px-2` | 8px | row padding, both states |
| `ml-3` / `ml-0 w-0` | 12 / 0px | label offset, open / collapsed |
| `w-56` / `w-13` | 224 / 52px | sidebar open / collapsed |

The toggle row and the page header are both `h-12` and both start 12px from the
top, so their centers land on the same horizontal line. Keep it that way when
adding header content.

Collapsed centering comes from the paddings alone, and the sidebar sits flush
against the window edge — the shell pads only `py-3 pr-3`, never on the left,
and there is no gap between sidebar and card. That matters: the icon must look
centered inside the strip from the window edge to the card, not inside the
sidebar box in isolation. Adding left padding centers it too, but wastes 12px.

```
52px sidebar: 8px (aside px-2) + 8px (row px-2) + 20px slot + 8 + 8 = 52
icon lands at 18..34, card starts at 52 -> 18px of air on each side
```

Because the padding is now `px-2` in both states, the icon does not move at all
when collapsing — only the width and the label animate. Measured across the
transition, icon-x stays at 18 from first frame to last.

Two rules keep this stable:

**Never switch `justify-content` between the states.** It is not animatable, so
it applies on the first frame while width and padding are still interpolating —
the icon jumps left, then slides right. That exact glitch cost a round of
debugging. Keep `justify-start` in both states and let the paddings do the work.

**Never put `gap` on a row.** `gap` does not shrink, so it keeps reserving space
next to a label that has already collapsed, which pushes the slot off center.
The label carries its own `ml-3` and collapses to `ml-0 w-0` instead.

Everything that changes is fixed-to-fixed and interpolates cleanly: sidebar
`width` + `padding`, label `width` + `margin` + `opacity`.

## `<Page>`

```tsx
<Page title="Lights" color="pink">
  ...body...
</Page>
```

| prop | required | meaning |
| --- | --- | --- |
| `title` | yes | shown in the header, rendered in `color` |
| `color` | no | Catppuccin color name, defaults to `mauve` |
| `icon` | no | icon name from `app/components/icons.tsx` |
| `actions` | no | node placed at the right end of the header |

`Page` sets `--accent` from `color`, so anything in the body can use
`text-[var(--accent)]` or `bg-[var(--accent)]` without knowing which color it is.

### `<Block>`

The one module shape in the app — header on `ui-surface` with an optional
`<Badge>`, body on `ui-raised`. One block per subtopic, stacked with `<Stack>`;
never style a raw div as a card.

```tsx
<Stack>
  <Block title="Two factor" status={<Badge tone="good">On</Badge>}>...</Block>
</Stack>
```

## Theme

The palette lives exactly once, in `app/app.css`: all 26 Catppuccin colors as
`--ctp-*` variables. Mocha on `:root`, Latte under `:root[data-theme="light"]`.

Switching themes means setting `data-theme` on `<html>`. Nothing else.

Adding a custom scheme means adding one more `:root[data-theme="..."]` block
with the same variable names — no component changes.

Two rules:

- **Never write a hex value outside `app.css`.** Use `bg-ctp-mantle`,
  `text-ctp-subtext0`, `border-ctp-surface0`.
- The `ctp-` prefix is required, not decoration: `text-base` is already a
  Tailwind font-size utility, so an unprefixed `--color-base` would collide.

`@theme inline` is what makes runtime switching work. Without `inline`, Tailwind
copies the hex values into the utilities and `data-theme` has no effect.

## Icons

`app/components/icons.tsx` holds every icon as an inline SVG path — no icon
dependency. All of them are 24x24, `fill="none"`, `stroke="currentColor"`,
`stroke-width="1.5"`, round caps and joins. Keep new ones to that geometry or
they will not sit next to the existing set.

`<Icon name="lights" />` renders at `size-4`. Color comes from `currentColor`,
so the slot around it decides: `text-[var(--accent)]` in the sidebar and in the
page header, `text-ctp-subtext0` for neutral rows.

A nav entry resolves its icon by its `slug`, so `slug: "lights"` needs a
`lights` key in `paths`. Unknown names fall back to the `pages` icon.

## Settings

`/settings` is the first real domain and uses a second, narrower nav inside the
page: groups on the left, content on the right. That pattern was chosen because
Connections and Background sync will grow — a horizontal tab bar runs out of
room, a vertical list does not.

```
routes/settings/layout.tsx     the two column shell, loads /api/auth/me
  index.tsx                    redirects to /settings/profile
  profile / connections / security / sync        -> group "Account"
  appearance / notifications                     -> group "Site"
  delete                       below a divider, red on hover
```

Adding a section is two steps: an entry in `app/lib/settings-nav.ts` (with an
icon of the same key in `icons.tsx`) and a route in `routes.ts`. Nothing else
knows about the list.

Note the nesting rule: child paths under `route("settings", ...)` must be
relative (`"profile"`), never absolute. `prefix("")` produces absolute paths and
React Router rejects the config with *"An absolute child route path must start
with the combined path of all its parent routes"*.

Layout is two blocks side by side, both in the same card style as `<Block>`:
the nav on the left, the content on the right. The nav uses `self-start` so it
hugs its items instead of stretching to full height — otherwise "Delete account"
floats at the bottom edge and stops reading as part of the block.

Inside the content area: **one `<Block>` per subtopic**, stacked by `<Stack>`.
Security is therefore two blocks — Password and Two factor — not two regions in
one card. Separate blocks make the grouping visible without a caption saying so.

A block is a header on `ui-surface` (one tone darker) plus a body on
`ui-raised`. That is the same header/body shape as the page card itself, so the
whole app reads as one system. `<Badge>` carries status in the header
(`Administrator`, `On`/`Off`, `Online`), which replaces a sentence of prose.

This is the **only** module shape — there is no second card component. Home and
the domain pages use the same `<Block>`.

### Where controls go

**No prose that explains the obvious.** A field called "Current password" needs
no sentence under it, and nobody has to be told what two factor is. Status goes
in a `<Badge>`, not in a paragraph. If a heading would only repeat the nav entry
("Profile" under *Profile*), leave it out.

**An action sits below what it acts on, not to its right.** `<SettingRow>`
stacks label, hint, inputs and then the button, all left aligned. A control
parked at the far right of a wide card forces the pointer across the whole card
after the user just finished typing — the distance is the cost (Fitts's law),
and it grows with every pixel the card gets wider.

That gives the screen two zones, and new domains should keep them:

- **left** — everything you operate: navigation, forms, buttons
- **right** — content you read: a mail body, a document, a log

Buttons that belong to that content (reply, delete, mark read) go with the
content, not back on the left. The rule is proximity to the thing being acted
on, not a fixed column.

Inputs use `fieldStackClass` so fields and their button share one axis and one
max width.

### What is actually wired

| section | backend | state |
| --- | --- | --- |
| Profile | `GET /api/auth/me` | name and role shown; **no rename endpoint**, field disabled |
| Security — password | `POST /api/auth/password` | live |
| Security — two factor | `POST /api/auth/2factor/{setup,confirm,disable}` | live |
| Appearance | none needed | live, `theme` cookie + `data-theme` on `<html>` |
| Connections, Background sync, Notifications | none | placeholders |
| Delete account | none | disabled; the backend only lets an **admin** delete users |

The two factor flow mirrors the backend: `setup` returns a secret, the user adds
it to their app, `confirm` activates it. Every two factor call wants the
password again, so it is hashed once and held in component state for the length
of the flow rather than asking twice.

Theme note: the switch writes a cookie and sets `data-theme` immediately, so it
applies without a reload. The backend has `settings.SetTheme` but no route for
it, so the choice is per browser for now.

## Adding a domain

1. Add an entry to `app/lib/nav.ts` — `slug`, `label`, and a Catppuccin `color`.
   Add a matching path under the same key in `app/components/icons.tsx`. It
   appears in the sidebar and `/<slug>` resolves immediately via
   `app/routes/domain.tsx`.
2. Only once it needs its own logic, give it a real route: add
   `route("<slug>", "routes/<slug>.tsx")` to `app/routes.ts` (before the
   `:page` catch-all) and render a `<Page>` with the same `color`.

Settings is deliberately not in `navItems`. It lives in `settingsItem` and is
reached through the account menu at the bottom of the sidebar. `allItems`
combines both and is what `domain.tsx` resolves against.

## Sidebar state

The collapsed/expanded state lives in a \`sidebar\` cookie (\`open\` / \`closed\`,
one year, \`samesite=lax\`), not in \`localStorage\`.

The reason is SSR: the root loader reads the cookie via
\`readSidebarOpen(request.headers.get("Cookie"))\` and passes it to
\`<Sidebar defaultOpen={...} />\`, so the server renders the correct width on the
first byte. With \`localStorage\` the server cannot know the state, and the
sidebar would render open and then snap shut on hydration.

The toggle writes the cookie directly with \`document.cookie\` — it is pure UI
state, so no action or fetcher is involved. Anything missing or unrecognized
counts as open.

## Password hashing

The password is hashed in the browser and only the hash is submitted. Verified:
a login POST carries `name` and `passwordHash`, the plaintext appears in no
request.

`app/lib/password.ts` derives it with PBKDF2-SHA256, 600k iterations (OWASP
2023), salt `home-v4:<name lowercased and trimmed>`, 256 bits as hex. The salt
is deterministic on purpose — the client must derive the same value without
asking the server first, which would leak whether an account exists.

The backend derives the same value in `clientHash` (`services/auth/password.go`)
for the bootstrap admin, so the two implementations must stay in sync. Verified
identical across WebCrypto, Go and python hashlib for the same inputs,
including the trimming and lowercasing. Because the name is normalized here and
`users.name` is `COLLATE NOCASE`, two spellings that differ only in case are one
account.

It runs in `onSubmit`, **not** in the `action`. An action executes on the Node
server, so hashing there would already have sent the plaintext over the wire.
The handler builds the FormData itself, deletes `password`, adds
`passwordHash`, and submits that.

Two things this does not do:

- **It does not replace server-side hashing.** The backend must still run the
  incoming value through bcrypt or argon2 before storing it. Otherwise the
  stored value *is* the credential and a database leak lets anyone log in
  without knowing the password.
- **It needs a secure context.** `crypto.subtle` is undefined on plain HTTP
  unless the host is `localhost`. Opening the app over a LAN IP without TLS
  breaks login — that is the point where a reverse proxy with HTTPS stops being
  optional.

## Auth and layouts

Two layout routes, so the shell is not shared:

```
layouts/auth.tsx   /login /register     centered card, no sidebar
layouts/app.tsx    / and /:page         sidebar + content card
routes/logout.tsx  POST only            revokes the session, clears the cookie
```

`layouts/app.tsx` is the guard: its loader redirects to `/login` when there is
no `session` cookie, and it validates the token against `GET /api/auth/me`. On
`401` or `403` it redirects to `/login` with an expired `Set-Cookie`, so a
revoked or expired session cannot leave you in a shell where every request
fails. The route data carries `user` (`name`, `is_admin`, `two_factor`), which
child routes read with `useRouteLoaderData("layouts/app")`. When the backend is
unreachable, `user` is `null` and the shell still renders. `layouts/auth.tsx` does the reverse — with a session it
sends you to `/`. Neither page can render the other's chrome, which is why the
sidebar is simply absent when logged out rather than hidden with CSS.

The session cookie is `HttpOnly`, so only the loader reads it, never the
browser. Logout therefore cannot clear it from JS: it posts to `/logout`, which
sends `POST /api/auth/logout` with the token so the server drops the session,
then answers with an expired `Set-Cookie`. Clearing the cookie alone is not
enough - the token would stay valid until it expires.

### Reading the session cookie

`sessionCookie.serialize()` does **not** store the raw value: React Router
JSON-encodes it and then base64s it. So a token saved as `abc123` arrives in the
header as `session=ImFiYzEyMyI`.

Therefore never read the cookie with a regex. `readSession()` goes through
`sessionCookie.parse()` and is async for that reason, as is every loader calling
it.

Getting this wrong fails in a way that looks like a backend bug: the login
succeeds, the cookie is set, then the next loader sends the base64 string as a
bearer token, the backend answers 401, and the layout clears the session it just
received. The browser shows two `Set-Cookie` headers in a row — one setting the
session, one expiring it — and the user lands back on `/login` with no error.

### Errors never move the layout

Form errors are shown by `<Toast>`, fixed at the top right. They are not
rendered inline, because an inline message pushes everything below it down the
moment it appears — a layout shift caused by the user's own click.

`api()` in `app/lib/api.ts` never throws. A dead or hanging backend becomes a
`503` response (`unreachableStatus`), with an 8s `AbortSignal.timeout`, so it
surfaces as a normal inline failure instead of reaching the error boundary.
Every route that calls the backend must check `unreachableStatus` *before* its
content-specific branches, otherwise an outage reads as "wrong password".

### Two factor is a second step

The code field does not sit next to the password as an optional input. The form
submits name + password first; only when the backend answers
`two_factor_required` does the route return `{ twoFactorRequired: true }` and
the form switches steps.

Name and password are then hidden rather than unmounted, so their values stay
in the DOM and can be re-hashed for the second submit.

`<CodeInput>` renders six boxes grouped 3+3, with auto-advance, backspace,
arrow keys and paste. When all six are filled it submits **once** on its own.
After a rejection `autoSubmit` goes false and the user presses Verify — so a
wrong code does not spin in a resubmit loop.

### What the frontend sends and expects

`POST /api/auth/login` and `POST /api/auth/register`:

```json
{ "name": "<name>", "passwordHash": "<64 hex chars>", "code": "<6 digits>" }
```

`code` is only sent by the login form and may be empty. Register sends `name`
and `passwordHash` only.

Register does **not** answer with a token. It answers `201` with an empty body,
because every new account starts unapproved; `409` means the name is taken and
`400` means `passwordHash` was not 64 hex characters.

Changing a password is `POST /api/auth/password` with `passwordHash` (the current
one) and `newPasswordHash`, both derived the same way. It answers `204` and drops
every session of that user, so the next loader call gets a `401` and the layout
guard sends the browser to `/login` - a password change signs you out everywhere by
design.

A protected request carries the token as `Authorization: Bearer <token>`.
Everything under `/api` needs it except `/api/health`, `/api/auth/login` and
`/api/auth/register`. In a loader, `requireToken(request)` from
`app/lib/session.ts` returns it or throws a redirect to `/login`.

On success the backend answers `200` with

```json
{ "token": "...", "expires_at": "2026-11-18T22:00:00Z" }
```

`expires_at` goes through `new Date(...)`, so it must be RFC3339 — which is what
Go's `time.Time` marshals to. Unix seconds would be read as 1970 and the cookie
would expire instantly.

The route then sets the cookie itself via `sessionCookie.serialize(token)`; the
backend does **not** send `Set-Cookie`. Cookie attributes therefore live in
`app/lib/session.ts`: `HttpOnly`, `SameSite=Lax`, and `Secure` whenever
`NODE_ENV=production`.

Failures are mapped to inline messages, never a redirect: `two_factor_required`
and `not_approved` in the body, `423` for a locked account, `429` for rate
limiting, anything else becomes "Wrong name or password".

## Backend access

`app/lib/api.ts` is the only place that knows the backend URL. It reads
`process.env.API_URL` and falls back to `http://localhost:8080`.

**Fetch in `loader` and `action` only, never from the browser.** There is no
reverse proxy: in dev the Vite proxy handles `/api`, in production it does not
exist, so a client-side `fetch("/api/...")` would hit the Node server and 404.
Server-side fetching works identically in both.

If a domain ever needs real client-side requests — websockets, uploads,
polling — a reverse proxy has to be added in front of both services first.

## Commands

```fish
npm run dev        # vite dev server on 5173
npm run build
npm run start      # react-router-serve on 3000
npm run typecheck
```

If `npm run typecheck` fails with `EACCES` on `.react-router/`, the dev
container wrote there as root: `sudo chown -R 1000:1000 .react-router`.
