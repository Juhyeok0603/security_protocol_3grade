"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";

interface AdminRoom {
  id: string;
  name: string;
  owner: string;
  has_password: boolean;
  invite_code: string;
  members: string[];
  created_at: string;
  destroyed_at?: string | null;
  message_count: number;
  share_count: number;
}

interface AdminSnapshot {
  stats: {
    rooms: number;
    active_rooms: number;
    members: number;
    active_members: number;
    messages: number;
    shares: number;
  };
  rooms: AdminRoom[];
  db: unknown;
}

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminPage() {
  const [apiBaseUrl] = useState(() => getApiBaseUrl());
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [showRawDb, setShowRawDb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rawDbText = useMemo(() => {
    if (!snapshot) return "";
    return JSON.stringify(snapshot.db, null, 2);
  }, [snapshot]);

  const fetchDashboard = useCallback(async () => {
    if (!apiBaseUrl) return;
    const res = await axios.get(`${apiBaseUrl}/admin/dashboard`);
    setSnapshot(res.data);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    void Promise.resolve()
      .then(async () => {
        const res = await axios.get(`${apiBaseUrl}/admin/session`);
        setAuthenticated(Boolean(res.data.authenticated));
        if (res.data.authenticated) {
          await fetchDashboard();
        }
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingSession(false));
  }, [apiBaseUrl, fetchDashboard]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!apiBaseUrl) return;
    setBusy(true);
    setError("");

    try {
      await axios.post(`${apiBaseUrl}/admin/login`, { username, password });
      setAuthenticated(true);
      setPassword("");
      await fetchDashboard();
    } catch {
      setError("관리자 아이디 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (!apiBaseUrl) return;
    await axios.post(`${apiBaseUrl}/admin/logout`);
    setAuthenticated(false);
    setSnapshot(null);
  };

  const handleDeleteRoom = async (room: AdminRoom) => {
    if (!apiBaseUrl) return;
    const confirmed = window.confirm(`'${room.name}' 채팅방과 관련 메시지/share를 DB에서 완전히 삭제할까요?`);
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      await axios.delete(`${apiBaseUrl}/admin/rooms/${room.id}`);
      await fetchDashboard();
    } catch {
      setError("채팅방 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!apiBaseUrl) return;
    const confirmed = window.confirm("전체 DB 내역을 초기화할까요? 모든 방, 멤버, 메시지, share가 삭제됩니다.");
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      await axios.delete(`${apiBaseUrl}/admin/db`);
      await fetchDashboard();
    } catch {
      setError("DB 초기화에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-5 text-white">
        <p className="text-sm text-gray-400">관리자 세션 확인 중...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-[var(--color-background)] px-5 py-8 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
          <Link href="/" className="mb-6 text-sm text-[var(--color-accent)] hover:underline">
            로비로 돌아가기
          </Link>
          <form onSubmit={handleLogin} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <p className="text-sm font-semibold text-[var(--color-accent)]">Admin Login</p>
            <h1 className="mt-2 text-3xl font-bold">관리자 로그인</h1>
            <div className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm text-gray-300">
                아이디
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11 rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-white outline-none focus:border-[var(--color-accent)]"
                  autoComplete="username"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-gray-300">
                비밀번호
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  className="h-11 rounded-lg border border-[var(--color-border)] bg-[#101014] px-3 text-white outline-none focus:border-[var(--color-accent)]"
                  autoComplete="current-password"
                />
              </label>
              {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
              <button
                disabled={busy}
                className="h-11 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "로그인 중..." : "로그인"}
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-background)] px-5 py-6 text-white lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/" className="text-sm text-[var(--color-accent)] hover:underline">
              로비로 돌아가기
            </Link>
            <h1 className="mt-3 text-3xl font-bold md:text-5xl">관리자 대시보드</h1>
            <p className="mt-3 text-sm text-gray-400">저장된 DB 내역을 확인하고 채팅방 또는 전체 저장소를 삭제합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fetchDashboard().catch(() => setError("대시보드 새로고침에 실패했습니다."))}
              className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm text-gray-200 hover:bg-[var(--color-surface-hover)]"
            >
              새로고침
            </button>
            <button
              onClick={handleLogout}
              className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm text-gray-200 hover:bg-[var(--color-surface-hover)]"
            >
              로그아웃
            </button>
          </div>
        </header>

        {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        {snapshot && (
          <>
            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Object.entries(snapshot.stats).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <p className="text-xs uppercase text-gray-500">{key.replaceAll("_", " ")}</p>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg font-bold">채팅방 관리</h2>
                <button
                  onClick={handleClearDatabase}
                  disabled={busy}
                  className="h-10 rounded-lg bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  전체 DB 초기화
                </button>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                  <thead className="border-b border-[var(--color-border)] text-xs text-gray-500">
                    <tr>
                      <th className="py-3 pr-4">방 이름</th>
                      <th className="py-3 pr-4">상태</th>
                      <th className="py-3 pr-4">방장</th>
                      <th className="py-3 pr-4">참여자</th>
                      <th className="py-3 pr-4">메시지/share</th>
                      <th className="py-3 pr-4">생성</th>
                      <th className="py-3 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.rooms.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500">
                          저장된 채팅방이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      snapshot.rooms.map((room) => (
                        <tr key={room.id} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="py-3 pr-4">
                            <p className="font-semibold">{room.name}</p>
                            <p className="mt-1 font-mono text-xs text-gray-500">{room.id}</p>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={room.destroyed_at ? "text-red-300" : "text-emerald-300"}>
                              {room.destroyed_at ? "폭파됨" : "활성"}
                            </span>
                          </td>
                          <td className="py-3 pr-4">{room.owner}</td>
                          <td className="py-3 pr-4">{room.members.length}명</td>
                          <td className="py-3 pr-4">
                            {room.message_count} / {room.share_count}
                          </td>
                          <td className="py-3 pr-4">{formatTime(room.created_at)}</td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleDeleteRoom(room)}
                              disabled={busy}
                              className="h-9 rounded-lg bg-red-500/15 px-3 text-xs font-bold text-red-200 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              완전 삭제
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg font-bold">DB 내역</h2>
                <button
                  onClick={() => setShowRawDb((value) => !value)}
                  className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm text-gray-200 hover:bg-[var(--color-surface-hover)]"
                >
                  {showRawDb ? "원본 숨기기" : "원본 JSON 보기"}
                </button>
              </div>
              {showRawDb && (
                <pre className="mt-5 max-h-[520px] overflow-auto rounded-lg border border-[var(--color-border)] bg-[#101014] p-4 text-xs leading-5 text-gray-300">
                  {rawDbText}
                </pre>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
