import type { Route } from "./+types/automation.api";
import {
  automationGet,
  automationPost,
  relay,
  segment,
} from "../lib/automation.server";
import { requireToken } from "../lib/session";

function readPath(params: URLSearchParams) {
  const kind = params.get("kind");
  const type = params.get("type") ?? "";

  switch (kind) {
    case "status":
      return "/status";
    case "nodes":
      return "/nodes";
    case "node": {
      const query = new URLSearchParams({ type });
      const version = params.get("version");
      if (version) query.set("version", version);
      return `/nodes/detail?${query}`;
    }
    case "credential-types":
      return "/credential-types";
    case "credential-type":
      return `/credential-types/detail?${new URLSearchParams({ type })}`;
    case "credentials":
      return "/credentials";
    case "executions": {
      const query = new URLSearchParams({ limit: "20" });
      const cursor = params.get("cursor");
      if (cursor) query.set("cursor", cursor);
      return `/workflows/${segment(params.get("workflow"))}/executions?${query}`;
    }
    case "execution":
      return `/executions/${segment(params.get("id"))}`;
    case "home-options": {
      const query = new URLSearchParams({ method: params.get("method") ?? "" });
      const light = params.get("light");
      if (light) query.set("light", light);
      return `/home/options?${query}`;
    }
  }

  return null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const path = readPath(new URL(request.url).searchParams);

  if (!path) return Response.json({ error: "unknown_action" }, { status: 400 });

  return relay(await automationGet(token, path));
}

function writeTarget(body: Record<string, unknown>) {
  const id = segment(body.id);

  switch (body.intent) {
    case "create-connection":
      return {
        path: "/credentials",
        payload: { name: body.name, type: body.type, data: body.data },
      };
    case "update-connection":
      return {
        path: `/credentials/${id}`,
        payload: { name: body.name, data: body.data },
      };
    case "delete-connection":
      return { path: `/credentials/${id}/delete` };
    case "test-connection":
      return { path: `/credentials/${id}/test` };
    case "create-workflow":
      return { path: "/workflows", payload: body.workflow };
    case "save-workflow":
      return { path: `/workflows/${id}`, payload: body.workflow };
    case "activate":
      return { path: `/workflows/${id}/activate` };
    case "deactivate":
      return { path: `/workflows/${id}/deactivate` };
    case "delete-workflow":
      return { path: `/workflows/${id}/delete` };
    case "run":
      return { path: `/workflows/${id}/run`, payload: body.payload ?? {} };
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const body = await request.json().catch(() => ({}));
  const target = writeTarget(body);

  if (!target) return Response.json({ error: "unknown_action" }, { status: 400 });

  return relay(await automationPost(token, target.path, target.payload));
}
