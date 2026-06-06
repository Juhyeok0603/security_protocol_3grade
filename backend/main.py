from datetime import datetime, timezone
from pathlib import Path
from secrets import token_urlsafe
import sqlite3
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = Path(__file__).with_name("chat_archive.db")
NODE_IDS = ("node1", "node2", "node3")
NODE_DB_PATHS = {
    node_id: Path(__file__).with_name(f"{node_id}_shares.db")
    for node_id in NODE_IDS
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def connect_node_db(node_id: str) -> sqlite3.Connection:
    conn = sqlite3.connect(NODE_DB_PATHS[node_id])
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                owner TEXT NOT NULL,
                password TEXT,
                invite_code TEXT NOT NULL,
                created_at TEXT NOT NULL,
                destroyed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS room_members (
                room_id TEXT NOT NULL,
                nickname TEXT NOT NULL,
                joined_at TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (room_id, nickname),
                FOREIGN KEY (room_id) REFERENCES rooms(id)
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (room_id) REFERENCES rooms(id)
            );

            CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name);
            CREATE INDEX IF NOT EXISTS idx_messages_room_sequence ON messages(room_id, sequence);
            CREATE INDEX IF NOT EXISTS idx_messages_sender_time ON messages(sender, created_at);
            """
        )
    for node_id in NODE_IDS:
        with connect_node_db(node_id) as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS shares (
                    message_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    sender TEXT NOT NULL,
                    share TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_shares_room ON shares(room_id);
                """
            )


init_db()


def row_to_room_summary(conn: sqlite3.Connection, room: sqlite3.Row) -> dict:
    members = conn.execute(
        """
        SELECT nickname
        FROM room_members
        WHERE room_id = ? AND active = 1
        ORDER BY nickname
        """,
        (room["id"],),
    ).fetchall()
    return {
        "id": room["id"],
        "name": room["name"],
        "owner": room["owner"],
        "has_password": bool(room["password"]),
        "invite_code": room["invite_code"],
        "members": [member["nickname"] for member in members],
        "created_at": room["created_at"],
        "destroyed_at": room["destroyed_at"],
    }


def require_active_room(conn: sqlite3.Connection, room_id: str) -> sqlite3.Row:
    room = conn.execute(
        "SELECT * FROM rooms WHERE id = ? AND destroyed_at IS NULL",
        (room_id,),
    ).fetchone()
    if not room:
        raise HTTPException(status_code=404, detail="Active room not found")
    return room


def require_active_member(conn: sqlite3.Connection, room_id: str, nickname: str) -> None:
    member = conn.execute(
        """
        SELECT 1
        FROM room_members
        WHERE room_id = ? AND nickname = ? AND active = 1
        """,
        (room_id, nickname),
    ).fetchone()
    if not member:
        raise HTTPException(status_code=403, detail="Join the room before using it")


def fetch_message_payloads(conn: sqlite3.Connection, room_id: str, where_sql: str = "", params: tuple = ()) -> List[dict]:
    messages = conn.execute(
        f"""
        SELECT id, sender, sequence, created_at
        FROM messages
        WHERE room_id = ?
        {where_sql}
        ORDER BY sequence
        """,
        (room_id, *params),
    ).fetchall()

    result = []
    for message in messages:
        shares = []
        for node_id in NODE_IDS:
            with connect_node_db(node_id) as node_conn:
                share = node_conn.execute(
                    "SELECT share FROM shares WHERE message_id = ?",
                    (message["id"],),
                ).fetchone()
            if share:
                shares.append(share["share"])
        result.append(
            {
                "message_id": message["id"],
                "sender": message["sender"],
                "sequence": message["sequence"],
                "created_at": message["created_at"],
                "shares": shares,
            }
        )
    return result


class CreateRoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    owner: str = Field(min_length=1, max_length=24)
    password: Optional[str] = Field(default=None, max_length=64)


class JoinRoomRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=24)
    password: Optional[str] = None
    invite_code: Optional[str] = None


class KickMemberRequest(BaseModel):
    owner: str
    target: str


class DeleteRoomRequest(BaseModel):
    owner: str


class RestoreRoomRequest(BaseModel):
    nickname: str


class ShareData(BaseModel):
    node_id: str
    share: str


class MessageShares(BaseModel):
    sender: str
    room_id: str
    shares: List[ShareData]


class ArchiveSearchRequest(BaseModel):
    room_name: str = Field(min_length=1, max_length=40)
    nickname: str = Field(min_length=1, max_length=24)
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    context_size: int = Field(default=5, ge=1, le=20)


@app.get("/rooms")
def list_rooms():
    with connect_db() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM rooms
            WHERE destroyed_at IS NULL
            ORDER BY created_at DESC
            """
        ).fetchall()
        return {"rooms": [row_to_room_summary(conn, row) for row in rows]}


@app.post("/rooms", status_code=status.HTTP_201_CREATED)
def create_room(data: CreateRoomRequest):
    room_id = f"room_{uuid4().hex[:10]}"
    owner = data.owner.strip()
    password = data.password.strip() if data.password else None
    created_at = now_iso()

    with connect_db() as conn:
        conn.execute(
            """
            INSERT INTO rooms (id, name, owner, password, invite_code, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (room_id, data.name.strip(), owner, password or None, token_urlsafe(6), created_at),
        )
        conn.execute(
            """
            INSERT INTO room_members (room_id, nickname, joined_at, active)
            VALUES (?, ?, ?, 1)
            """,
            (room_id, owner, created_at),
        )
        room = conn.execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
        return {"room": row_to_room_summary(conn, room)}


@app.post("/rooms/{room_id}/join")
def join_room(room_id: str, data: JoinRoomRequest):
    nickname = data.nickname.strip()
    with connect_db() as conn:
        room = require_active_room(conn, room_id)
        password = data.password or ""
        invite_code = data.invite_code or ""
        if room["password"] and password != room["password"] and invite_code != room["invite_code"]:
            raise HTTPException(status_code=403, detail="Password or invite code is required")

        conn.execute(
            """
            INSERT INTO room_members (room_id, nickname, joined_at, active)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(room_id, nickname) DO UPDATE SET active = 1
            """,
            (room_id, nickname, now_iso()),
        )
        room = conn.execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
        return {"room": row_to_room_summary(conn, room)}


@app.post("/rooms/{room_id}/kick")
def kick_member(room_id: str, data: KickMemberRequest):
    with connect_db() as conn:
        room = require_active_room(conn, room_id)
        if data.owner != room["owner"]:
            raise HTTPException(status_code=403, detail="Only the room owner can kick members")
        if data.target == room["owner"]:
            raise HTTPException(status_code=400, detail="The owner cannot be kicked")

        conn.execute(
            """
            UPDATE room_members
            SET active = 0
            WHERE room_id = ? AND nickname = ?
            """,
            (room_id, data.target),
        )
        room = conn.execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
        return {"room": row_to_room_summary(conn, room)}


@app.delete("/rooms/{room_id}")
def delete_room(room_id: str, data: DeleteRoomRequest):
    with connect_db() as conn:
        room = require_active_room(conn, room_id)
        if data.owner != room["owner"]:
            raise HTTPException(status_code=403, detail="Only the room owner can delete the room")

        conn.execute(
            """
            UPDATE rooms
            SET destroyed_at = ?
            WHERE id = ?
            """,
            (now_iso(), room_id),
        )
        conn.execute(
            """
            UPDATE room_members
            SET active = 0
            WHERE room_id = ?
            """,
            (room_id,),
        )
        share_count = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM messages
            WHERE room_id = ?
            """,
            (room_id,),
        ).fetchone()["count"] * len(NODE_IDS)

    return {"status": "success", "archived_shares": share_count}


@app.post("/rooms/{room_id}/restore")
def restore_room(room_id: str, data: RestoreRoomRequest):
    nickname = data.nickname.strip()
    with connect_db() as conn:
        room = conn.execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        previous_member = conn.execute(
            """
            SELECT 1
            FROM room_members
            WHERE room_id = ? AND nickname = ?
            """,
            (room_id, nickname),
        ).fetchone()
        if not previous_member:
            raise HTTPException(status_code=403, detail="Only previous room members can restore the room")

        conn.execute(
            """
            UPDATE rooms
            SET destroyed_at = NULL
            WHERE id = ?
            """,
            (room_id,),
        )
        conn.execute(
            """
            UPDATE room_members
            SET active = 1
            WHERE room_id = ? AND nickname = ?
            """,
            (room_id, nickname),
        )
        room = conn.execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
        return {"room": row_to_room_summary(conn, room)}


@app.post("/messages")
def post_message(data: MessageShares):
    sender = data.sender.strip()
    with connect_db() as conn:
        require_active_room(conn, data.room_id)
        require_active_member(conn, data.room_id, sender)

        message_id = uuid4().hex
        sequence = conn.execute(
            "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM messages WHERE room_id = ?",
            (data.room_id,),
        ).fetchone()["next_sequence"]
        conn.execute(
            """
            INSERT INTO messages (id, room_id, sender, sequence, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (message_id, data.room_id, sender, sequence, now_iso()),
        )

        for share_data in data.shares:
            if share_data.node_id in NODE_IDS:
                with connect_node_db(share_data.node_id) as node_conn:
                    node_conn.execute(
                        """
                        INSERT INTO shares (message_id, room_id, sender, share)
                        VALUES (?, ?, ?, ?)
                        """,
                        (message_id, data.room_id, sender, share_data.share),
                    )

    return {"status": "success", "message": "Shares distributed and archived successfully"}


@app.get("/messages/{room_id}")
def get_messages(room_id: str):
    with connect_db() as conn:
        require_active_room(conn, room_id)
        return {"messages": fetch_message_payloads(conn, room_id)}


@app.post("/archive/search")
def search_archive(data: ArchiveSearchRequest):
    nickname = data.nickname.strip()
    room_name = data.room_name.strip()
    time_filters = []
    params: List[str] = [nickname]
    if data.start_at:
        time_filters.append("m.created_at >= ?")
        params.append(data.start_at)
    if data.end_at:
        time_filters.append("m.created_at <= ?")
        params.append(data.end_at)
    time_sql = f"AND {' AND '.join(time_filters)}" if time_filters else ""

    with connect_db() as conn:
        anchors = conn.execute(
            f"""
            SELECT
                r.id AS room_id,
                r.name AS room_name,
                r.destroyed_at,
                m.sequence
            FROM messages m
            JOIN rooms r ON r.id = m.room_id
            JOIN room_members rm ON rm.room_id = r.id AND rm.nickname = ?
            WHERE r.name LIKE ?
              AND m.sender = ?
              {time_sql}
            ORDER BY m.created_at DESC
            LIMIT 20
            """,
            (nickname, f"%{room_name}%", nickname, *params[1:]),
        ).fetchall()

        results = []
        seen_windows = set()
        for anchor in anchors:
            start_sequence = max(1, anchor["sequence"] - data.context_size)
            end_sequence = anchor["sequence"] + data.context_size
            window_key = (anchor["room_id"], start_sequence, end_sequence)
            if window_key in seen_windows:
                continue
            seen_windows.add(window_key)

            messages = fetch_message_payloads(
                conn,
                anchor["room_id"],
                "AND sequence BETWEEN ? AND ?",
                (start_sequence, end_sequence),
            )
            results.append(
                {
                    "room_id": anchor["room_id"],
                    "room_name": anchor["room_name"],
                    "destroyed_at": anchor["destroyed_at"],
                    "anchor_sequence": anchor["sequence"],
                    "messages": messages,
                }
            )

    return {"results": results}


@app.get("/debug/nodes")
def get_debug_nodes():
    nodes: Dict[str, List[dict]] = {node_id: [] for node_id in NODE_IDS}
    with connect_db() as conn:
        active_rooms = conn.execute(
            "SELECT id FROM rooms WHERE destroyed_at IS NULL"
        ).fetchall()
        active_room_ids = [row["id"] for row in active_rooms]
    if not active_room_ids:
        return nodes

    placeholders = ",".join("?" for _ in active_room_ids)
    for node_id in NODE_IDS:
        with connect_node_db(node_id) as node_conn:
            rows = node_conn.execute(
                f"""
                SELECT message_id, sender, room_id, share
                FROM shares
                WHERE room_id IN ({placeholders})
                ORDER BY rowid
                """,
                active_room_ids,
            ).fetchall()
        nodes[node_id] = [
            {
                "message_id": row["message_id"],
                "sender": row["sender"],
                "room_id": row["room_id"],
                "share": row["share"],
            }
            for row in rows
        ]
    return nodes
