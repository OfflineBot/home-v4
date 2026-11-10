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
            └── <Panel>    module card, bg-ctp-base
```

Tone follows elevation: the further forward something is, the lighter it gets.
The frame is darkest so the chrome recedes and the eye lands on the content.

| tone | hex | used for |
| --- | --- | --- |
| `crust` | #11111b | shell + sidebar — the frame |
| `mantle` | #181825 | content card, inputs |
| `base` | #1e1e2e | panels, menu popup — furthest forward |
| `surface0` | #313244 | borders, hover |
| `surface1` | #45475a | input borders, avatar ring |

Do not invert this by making panels darker than the surface they sit on — a
recessed card reads as an input field, not as a module.

The active nav row is tinted with its own accent, not a neutral grey:
`bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]` plus
`text-[var(--accent)]`. Hover stays neutral (`surface0`) so the two states
never read as the same thing.

## Grid

Everything is a multiple of 4px. Only these values are used:

| token | value | used for |
| --- | --- | --- |
| `h-12` | 48px | sidebar toggle, page header |
| `h-9` | 36px | nav rows, account row, menu items |
| `size-5` | 20px | icon slot, both states |
| `size-4` | 16px | every icon |
| `p-3` | 12px | shell gap, sidebar vertical padding |
| `p-4` | 16px | content body, panel padding |
| `px-2` / `px-0` | 8 / 0px | row padding, open / collapsed |
| `ml-3` / `ml-0 w-0` | 12 / 0px | label offset, open / collapsed |
| `w-56` / `w-11` | 224 / 44px | sidebar open / collapsed |

The toggle row and the page header are both `h-12` and both start 12px from the
top, so their centers land on the same horizontal line. Keep it that way when
adding header content.

Collapsed centering comes from the paddings alone, and the sidebar sits flush
against the window edge — the shell pads only `py-3 pr-3`, never on the left,
and there is no gap between sidebar and card. That matters: the icon must look
centered inside the strip from the window edge to the card, not inside the
sidebar box in isolation. Adding left padding centers it too, but wastes 12px.

```
44px sidebar: 4px (aside px-1) + 8px (row px-2) + 20px slot + 8 + 4 = 44
icon lands at 14..30, card starts at 44 -> 14px of air on each side
```

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

### `<Panel>`

A content module. Use one per logical block instead of styling raw divs — that
is what makes the grid read as modular.

```tsx
<Panel title="Status">...</Panel>
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
a login POST carries `email` and `passwordHash`, the plaintext appears in no
request.

`app/lib/password.ts` derives it with PBKDF2-SHA256, 600k iterations (OWASP
2023), salt `home-v4:<email lowercased and trimmed>`, 256 bits as hex. The salt
is deterministic on purpose — the client must derive the same value without
asking the server first, which would leak whether an account exists.

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

`/api/auth/login` is still registered as GET in the backend, so a submit
currently answers 405.

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
