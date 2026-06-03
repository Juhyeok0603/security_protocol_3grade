# 🛡️ 비밀분산 기반 실시간 채팅 플랫폼 (Secret Sharing Chat Platform) - Prototype

본 프로젝트는 **샤미르 비밀분산 알고리즘(Shamir's Secret Sharing)**을 활용하여 메시지를 여러 노드에 쪼개어 분산 저장하고, 복호화 시점에만 결합하는 극도의 프라이버시 지향형 실시간 채팅 플랫폼 프로토타입입니다.

데이터베이스(DB)를 아예 사용하지 않고 모든 메시지 조각(Shares)을 백엔드의 휘발성 메모리(In-Memory)에만 보존하며, 복원 시점 외에는 누구도 원본 메시지를 복원하거나 엿볼 수 없도록 설계되었습니다.

---

## 🏗️ 아키텍처 개요 (Architecture Overview)

```mermaid
graph TD
    subgraph Client [프론트엔드 (React / Next.js)]
        A[원본 메시지 작성] --> B{Shamir's Secret Sharing}
        B -->|조각 1| C[Share 1]
        B -->|조각 2| D[Share 2]
        B -->|조각 3| E[Share 3]
    end

    subgraph Backend [FastAPI 분산 노드 시뮬레이션]
        C -->|POST /messages| F[(Node 1 - In Memory)]
        D -->|POST /messages| G[(Node 2 - In Memory)]
        E -->|POST /messages| H[(Node 3 - In Memory)]
    end

    F & G & H -->|GET /messages/room_id| I[복원 최소 기준 충족 시 결합 및 복호화]
```

### 🔒 보안 및 설계 핵심 원칙
1. **Zero-Storage (영구 저장소 없음)**: 데이터베이스가 없어 서버가 침해당하거나 탈취되더라도 기존 대화 기록이 물리적으로 존재하지 않습니다.
2. **Client-side Encryption & Secret Sharing (클라이언트 측 분산)**: 메시지 분할 및 복원(재조합)은 오직 프론트엔드 브라우저 내에서만 실행됩니다. 백엔드 서버(Relay Node)는 오직 난독화된 조각(Share)만 전달받으므로 원본 데이터를 절대 알 수 없습니다.
3. **Volatile Relay (휘발성 릴레이)**: 각 노드는 임시 메모리 역할만 수행하며, 서버가 재시작되면 모든 대화 데이터가 완전히 소멸(Zero-out)됩니다.

---

## 🛠️ 개발 환경 구성 및 실행 방법 (Quick Start Guide)

로컬 환경에서 프론트엔드와 백엔드를 연동하여 작동하는 방법입니다.

### 📋 요구 사양 (Prerequisites)
- **Node.js**: `v18.0.0` 이상 권장 (npm 포함)
- **Python**: `3.8` 이상 권장

---

### 1. 백엔드 서버 설정 (FastAPI Backend)

백엔드 폴더로 이동하여 가상환경을 생성하고 의존성 패키지를 설치한 후 실행합니다.

```bash
# 1. backend 폴더로 이동
cd backend

# 2. Python 가상환경 생성 (venv)
python3 -m venv venv

# 3. 가상환경 활성화 (macOS/Linux)
source venv/bin/activate
# Windows 환경인 경우: venv\Scripts\activate

# 4. 의존성 패키지 설치
pip install -r requirements.txt

# 5. 로컬 개발 서버 실행 (동일 네트워크/LAN 접속을 위해 host를 0.0.0.0으로 바인딩합니다)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

* 실행이 완료되면 `http://localhost:8000/docs`에서 API 명세서(Swagger UI)를 확인할 수 있습니다.

---

### 2. 프론트엔드 설정 (Next.js Frontend)

프론트엔드 폴더로 이동하여 npm 패키지를 설치한 후 개발 서버를 실행합니다.

```bash
# 1. frontend 폴더로 이동
cd frontend

# 2. 의존성 패키지 설치
npm install

# 3. 개발 서버 실행
npm run dev
```

* 실행이 완료되면 `http://localhost:3000`으로 접속하여 채팅 페이지를 이용할 수 있습니다.

---

## 📊 환경 및 아키텍처 비교 요약 (Comparison)

| 항목 | 개발/프로토타입 환경 (현재) | 상용/운영 환경 (배포 단계 고려사항) |
| :--- | :--- | :--- |
| **백엔드 노드 분리** | 하나의 FastAPI 애플리케이션 내의 가상 메모리 객체(`node1`, `node2`, `node3`)로 시뮬레이션 | 3개의 물리적으로 완전히 격리된 별도 서버 및 클라우드 인스턴스로 분산 배포 |
| **데이터 보존 방식** | 프로세스 메모리 저장 (서버 재시작 시 휘발) | 각 노드 전용 인메모리 DB(예: Redis) 또는 별도 격리된 DB 인스턴스 |
| **서버 통신 프로토콜** | HTTP REST API Polling (임시 동기화) | WebSocket 또는 SSE(Server-Sent Events) 기반 실시간 스트리밍 |
| **배포 플랫폼** | 로컬호스트 실행 및 공유기 내 LAN 통신 | Frontend: Vercel / Backend: AWS, GCP, 또는 Render 등 독립 호스팅 |

---

## ⚠️ 주의사항 및 제한사항 (Warnings)

> [!WARNING]
> * **임시 휘발성 데이터**: 본 프로토타입은 데이터베이스(DB)가 없는 인메모리 방식입니다. **백엔드 서버 프로세스를 종료하거나 재시작하면 모든 대화 내역이 유실**됩니다.
> * **메시지 복원 임계치(Threshold)**: 본 프로토타입은 3개의 노드 중 최소 2개 이상의 조각이 수집되어야 원래의 대화 내용으로 복원 및 화면 표시가 가능하게 설계되었습니다.
> * **디버그 패널**: 화면 우측의 디버그 패널을 통해 각 노드(`node1`, `node2`, `node3`)에 암호화된 메시지 조각이 분산되어 수집되는 모습을 실시간으로 시각화하여 모니터링할 수 있습니다.
