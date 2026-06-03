"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { splitMessage, combineMessage } from "../utils/secret";

const ROOM_ID = "proto_room_1";

interface Message {
  sender: string;
  text: string;
  shares: string[];
}

interface DebugNode {
  sender: string;
  room_id: string;
  share: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [debugData, setDebugData] = useState<Record<string, DebugNode[]>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isJoined, setIsJoined] = useState(false);
  const [nickname, setNickname] = useState("");
  const [backendUrl, setBackendUrl] = useState("http://localhost:8000");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBackendUrl(`http://${window.location.hostname}:8000`);
    }
  }, []);

  useEffect(() => {
    if (!isJoined) return;
    fetchMessages();
    fetchDebugData();
    const interval = setInterval(() => {
      fetchMessages();
      fetchDebugData();
    }, 3000);
    return () => clearInterval(interval);
  }, [isJoined, backendUrl]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const res = await axios.get(`${backendUrl}/messages/${ROOM_ID}`);
      const fetchedSharesList = res.data.messages;

      const reconstructedMessages: Message[] = fetchedSharesList.map((msg: any) => {
        const decodedText = combineMessage(msg.shares);
        return {
          sender: msg.sender,
          text: decodedText,
          shares: msg.shares
        };
      });

      setMessages(reconstructedMessages);
    } catch (error) {
      console.error("메시지 로딩 실패:", error);
    }
  };

  const fetchDebugData = async () => {
    try {
      const res = await axios.get(`${backendUrl}/debug/nodes`);
      setDebugData(res.data);
    } catch (error) {
      // Backend not ready
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (nickname.trim()) {
      setIsJoined(true);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const textToSplit = inputText;
    setInputText("");

    try {
      const shares = splitMessage(textToSplit, 3, 2);
      const payload = {
        sender: nickname,
        room_id: ROOM_ID,
        shares: [
          { node_id: "node1", share: shares[0] },
          { node_id: "node2", share: shares[1] },
          { node_id: "node3", share: shares[2] }
        ]
      };

      await axios.post(`${backendUrl}/messages`, payload);
      fetchMessages();
      fetchDebugData();
    } catch (error) {
      console.error("메시지 전송 실패:", error);
      alert(`메시지 전송에 실패했습니다. 백엔드 주소(${backendUrl})를 확인하세요.`);
    }
  };

  // 입장 전 화면 (Join Screen)
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[var(--color-primary)] rounded-full blur-[120px] opacity-20"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[var(--color-accent)] rounded-full blur-[120px] opacity-20"></div>

        <div className="glass p-10 rounded-3xl w-full max-w-md z-10 shadow-2xl flex flex-col items-center">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] mb-2">
              Secret Chat
            </h1>
            <p className="text-[var(--color-border)] text-sm">비밀분산 기반 프라이빗 채팅 플랫폼</p>
          </div>
          
          <form onSubmit={handleJoin} className="w-full flex flex-col gap-4">
            <input 
              type="text" 
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="사용할 닉네임을 입력하세요"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] text-white px-5 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all placeholder-gray-500"
              required
            />
            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] hover:opacity-90 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-[var(--color-primary)]/20"
            >
              입장하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 채팅 화면 (Chat Screen)
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col lg:flex-row p-4 lg:p-8 gap-6 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[var(--color-primary)] rounded-full blur-[150px] opacity-10 pointer-events-none"></div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-[90vh] glass rounded-3xl overflow-hidden shadow-2xl z-10">
        {/* Chat Header */}
        <div className="bg-[var(--color-surface)]/80 backdrop-blur-md p-5 border-b border-[var(--color-border)] flex justify-between items-center z-20">
          <div>
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
              Room: {ROOM_ID}
            </h2>
            <p className="text-xs text-gray-500 mt-1">Shamir's Secret Sharing 적용됨 (3 분할 / 2 복원)</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-sm font-medium text-gray-300">{nickname}</span>
          </div>
        </div>
        
        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 bg-gradient-to-b from-transparent to-[var(--color-surface)]/20">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
              <p>메시지를 입력하여 대화를 시작하세요.</p>
              <p className="text-xs mt-2 opacity-50">메시지는 분할되어 서버에 저장됩니다.</p>
            </div>
          )}
          
          {messages.map((msg, idx) => {
            const isMine = msg.sender === nickname;
            return (
              <div 
                key={idx} 
                className={`flex flex-col max-w-[75%] ${isMine ? 'self-end items-end' : 'self-start items-start'} animate-[fadeIn_0.3s_ease-out]`}
              >
                {!isMine && <span className="text-xs text-gray-400 ml-1 mb-1">{msg.sender}</span>}
                <div className={`p-4 rounded-2xl relative group ${
                  isMine 
                    ? 'bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white rounded-br-sm shadow-md' 
                    : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-gray-100 rounded-bl-sm'
                }`}>
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  
                  {/* 조각 정보 (Hover 시 표시 또는 작게 표시) */}
                  <div className={`mt-2 pt-2 border-t text-[10px] flex items-center gap-1 opacity-70 ${isMine ? 'border-white/20' : 'border-gray-600'}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    <span>조각 {msg.shares.length}개로 복원됨</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Area */}
        <div className="p-5 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
          <form onSubmit={handleSendMessage} className="flex gap-3 relative">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="메시지를 입력하세요 (전송 시 3개의 조각으로 분할됩니다)"
              className="flex-1 bg-[#09090b] border border-[var(--color-border)] rounded-full px-6 py-4 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors pr-32"
            />
            <button 
              type="submit" 
              className="absolute right-2 top-2 bottom-2 px-6 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-full font-bold transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <span>전송</span>
              <svg className="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
            </button>
          </form>
        </div>
      </div>

      {/* Debug Panel (Sidebar) */}
      <div className="w-full lg:w-[400px] h-auto lg:h-[90vh] glass rounded-3xl p-6 flex flex-col z-10 overflow-hidden border border-red-900/30">
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[var(--color-border)]">
          <div className="p-2 bg-red-500/20 rounded-lg text-red-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
          </div>
          <div>
            <h3 className="font-bold text-gray-200">서버 저장소 모니터링</h3>
            <p className="text-[10px] text-gray-500">실제 분산 DB(노드)에 적재되는 원시 데이터</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">
          {Object.entries(debugData).length === 0 ? (
            <div className="text-center text-sm text-gray-500 mt-10">데이터가 없습니다.</div>
          ) : (
            Object.entries(debugData).map(([nodeId, items]) => (
              <div key={nodeId} className="bg-[var(--color-surface)]/50 rounded-xl p-4 border border-[var(--color-border)]">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-[var(--color-accent)]">{nodeId.toUpperCase()}</span>
                  <span className="text-[10px] bg-[var(--color-background)] px-2 py-1 rounded-full text-gray-400">총 {items.length}개 조각</span>
                </div>
                
                <div className="flex flex-col gap-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="bg-[#09090b] rounded-md p-2 text-xs font-mono break-all text-gray-400 border border-gray-800">
                      <span className="text-[var(--color-primary)] font-bold mb-1 block">[{item.sender}]</span>
                      <span className="text-[10px] text-gray-600">Share:</span> {item.share.substring(0, 32)}...
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
    </div>
  );
}
