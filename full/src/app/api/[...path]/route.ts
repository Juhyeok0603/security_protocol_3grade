import { NextRequest, NextResponse } from "next/server";
import {
  clearAdminSessionCookie,
  hasAdminSession,
  isAdminCredential,
  setAdminSessionCookie,
} from "@/lib/adminAuth";
import {
  adminClearDatabase,
  adminDeleteRoom,
  createRoom,
  deleteRoom,
  getAdminSnapshot,
  getDebugNodes,
  getMessages,
  handleApiError,
  joinRoom,
  kickMember,
  listRooms,
  postMessage,
  restoreRoom,
  searchArchive,
} from "@/lib/protocolStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    path?: string[];
  }>;
};

async function readJson(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function requireAdmin() {
  if (!(await hasAdminSession())) {
    throw { status: 401, detail: "Admin login required" };
  }
}

async function dispatch(request: NextRequest, method: string, path: string[]) {
  if (method === "POST" && path.length === 2 && path[0] === "admin" && path[1] === "login") {
    const data = await readJson(request);
    if (!isAdminCredential(data.username, data.password)) {
      return json({ detail: "Invalid admin credentials" }, 401);
    }
    await setAdminSessionCookie();
    return json({ status: "success" });
  }

  if (method === "POST" && path.length === 2 && path[0] === "admin" && path[1] === "logout") {
    await clearAdminSessionCookie();
    return json({ status: "success" });
  }

  if (method === "GET" && path.length === 2 && path[0] === "admin" && path[1] === "session") {
    return json({ authenticated: await hasAdminSession() });
  }

  if (path[0] === "admin") {
    await requireAdmin();
  }

  if (method === "GET" && path.length === 2 && path[0] === "admin" && path[1] === "dashboard") {
    return json(await getAdminSnapshot());
  }

  if (method === "DELETE" && path.length === 3 && path[0] === "admin" && path[1] === "rooms") {
    return json(await adminDeleteRoom(path[2]));
  }

  if (method === "DELETE" && path.length === 2 && path[0] === "admin" && path[1] === "db") {
    return json(await adminClearDatabase());
  }

  if (method === "GET" && path.length === 1 && path[0] === "rooms") {
    return json(await listRooms());
  }

  if (method === "POST" && path.length === 1 && path[0] === "rooms") {
    return json(await createRoom(await readJson(request)), 201);
  }

  if (method === "POST" && path.length === 3 && path[0] === "rooms" && path[2] === "join") {
    return json(await joinRoom(path[1], await readJson(request)));
  }

  if (method === "POST" && path.length === 3 && path[0] === "rooms" && path[2] === "kick") {
    return json(await kickMember(path[1], await readJson(request)));
  }

  if (method === "DELETE" && path.length === 2 && path[0] === "rooms") {
    return json(await deleteRoom(path[1], await readJson(request)));
  }

  if (method === "POST" && path.length === 3 && path[0] === "rooms" && path[2] === "restore") {
    return json(await restoreRoom(path[1], await readJson(request)));
  }

  if (method === "POST" && path.length === 1 && path[0] === "messages") {
    return json(await postMessage(await readJson(request)));
  }

  if (method === "GET" && path.length === 2 && path[0] === "messages") {
    return json(await getMessages(path[1]));
  }

  if (method === "POST" && path.length === 2 && path[0] === "archive" && path[1] === "search") {
    return json(await searchArchive(await readJson(request)));
  }

  if (method === "GET" && path.length === 2 && path[0] === "debug" && path[1] === "nodes") {
    return json(await getDebugNodes());
  }

  return json({ detail: "Not found" }, 404);
}

async function handler(request: NextRequest, context: Params) {
  const { path = [] } = await context.params;
  try {
    return await dispatch(request, request.method, path);
  } catch (error) {
    const result = handleApiError(error);
    return json(result.body, result.status);
  }
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
