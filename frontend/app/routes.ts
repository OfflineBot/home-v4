import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("layouts/auth.tsx", [
    route("login", "routes/login.tsx"),
    route("register", "routes/register.tsx"),
  ]),

  route("logout", "routes/logout.tsx"),

  layout("layouts/app.tsx", [
    index("routes/home.tsx"),

    route("settings", "routes/settings/layout.tsx", [
      index("routes/settings/index.tsx"),
      route("profile", "routes/settings/profile.tsx"),
      route("connections", "routes/settings/connections.tsx"),
      route("security", "routes/settings/security.tsx"),
      route("sync", "routes/settings/sync.tsx"),
      route("appearance", "routes/settings/appearance.tsx"),
      route("notifications", "routes/settings/notifications.tsx"),
      route("delete", "routes/settings/delete.tsx"),
    ]),

    route(":page", "routes/domain.tsx"),
  ]),
] satisfies RouteConfig;
