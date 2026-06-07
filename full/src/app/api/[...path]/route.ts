import { NextRequest, NextResponse } from "next/server";
import {
  createRoom,
  deleteRoom,
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

async function dispatch(request: NextRequest, method: string, path: string[]) {
  if (method === "GET" && path.length === 1 && path[0] === "rooms") {
    return json(listRooms());
  }

  if (method === "POST" && path.length === 1 && path[0] === "rooms") {
    return json(createRoom(await readJson(request)), 201);
  }

  if (method === "POST" && path.length === 3 && path[0] === "rooms" && path[2] === "join") {
    return json(joinRoom(path[1], await readJson(request)));
  }

  if (method === "POST" && path.length === 3 && path[0] === "rooms" && path[2] === "kick") {
    return json(kickMember(path[1], await readJson(request)));
  }

  if (method === "DELETE" && path.length === 2 && path[0] === "rooms") {
    return json(deleteRoom(path[1], await readJson(request)));
  }

  if (method === "POST" && path.length === 3 && path[0] === "rooms" && path[2] === "restore") {
    return json(restoreRoom(path[1], await readJson(request)));
  }

  if (method === "POST" && path.length === 1 && path[0] === "messages") {
    return json(postMessage(await readJson(request)));
  }

  if (method === "GET" && path.length === 2 && path[0] === "messages") {
    return json(getMessages(path[1]));
  }

  if (method === "POST" && path.length === 2 && path[0] === "archive" && path[1] === "search") {
    return json(searchArchive(await readJson(request)));
  }

  if (method === "GET" && path.length === 2 && path[0] === "debug" && path[1] === "nodes") {
    return json(getDebugNodes());
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
