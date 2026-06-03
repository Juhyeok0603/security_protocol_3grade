from datetime import datetime, timezone
from secrets import token_urlsafe
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

nodes: Dict[str, List[dict]] = {
    "node1": [],
    "node2": [],
    "node3": [],
}

rooms: Dict[str, dict] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def room_summary(room: dict) -> dict:
    return {
        "id": room["id"],
        "name": room["name"],
        "owner": room["owner"],
        "has_password": bool(room.get("password")),
        "invite_code": room["invite_code"],
        "members": sorted(room["members"]),
        "created_at": room["created_at"],
    }


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


class ShareData(BaseModel):
    node_id: str
    share: str


class MessageShares(BaseModel):
    sender: str
    room_id: str
    shares: List[ShareData]


@app.get("/rooms")
def list_rooms():
    return {"rooms": [room_summary(room) for room in rooms.values()]}


@app.post("/rooms", status_code=status.HTTP_201_CREATED)
def create_room(data: CreateRoomRequest):
    room_id = f"room_{uuid4().hex[:10]}"
    password = data.password.strip() if data.password else None
    room = {
        "id": room_id,
        "name": data.name.strip(),
        "owner": data.owner.strip(),
        "password": password or None,
        "invite_code": token_urlsafe(6),
        "members": {data.owner.strip()},
        "created_at": now_iso(),
    }
    rooms[room_id] = room
    return {"room": room_summary(room)}


@app.post("/rooms/{room_id}/join")
def join_room(room_id: str, data: JoinRoomRequest):
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    password = data.password or ""
    invite_code = data.invite_code or ""
    if room.get("password") and password != room["password"] and invite_code != room["invite_code"]:
        raise HTTPException(status_code=403, detail="Password or invite code is required")

    room["members"].add(data.nickname.strip())
    return {"room": room_summary(room)}


@app.post("/rooms/{room_id}/kick")
def kick_member(room_id: str, data: KickMemberRequest):
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if data.owner != room["owner"]:
        raise HTTPException(status_code=403, detail="Only the room owner can kick members")
    if data.target == room["owner"]:
        raise HTTPException(status_code=400, detail="The owner cannot be kicked")

    room["members"].discard(data.target)
    return {"room": room_summary(room)}


@app.delete("/rooms/{room_id}")
def delete_room(room_id: str, data: DeleteRoomRequest):
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if data.owner != room["owner"]:
        raise HTTPException(status_code=403, detail="Only the room owner can delete the room")

    del rooms[room_id]
    removed_shares = 0
    for node_id in nodes:
        before = len(nodes[node_id])
        nodes[node_id] = [item for item in nodes[node_id] if item["room_id"] != room_id]
        removed_shares += before - len(nodes[node_id])

    return {"status": "success", "removed_shares": removed_shares}


@app.post("/messages")
def post_message(data: MessageShares):
    room = rooms.get(data.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if data.sender not in room["members"]:
        raise HTTPException(status_code=403, detail="Join the room before sending messages")

    message_id = uuid4().hex
    for share_data in data.shares:
        if share_data.node_id in nodes:
            nodes[share_data.node_id].append(
                {
                    "message_id": message_id,
                    "sender": data.sender,
                    "room_id": data.room_id,
                    "share": share_data.share,
                }
            )
    return {"status": "success", "message": "Shares distributed successfully"}


@app.get("/messages/{room_id}")
def get_messages(room_id: str):
    grouped_messages: Dict[str, dict] = {}
    for node_list in nodes.values():
        for item in node_list:
            if item["room_id"] != room_id:
                continue
            message = grouped_messages.setdefault(
                item["message_id"],
                {"sender": item["sender"], "shares": []},
            )
            message["shares"].append(item["share"])

    return {"messages": list(grouped_messages.values())}


@app.get("/debug/nodes")
def get_debug_nodes():
    return nodes
