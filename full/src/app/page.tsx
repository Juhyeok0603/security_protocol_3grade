"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { combineMessage, splitMessage } from "../utils/secret";

interface Room {
  id: string;
  name: string;
  owner: string;
  has_password: boolean;
  invite_code: string;
  members: string[];
  created_at: string;
  destroyed_at?: string | null;
}

interface Message {
  message_id?: string;
  sender: string;
  text: string;
  shares: string[];
  sequence?: number;
  created_at?: string;
}

interface DebugNode {
  message_id?: string;
  sender: string;
  room_id: string;
  share: string;
}

interface ArchiveWindow {
  room_id: string;
  room_name: string;
  destroyed_at?: string | null;
  anchor_sequence: number;
  messages: Message[];
}

function toApiTime(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function formatTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";
}

export default function Home() {
  const [backendUrl, setBackendUrl] = useState("");
  const [isClientReady, setIsClientReady] = useState(false);
  const [nickname, setNickname] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [debugData, setDebugData] = useState<Record<string, DebugNode[]>>({});
  const [inputText, setInputText] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joinSecrets, setJoinSecrets] = useState<Record<string, string>>({});
  const [archiveRoomName, setArchiveRoomName] = useState("");
  const [archiveKeyword, setArchiveKeyword] = useState("");
  const [archiveStartAt, setArchiveStartAt] = useState("");
  const [archiveEndAt, setArchiveEndAt] = useState("");
  const [archiveResults, setArchiveResults] = useState<ArchiveWindow[]>([]);
  const [archiveSearched, setArchiveSearched] = useState(false);
  const [error, setError] = useState("");
  const [backendOnline, setBackendOnline] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const nicknameTrimmed = nickname.trim();
  const selectedRoomId = selectedRoom?.id;
  const isOwner = selectedRoom?.owner === nicknameTrimmed;
  const apiBaseUrl = backendUrl;

  useEffect(() => {
    void Promise.resolve().then(() => {
      setBackendUrl(getApiBaseUrl());
      setIsClientReady(true);
    });
  }, []);

  const selectedDebugData = useMemo(() => {
    if (!selectedRoom) return debugData;
    return Object.fromEntries(
      Object.entries(debugData).map(([nodeId, items]) => [
        nodeId,
        items.filter((item) => item.room_id === selectedRoom.id),
      ]),
    );
  }, [debugData, selectedRoom]);

  const reconstructMessages = (items: Array<Omit<Message, "text">>) =>
    items.map((msg) => ({
      ...msg,
      text: combineMessage(msg.shares),
    }));

  const fetchRooms = useCallback(async () => {
    if (!apiBaseUrl) return;
    try {
      const res = await axios.get(`${apiBaseUrl}/rooms`);
      const nextRooms: Room[] = res.data.rooms;
      setRooms(nextRooms);
      setBackendOnline(true);

      if (selectedRoomId) {
        const updatedRoom = nextRooms.find((room) => room.id === selectedRoomId);
        if (!updatedRoom || !updatedRoom.members.includes(nicknameTrimmed)) {
          setSelectedRoom(null);
          setMessages([]);
          return;
        }
        setSelectedRoom(updatedRoom);
      }
    } catch {
      setBackendOnline(false);
      setError("통합 API에 연결할 수 없습니다. Next.js 서버 상태를 확인하세요.");
    }
  }, [apiBaseUrl, nicknameTrimmed, selectedRoomId]);

  const fetchMessages = useCallback(async (roomId: string) => {
    if (!apiBaseUrl) return;
    try {
      const res = await axios.get(`${apiBaseUrl}/messages/${roomId}`);
      setMessages(reconstructMessages(res.data.messages));
    } catch {
      setMessages([]);
    }
  }, [apiBaseUrl]);

  const fetchDebugData = useCallback(async () => {
    if (!apiBaseUrl) return;
    try {
      const res = await axios.get(`${apiBaseUrl}/debug/nodes`);
      setDebugData(res.data);
    } catch {
      setDebugData({});
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!isClientReady || !apiBaseUrl) return;
    void Promise.resolve().then(() => {
      fetchRooms();
      fetchDebugData();
    });
    const interval = setInterval(() => {
      void fetchRooms();
      void fetchDebugData();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchRooms, fetchDebugData, isClientReady, apiBaseUrl]);

  useEffect(() => {
    if (!selectedRoomId) return;
    void Promise.resolve().then(() => fetchMessages(selectedRoomId));
    const interval = setInterval(() => void fetchMessages(selectedRoomId), 2500);
    return () => clearInterval(interval);
  }, [fetchMessages, selectedRoomId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const requireNickname = () => {
    if (!nicknameTrimmed) {
      setError("닉네임을 먼저 입력하세요.");
      return false;
    }
    return true;
  };

  const requireBackend = () => {
    if (!apiBaseUrl) {
      setError("백엔드 주소를 준비 중입니다. 잠시 후 다시 시도하세요.");
      return false;
    }
    return true;
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireBackend()) return;
    if (!requireNickname() || !roomName.trim()) return;

    try {
      const res = await axios.post(`${apiBaseUrl}/rooms`, {
        name: roomName.trim(),
        owner: nicknameTrimmed,
        password: roomPassword.trim() || null,
      });
      setRoomName("");
      setRoomPassword("");
      setError("");
      setSelectedRoom(res.data.room);
      await fetchRooms();
    } catch {
      setError("방 생성에 실패했습니다.");
    }
  };

  const handleJoinRoom = async (room: Room) => {
    if (!requireBackend()) return;
    if (!requireNickname()) return;

    try {
      const res = await axios.post(`${apiBaseUrl}/rooms/${room.id}/join`, {
        nickname: nicknameTrimmed,
        password: joinSecrets[room.id] || "",
        invite_code: joinSecrets[room.id] || "",
      });
      setError("");
      setSelectedRoom(res.data.room);
      await fetchMessages(room.id);
      await fetchRooms();
    } catch {
      setError("입장에 실패했습니다. 비밀번호 또는 초대 코드가 맞는지 확인하세요.");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireBackend()) return;
    if (!selectedRoom || !inputText.trim()) return;

    const textToSplit = inputText;
    setInputText("");

    try {
      const shares = splitMessage(textToSplit, 3, 2);
      await axios.post(`${apiBaseUrl}/messages`, {
        sender: nicknameTrimmed,
        room_id: selectedRoom.id,
        shares: [
          { node_id: "node1", share: shares[0] },
          { node_id: "node2", share: shares[1] },
          { node_id: "node3", share: shares[2] },
        ],
      });
      await fetchMessages(selectedRoom.id);
      await fetchDebugData();
    } catch {
      setError("메시지 전송에 실패했습니다.");
    }
  };

  const handleKick = async (target: string) => {
    if (!requireBackend()) return;
    if (!selectedRoom || !isOwner) return;

    try {
      const res = await axios.post(`${apiBaseUrl}/rooms/${selectedRoom.id}/kick`, {
        owner: nicknameTrimmed,
        target,
      });
      setSelectedRoom(res.data.room);
      await fetchRooms();
    } catch {
      setError("강퇴에 실패했습니다.");
    }
  };

  const handleDeleteRoom = async () => {
    if (!requireBackend()) return;
    if (!selectedRoom || !isOwner) return;

    try {
      await axios.delete(`${apiBaseUrl}/rooms/${selectedRoom.id}`, {
        data: { owner: nicknameTrimmed },
      });
      setSelectedRoom(null);
      setMessages([]);
      await fetchRooms();
      await fetchDebugData();
    } catch {
      setError("방 폭파에 실패했습니다.");
    }
  };

  const handleArchiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireBackend()) return;
    if (!requireNickname() || !archiveRoomName.trim()) return;
    const keyword = archiveKeyword.trim().toLowerCase();
    if (!keyword) {
      setError("찾을 메시지 키워드를 입력하세요.");
      return;
    }

    try {
      const res = await axios.post(`${apiBaseUrl}/archive/search`, {
        room_name: archiveRoomName.trim(),
        nickname: nicknameTrimmed,
        start_at: toApiTime(archiveStartAt),
        end_at: toApiTime(archiveEndAt),
        context_size: 5,
      });
      const results: ArchiveWindow[] = res.data.results
        .map((window: ArchiveWindow) => ({
          ...window,
          messages: reconstructMessages(window.messages),
        }))
        .filter((window: ArchiveWindow) => {
          const anchor = window.messages.find(
            (msg) => msg.sequence === window.anchor_sequence && msg.sender === nicknameTrimmed,
          );
          return anchor?.text.toLowerCase().includes(keyword);
        });
      setArchiveResults(results);
      setArchiveSearched(true);
      setError("");
    } catch {
      setError("아카이브 검색에 실패했습니다.");
      setArchiveResults([]);
      setArchiveSearched(true);
    }
  };

  const handleRestoreRoom = async (roomId: string) => {
    if (!requireBackend()) return;
    if (!requireNickname()) return;

    try {
      const res = await axios.post(`${apiBaseUrl}/rooms/${roomId}/restore`, {
        nickname: nicknameTrimmed,
      });
      setSelectedRoom(res.data.room);
      setArchiveResults([]);
      setArchiveSearched(false);
      setError("");
      await fetchRooms();
      await fetchMessages(roomId);
      await fetchDebugData();
    } catch {
      setError("채팅방 부활에 실패했습니다. 이전에 참여했던 닉네임인지 확인하세요.");
    }
  };


  if (!selectedRoom) {
    return (
      <main className="min-h-screen bg-[var(--color-background)] text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
          <header className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--color-accent)]">Secret Sharing Chat</p>
              <h1 className="mt-2 text-3xl font-bold tracking-normal md:text-5xl">비밀분산 채팅방</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
                메시지는 원문이 아닌 3개의 share로 나뉘어 DB에 저장됩니다. 방을 폭파해도 검색용
                메타데이터와 share는 아카이브에 남아, 본인 메시지 주변 대화만 복원할 수 있습니다.
              </p>
            </div>
            <label className="flex w-full max-w-sm flex-col gap-2 text-sm text-gray-300">
              닉네임
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="사용자 이름"
                className="h-12 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-white outline-none transition focus:border-[var(--color-accent)]"
              />
            </label>
          </header>

          <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
            <div className="text-gray-300">
              통합 API: <span className="font-mono text-[var(--color-accent)]">{apiBaseUrl || "연결 준비 중"}</span>
            </div>
            <div className={backendOnline ? "text-emerald-300" : "text-red-300"}>
              {backendOnline ? "연결됨" : "연결 안 됨"}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
          )}

          <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <form onSubmit={handleCreateRoom} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <h2 className="text-lg font-bold">방 만들기</h2>
              <div className="mt-5 flex flex-col gap-4">
                <label className="flex flex-col gap-2 text-sm text-gray-300">
                  방 이름
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="예: 보안프로토콜 팀 채팅"
                    className="h-11 rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-white outline-none focus:border-[var(--color-accent)]"
                    maxLength={40}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-gray-300">
                  비밀번호
                  <input
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    placeholder="선택 사항"
                    type="password"
                    className="h-11 rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-white outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
                <button className="h-11 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--color-primary-hover)]">
                  방 생성
                </button>
              </div>
            </form>

            <div className="min-h-[420px]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">열린 방</h2>
                <span className="text-sm text-gray-500">{rooms.length}개</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rooms.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-gray-500 md:col-span-2 xl:col-span-3">
                    아직 생성된 방이 없습니다.
                  </div>
                ) : (
                  rooms.map((room) => (
                    <article key={room.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="break-words text-base font-bold">{room.name}</h3>
                          <p className="mt-1 text-xs text-gray-500">방장 {room.owner}</p>
                        </div>
                        <span className="shrink-0 rounded-md bg-[#101014] px-2 py-1 text-xs text-gray-300">
                          {room.has_password ? "잠금" : "공개"}
                        </span>
                      </div>
                      <p className="mt-4 text-xs text-gray-400">참여자 {room.members.length}명</p>
                      {room.has_password && (
                        <input
                          value={joinSecrets[room.id] || ""}
                          onChange={(e) => setJoinSecrets((prev) => ({ ...prev, [room.id]: e.target.value }))}
                          placeholder="비밀번호 또는 초대 코드"
                          className="mt-3 h-10 w-full rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-sm text-white outline-none focus:border-[var(--color-accent)]"
                        />
                      )}
                      <button
                        onClick={() => handleJoinRoom(room)}
                        className="mt-3 h-10 w-full rounded-lg bg-[var(--color-accent)] px-3 text-sm font-bold text-[#041014] transition hover:brightness-110"
                      >
                        입장
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold">폭파된 방 아카이브 검색</h2>
              <p className="text-sm text-gray-400">
                방 이름, 닉네임, 시간대로 후보를 찾은 뒤 브라우저에서 복원하고, 내가 보낸 메시지의 키워드가 맞는 결과만 보여줍니다.
              </p>
            </div>
            <form onSubmit={handleArchiveSearch} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <input
                value={archiveRoomName}
                onChange={(e) => setArchiveRoomName(e.target.value)}
                placeholder="방 이름"
                className="h-11 rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-white outline-none focus:border-[var(--color-accent)]"
              />
              <input
                value={archiveKeyword}
                onChange={(e) => setArchiveKeyword(e.target.value)}
                placeholder="내 메시지 키워드"
                className="h-11 rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-white outline-none focus:border-[var(--color-accent)]"
              />
              <input
                value={archiveStartAt}
                onChange={(e) => setArchiveStartAt(e.target.value)}
                type="datetime-local"
                className="h-11 rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-white outline-none focus:border-[var(--color-accent)]"
              />
              <input
                value={archiveEndAt}
                onChange={(e) => setArchiveEndAt(e.target.value)}
                type="datetime-local"
                className="h-11 rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-white outline-none focus:border-[var(--color-accent)]"
              />
              <button className="h-11 rounded-lg bg-[var(--color-primary)] px-5 text-sm font-bold text-white hover:bg-[var(--color-primary-hover)]">
                검색
              </button>
            </form>

            {archiveSearched && (
              <div className="mt-5 flex flex-col gap-4">
                {archiveResults.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-gray-500">
                    조건에 맞는 대화 기록이 없습니다.
                  </div>
                ) : (
                  archiveResults.map((window) => (
                    <article key={`${window.room_id}-${window.anchor_sequence}`} className="rounded-lg border border-[var(--color-border)] bg-[#101014] p-4">
                      <div className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="font-bold">{window.room_name}</h3>
                          <span className="text-xs text-gray-500">
                            {window.destroyed_at ? `폭파됨 ${formatTime(window.destroyed_at)}` : "활성 방"}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRestoreRoom(window.room_id)}
                          className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-sm text-gray-200 hover:bg-[var(--color-surface-hover)]"
                        >
                          채팅방 부활
                        </button>
                      </div>
                      <div className="mt-4 flex flex-col gap-2">
                        {window.messages.map((msg) => (
                          <div
                            key={msg.message_id}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              msg.sequence === window.anchor_sequence
                                ? "border-[var(--color-accent)] bg-cyan-500/10"
                                : "border-gray-800 bg-[var(--color-background)]"
                            }`}
                          >
                            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-500">
                              <span>
                                #{msg.sequence} {msg.sender}
                              </span>
                              <span>{formatTime(msg.created_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap break-words leading-6 text-gray-100">{msg.text}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-background)] p-4 text-white lg:p-6">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1fr_360px]">
        <section className="flex h-[calc(100vh-3rem)] min-h-[620px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <header className="flex flex-col gap-4 border-b border-[var(--color-border)] bg-[#101014] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <button onClick={() => setSelectedRoom(null)} className="mb-2 text-sm text-[var(--color-accent)] hover:underline">
                로비로 돌아가기
              </button>
              <h1 className="text-2xl font-bold">{selectedRoom.name}</h1>
              <p className="mt-1 text-xs text-gray-500">
                방장 {selectedRoom.owner} · 참여자 {selectedRoom.members.length}명 · 3분할 / 2복원
              </p>
            </div>
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigator.clipboard?.writeText(selectedRoom.invite_code)}
                  className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm text-gray-200 hover:bg-[var(--color-surface-hover)]"
                >
                  초대 코드 복사
                </button>
                <button
                  onClick={handleDeleteRoom}
                  className="h-10 rounded-lg bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-500"
                >
                  방 폭파
                </button>
              </div>
            )}
          </header>

          {error && <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</div>}

          <div className="flex-1 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
                아직 메시지가 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((msg) => {
                  const mine = msg.sender === nicknameTrimmed;
                  return (
                    <div key={msg.message_id} className={`flex max-w-[80%] flex-col ${mine ? "self-end items-end" : "self-start items-start"}`}>
                      {!mine && <span className="mb-1 text-xs text-gray-400">{msg.sender}</span>}
                      <div className={`rounded-lg px-4 py-3 ${mine ? "bg-[var(--color-primary)]" : "border border-[var(--color-border)] bg-[#101014]"}`}>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{msg.text}</p>
                        <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-white/60">
                          share {msg.shares.length}개로 복원됨 · {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="border-t border-[var(--color-border)] bg-[#101014] p-4">
            <div className="flex gap-3">
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="메시지를 입력하세요"
                className="h-12 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 text-white outline-none focus:border-[var(--color-accent)]"
              />
              <button className="h-12 rounded-lg bg-[var(--color-primary)] px-5 text-sm font-bold text-white hover:bg-[var(--color-primary-hover)]">
                전송
              </button>
            </div>
          </form>
        </section>

        <aside className="flex max-h-[calc(100vh-3rem)] flex-col gap-5 overflow-hidden">
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="text-base font-bold">방 관리</h2>
            <div className="mt-4 flex flex-col gap-2">
              {selectedRoom.members.map((member) => (
                <div key={member} className="flex items-center justify-between rounded-lg bg-[#101014] px-3 py-2">
                  <span className="text-sm text-gray-200">
                    {member}
                    {member === selectedRoom.owner && <span className="ml-2 text-xs text-[var(--color-accent)]">방장</span>}
                  </span>
                  {isOwner && member !== selectedRoom.owner && (
                    <button onClick={() => handleKick(member)} className="rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-200 hover:bg-red-500/25">
                      강퇴
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isOwner && (
              <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[#101014] p-3">
                <p className="text-xs text-gray-500">초대 코드</p>
                <p className="mt-1 break-all font-mono text-sm text-[var(--color-accent)]">{selectedRoom.invite_code}</p>
              </div>
            )}
          </section>

          <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="text-base font-bold">분산 노드</h2>
            <div className="mt-4 flex h-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto pr-1">
              {Object.entries(selectedDebugData).map(([nodeId, items]) => (
                <div key={nodeId} className="rounded-lg border border-[var(--color-border)] bg-[#101014] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--color-accent)]">{nodeId.toUpperCase()}</span>
                    <span className="text-xs text-gray-500">{items.length}개 share</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-600">저장된 share 없음</p>
                    ) : (
                      items.map((item, idx) => (
                        <div key={`${item.message_id || item.share}-${idx}`} className="rounded-md border border-gray-800 bg-[var(--color-background)] p-2 text-xs">
                          <span className="block text-[var(--color-primary)]">[{item.sender}]</span>
                          <span className="break-all font-mono text-gray-500">{item.share.slice(0, 42)}...</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

