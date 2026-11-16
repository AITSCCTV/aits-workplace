import { apiClient } from "./client";

const ROOT = "/api/admin/content-studio";

/** Adapt the retained Studio UI to the dashboard's existing session-refresh client. */
export const studioRequest: typeof fetch = async (input, init) => {
  const path = String(input);
  const method = init?.method || "GET";
  try {
    let data: unknown;
    if (path === "/api/research" && method === "POST") data = await apiClient.post(ROOT + "/research", {});
    else if (path.startsWith("/api/research/") && method === "GET") data = await apiClient.get(ROOT + path.slice(4));
    else if (path === "/api/drafts" && method === "GET")
      data = await apiClient.get(ROOT + "/drafts");
    else if (path === "/api/status" && method === "GET")
      data = await apiClient.get(ROOT + "/status");
    else if (path === "/api/drafts" && method === "PATCH")
      data = await apiClient.put(
        ROOT + "/drafts",
        JSON.parse(String(init?.body)),
      );
    else if (path === "/api/post" && method === "POST")
      data = await apiClient.post(
        ROOT + "/post",
        JSON.parse(String(init?.body)),
      );
    else
      return Response.json(
        { error: "Unsupported Content Studio request" },
        { status: 404 },
      );
    return Response.json(data);
  } catch (error) {
    const failure = error as Error & { status?: number };
    return Response.json(
      { error: failure.message },
      { status: failure.status || 503 },
    );
  }
};
