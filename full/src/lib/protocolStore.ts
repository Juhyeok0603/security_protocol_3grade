import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const NODE_IDS = ["node1", "node2", "node3"] as const;
export type NodeId = (typeof NODE_IDS)[number];

type Room = {
  id: string;
  name: string;
  owner: string;
  password: string | null;
  invite_code: string;
  created_at: string;
  destroyed_at: string | null;
};

type RoomMember = {
  room_id: string;
  nickname: string;
  joined_at: string;
  active: boolean;
};

type Message = {
  id: string;
  room_id: string;
  sender: string;
  sequence: number;
  created_at: string;
};

type Share = {
  message_id: string;
  room_id: string;
  sender: string;
  share: string;
};

type Store = {
  rooms: Room[];
  room_members: RoomMember[];
  messages: Message[];
  nodes: Record<NodeId, Share[]>;
};

type ApiError = {
  status: number;
  detail: string;
};

const emptyStore = (): Store => ({
  rooms: [],
  room_members: [],
  messages: [],
  nodes: {
    node1: [],
    node2: [],
    node3: [],
  },
});

const dataDir =
  process.env.PROTOCOL_DATA_DIR ||
  (process.env.VERCEL ? join("/tmp", "protocol-final") : join(process.cwd(), ".data"));

const dataPath = join(dataDir, "chat_archive.json");

function nowIso() {
  return new Date().toISOString();
}

function makeError(status: number, detail: string): ApiError {
  return { status, detail };
}

function loadStore(): Store {
  try {
    const parsed = JSON.parse(readFileSync(dataPath, "utf8")) as Store;
    return {
      ...emptyStore(),
      ...parsed,
      nodes: {
        ...emptyStore().nodes,
        ...(parsed.nodes || {}),
      },
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: Store) {
  mkdirSync(dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, JSON.stringify(store, null, 2), "utf8");
}

function roomSummary(store: Store, room: Room) {
  const members = store.room_members
    .filter((member) => member.room_id === room.id && member.active)
    .map((member) => member.nickname)
    .sort((a, b) => a.localeCompare(b));

  return {
    id: room.id,
    name: room.name,
    owner: room.owner,
    has_password: Boolean(room.password),
    invite_code: room.invite_code,
    members,
    created_at: room.created_at,
    destroyed_at: room.destroyed_at,
  };
}

function requireActiveRoom(store: Store, roomId: string) {
  const room = store.rooms.find((item) => item.id === roomId && item.destroyed_at === null);
  if (!room) {
    throw makeError(404, "Active room not found");
  }
  return room;
}

function requireActiveMember(store: Store, roomId: string, nickname: string) {
  const member = store.room_members.find(
    (item) => item.room_id === roomId && item.nickname === nickname && item.active,
  );
  if (!member) {
    throw makeError(403, "Join the room before using it");
  }
}

function fetchMessagePayloads(store: Store, roomId: string, predicate?: (message: Message) => boolean) {
  return store.messages
    .filter((message) => message.room_id === roomId && (!predicate || predicate(message)))
    .sort((a, b) => a.sequence - b.sequence)
    .map((message) => ({
      message_id: message.id,
      sender: message.sender,
      sequence: message.sequence,
      created_at: message.created_at,
      shares: NODE_IDS.flatMap((nodeId) => {
        const item = store.nodes[nodeId].find((share) => share.message_id === message.id);
        return item ? [item.share] : [];
      }),
    }));
}

function assertString(value: unknown, field: string, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "string") {
    throw makeError(400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw makeError(400, `${field} length is invalid`);
  }
  return trimmed;
}

function tokenUrlSafe(bytes = 6) {
  return randomBytes(bytes).toString("base64url");
}

export function handleApiError(error: unknown) {
  const err = error as Partial<ApiError>;
  if (typeof err.status === "number" && typeof err.detail === "string") {
    return { status: err.status, body: { detail: err.detail } };
  }
  console.error(error);
  return { status: 500, body: { detail: "Internal server error" } };
}

export function listRooms() {
  const store = loadStore();
  return {
    rooms: store.rooms
      .filter((room) => room.destroyed_at === null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((room) => roomSummary(store, room)),
  };
}

export function createRoom(data: Record<string, unknown>) {
  const store = loadStore();
  const createdAt = nowIso();
  const owner = assertString(data.owner, "owner", 1, 24);
  const password = typeof data.password === "string" && data.password.trim() ? data.password.trim() : null;
  const room: Room = {
    id: `room_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
    name: assertString(data.name, "name", 1, 40),
    owner,
    password,
    invite_code: tokenUrlSafe(6),
    created_at: createdAt,
    destroyed_at: null,
  };

  store.rooms.push(room);
  store.room_members.push({ room_id: room.id, nickname: owner, joined_at: createdAt, active: true });
  saveStore(store);
  return { room: roomSummary(store, room) };
}

export function joinRoom(roomId: string, data: Record<string, unknown>) {
  const store = loadStore();
  const room = requireActiveRoom(store, roomId);
  const nickname = assertString(data.nickname, "nickname", 1, 24);
  const password = typeof data.password === "string" ? data.password : "";
  const inviteCode = typeof data.invite_code === "string" ? data.invite_code : "";

  if (room.password && password !== room.password && inviteCode !== room.invite_code) {
    throw makeError(403, "Password or invite code is required");
  }

  const existing = store.room_members.find(
    (member) => member.room_id === roomId && member.nickname === nickname,
  );
  if (existing) {
    existing.active = true;
    existing.joined_at = nowIso();
  } else {
    store.room_members.push({ room_id: roomId, nickname, joined_at: nowIso(), active: true });
  }
  saveStore(store);
  return { room: roomSummary(store, room) };
}

export function kickMember(roomId: string, data: Record<string, unknown>) {
  const store = loadStore();
  const room = requireActiveRoom(store, roomId);
  const owner = assertString(data.owner, "owner");
  const target = assertString(data.target, "target");

  if (owner !== room.owner) {
    throw makeError(403, "Only the room owner can kick members");
  }
  if (target === room.owner) {
    throw makeError(400, "The owner cannot be kicked");
  }

  store.room_members = store.room_members.map((member) =>
    member.room_id === roomId && member.nickname === target ? { ...member, active: false } : member,
  );
  saveStore(store);
  return { room: roomSummary(store, room) };
}

export function deleteRoom(roomId: string, data: Record<string, unknown>) {
  const store = loadStore();
  const room = requireActiveRoom(store, roomId);
  const owner = assertString(data.owner, "owner");
  if (owner !== room.owner) {
    throw makeError(403, "Only the room owner can delete the room");
  }

  room.destroyed_at = nowIso();
  store.room_members = store.room_members.map((member) =>
    member.room_id === roomId ? { ...member, active: false } : member,
  );
  const shareCount = store.messages.filter((message) => message.room_id === roomId).length * NODE_IDS.length;
  saveStore(store);
  return { status: "success", archived_shares: shareCount };
}

export function restoreRoom(roomId: string, data: Record<string, unknown>) {
  const store = loadStore();
  const room = store.rooms.find((item) => item.id === roomId);
  if (!room) {
    throw makeError(404, "Room not found");
  }
  const nickname = assertString(data.nickname, "nickname", 1, 24);
  const previousMember = store.room_members.find(
    (member) => member.room_id === roomId && member.nickname === nickname,
  );
  if (!previousMember) {
    throw makeError(403, "Only previous room members can restore the room");
  }

  room.destroyed_at = null;
  previousMember.active = true;
  saveStore(store);
  return { room: roomSummary(store, room) };
}

export function postMessage(data: Record<string, unknown>) {
  const store = loadStore();
  const sender = assertString(data.sender, "sender");
  const roomId = assertString(data.room_id, "room_id");
  const shares = Array.isArray(data.shares) ? data.shares : [];

  requireActiveRoom(store, roomId);
  requireActiveMember(store, roomId, sender);

  const sequence =
    Math.max(0, ...store.messages.filter((message) => message.room_id === roomId).map((message) => message.sequence)) +
    1;
  const messageId = randomUUID().replaceAll("-", "");
  const message = { id: messageId, room_id: roomId, sender, sequence, created_at: nowIso() };
  store.messages.push(message);

  for (const item of shares) {
    if (!item || typeof item !== "object") continue;
    const nodeId = (item as { node_id?: unknown }).node_id;
    const share = (item as { share?: unknown }).share;
    if (NODE_IDS.includes(nodeId as NodeId) && typeof share === "string") {
      store.nodes[nodeId as NodeId].push({ message_id: messageId, room_id: roomId, sender, share });
    }
  }

  saveStore(store);
  return { status: "success", message: "Shares distributed and archived successfully" };
}

export function getMessages(roomId: string) {
  const store = loadStore();
  requireActiveRoom(store, roomId);
  return { messages: fetchMessagePayloads(store, roomId) };
}

export function searchArchive(data: Record<string, unknown>) {
  const store = loadStore();
  const nickname = assertString(data.nickname, "nickname", 1, 24);
  const roomName = assertString(data.room_name, "room_name", 1, 40);
  const startAt = typeof data.start_at === "string" ? data.start_at : null;
  const endAt = typeof data.end_at === "string" ? data.end_at : null;
  const contextSize =
    typeof data.context_size === "number" && data.context_size >= 1 && data.context_size <= 20
      ? data.context_size
      : 5;

  const anchors = store.messages
    .filter((message) => {
      const room = store.rooms.find((item) => item.id === message.room_id);
      const member = store.room_members.find(
        (item) => item.room_id === message.room_id && item.nickname === nickname,
      );
      return (
        room &&
        member &&
        room.name.includes(roomName) &&
        message.sender === nickname &&
        (!startAt || message.created_at >= startAt) &&
        (!endAt || message.created_at <= endAt)
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);

  const seenWindows = new Set<string>();
  const results = [];
  for (const anchor of anchors) {
    const room = store.rooms.find((item) => item.id === anchor.room_id);
    if (!room) continue;
    const startSequence = Math.max(1, anchor.sequence - contextSize);
    const endSequence = anchor.sequence + contextSize;
    const windowKey = `${anchor.room_id}:${startSequence}:${endSequence}`;
    if (seenWindows.has(windowKey)) continue;
    seenWindows.add(windowKey);

    results.push({
      room_id: room.id,
      room_name: room.name,
      destroyed_at: room.destroyed_at,
      anchor_sequence: anchor.sequence,
      messages: fetchMessagePayloads(
        store,
        anchor.room_id,
        (message) => message.sequence >= startSequence && message.sequence <= endSequence,
      ),
    });
  }

  return { results };
}

export function getDebugNodes() {
  const store = loadStore();
  const activeRoomIds = new Set(store.rooms.filter((room) => room.destroyed_at === null).map((room) => room.id));
  return Object.fromEntries(
    NODE_IDS.map((nodeId) => [
      nodeId,
      store.nodes[nodeId]
        .filter((share) => activeRoomIds.has(share.room_id))
        .map((share) => ({
          message_id: share.message_id,
          sender: share.sender,
          room_id: share.room_id,
          share: share.share,
        })),
    ]),
  );
}
