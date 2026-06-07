# Protocol Final Full

백엔드와 프론트를 하나로 합친 Next.js 앱입니다.

## Local

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## Vercel

`full` 폴더를 Vercel 프로젝트 루트로 배포하면 됩니다.

기본 API 경로는 `/api`입니다. 별도 설정은 필요 없지만, 필요하면 `.env.example`을 참고해 환경변수를 추가할 수 있습니다.

현재 통합 저장소는 서버 파일 저장 방식입니다. 로컬에서는 `full/.data/chat_archive.json`에 저장되고, Vercel에서는 `/tmp/protocol-final/chat_archive.json`에 저장됩니다. Vercel의 `/tmp`는 영구 DB가 아니므로 배포 재시작이나 서버리스 인스턴스 변경 시 데이터가 초기화될 수 있습니다.
