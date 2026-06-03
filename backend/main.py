from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 프로토타입용 인메모리 노드 시뮬레이션 (각 노드가 물리적으로 분리된 서버/테이블 역할을 함)
nodes = {
    "node1": [],
    "node2": [],
    "node3": []
}

class ShareData(BaseModel):
    node_id: str
    share: str

class MessageShares(BaseModel):
    sender: str
    room_id: str
    shares: List[ShareData]

@app.post("/messages")
def post_message(data: MessageShares):
    """
    프론트엔드에서 분할된 조각(Share)들을 받아 각각의 지정된 노드에 분산 저장합니다.
    백엔드는 메시지 원본을 절대 볼 수 없습니다.
    """
    for share_data in data.shares:
        if share_data.node_id in nodes:
            nodes[share_data.node_id].append({
                "sender": data.sender,
                "room_id": data.room_id,
                "share": share_data.share
            })
    return {"status": "success", "message": "Shares distributed successfully"}

@app.get("/messages/{room_id}")
def get_messages(room_id: str):
    """
    해당 채팅방(room_id)의 메시지 조각들을 모든 노드에서 수집하여 반환합니다.
    """
    max_len = max(len(node_list) for node_list in nodes.values())
    messages = []
    
    for i in range(max_len):
        msg_shares = []
        sender = "Unknown"
        for node_id, node_list in nodes.items():
            if i < len(node_list) and node_list[i]["room_id"] == room_id:
                msg_shares.append(node_list[i]["share"])
                sender = node_list[i]["sender"]
        
        if msg_shares:
            messages.append({
                "sender": sender,
                "shares": msg_shares
            })
            
    return {"messages": messages}

@app.get("/debug/nodes")
def get_debug_nodes():
    """
    검증용 API: 각 노드에 데이터가 어떻게 분산되어 들어갔는지 확인합니다.
    """
    return nodes
