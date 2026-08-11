# Habit Tracker (DayStamps-inspired)

iOS 앱 [DayStamps](https://apps.apple.com/) 를 레퍼런스로 만든 개인용 습관 트래커. React Native(Expo) 모바일 앱 + 자체 REST 백엔드로 구성된 pnpm 모노레포이며, 로컬 SQLite를 항상 진실의 원천으로 두고 동기화는 REST 백엔드 또는 무료 Supabase 프로젝트 중 선택 가능한 계층으로 붙는다(멀티 디바이스, 향후 Android/Web 확장 목적).

> 상세 설계·진행 상황 문서는 [`docs/`](./docs) 참고:
> - [architecture.md](./docs/architecture.md) — 기술 스택, 모노레포 구조, 동기화 프로토콜
> - [features.md](./docs/features.md) — 기능 범위(구현 완료/미구현/v2)
> - [ux-design.md](./docs/ux-design.md) — 실제 구현된 화면별 UI/UX
> - [roadmap.md](./docs/roadmap.md) — **현재 진행 상황**과 다음 단계

## 현재 상태 요약

로컬 전용 핵심 루프(습관 생성/체크인/캘린더/통계)와 로컬 백엔드 push/pull 동기화, Supabase 동기화(로그인 왕복 포함)까지 **Android 에뮬레이터에서 end-to-end 검증 완료**. iOS 재검증은 Mac 환경 확보 후 진행 예정. 남은 v1 항목(체크인 메모 UI, 리마인더 알림, 백업/복원, 온보딩 등)은 [docs/roadmap.md](./docs/roadmap.md)에 정리되어 있다.

## 구조

```
habit-tracker/
├── packages/core/     # 클라이언트/서버 공용 도메인 모델·Repository 인터페이스·동기화 계약 (순수 TS)
├── apps/mobile/        # Expo(React Native) 앱 — expo-router, Drizzle+SQLite, 반응형 로컬 Repository
├── apps/backend/        # Fastify REST API — Drizzle+Postgres, /api/v1/sync/{push,pull}
├── docker-compose.yml    # 로컬 Postgres + backend 기동
└── docs/                  # 아키텍처/기능/UX/로드맵 문서 + supabase-schema.sql
```

## 시작하기

### 요구사항

- Node.js 20+, pnpm 9 (`packageManager` 필드로 고정됨)
- Docker (백엔드 로컬 구동용 Postgres)
- Android Studio(에뮬레이터) 또는 iOS 시뮬레이터(Mac) — 모바일 앱 실행용

### 설치

```bash
pnpm install
```

### 로컬 백엔드 실행 (선택 — 동기화 기능을 쓸 때만 필요)

```bash
docker compose up -d                              # Postgres + backend 기동
cp apps/backend/.env.example apps/backend/.env    # 최초 1회
pnpm backend:migrate                              # Drizzle 마이그레이션 적용
curl http://localhost:4000/api/v1/habits          # 200 + 빈 배열이면 정상
```

`apps/backend/.env`의 `DEVICE_AUTH_TOKEN`은 앱 설정 화면에서 입력할 토큰과 동일해야 한다.

### 모바일 앱 실행

```bash
pnpm mobile:start          # Expo dev server
# 또는
pnpm --filter @habit-tracker/mobile android   # Android 에뮬레이터(Expo Go)
pnpm --filter @habit-tracker/mobile ios       # iOS 시뮬레이터 (Mac 필요)
```

일부 개발 환경에서는 Expo Go 클라이언트가 프로젝트 의존성과 미묘하게 안 맞아 크래시가 날 수 있다(겪었던 사례와 원인은 [docs/architecture.md](./docs/architecture.md) §5-5). 이런 경우 `npx expo run:android`로 이 프로젝트 전용 로컬 Dev Client를 빌드해 Expo Go 대신 쓴다 — 최초 빌드만 시간이 걸리고, 이후엔 Metro만 재시작하면 된다.

동기화를 테스트하려면 앱의 **설정 > 동기화**에서 `REST 백엔드`를 선택하고 Sync Server URL/Device Token을 입력한다.
- Android 에뮬레이터에서 호스트 PC를 가리킬 때는 `localhost` 대신 `http://10.0.2.2:4000` 사용.
- iOS 시뮬레이터는 `http://localhost:4000` 그대로 사용 가능.

무료 Supabase 프로젝트로 동기화하려면(크로스플랫폼, 서버를 직접 띄워둘 필요 없음) `설정 > 동기화 > Supabase`에서 프로젝트 URL/anon key를 입력하고 Google로 로그인한다 — 설정 방법은 [docs/architecture.md](./docs/architecture.md) §5-4 참고.

## 사용법

1. 오늘 화면에서 `+` 버튼으로 습관 생성(이름/아이콘/컬러/그룹/반복주기).
2. 습관 카드의 체크 원을 탭해 오늘 체크인. 헤더 날짜를 탭하면 다른 날짜로 이동해 체크할 수 있다.
3. 습관 카드를 탭하면 상세 화면(월간 스탬프 캘린더, 스트릭)으로 이동.
4. 오늘 화면 헤더의 막대그래프 아이콘 또는 하단 탭의 통계 → 요약/Weekly/Monthly/Yearly.
5. 설정 화면에서 REST 백엔드 또는 Supabase 동기화를 연결하면 다른 기기와 데이터를 주고받을 수 있다(수동 동기화).

## 설정(환경변수)

| 위치 | 변수 | 설명 |
|---|---|---|
| `apps/backend/.env` | `DATABASE_URL` | Postgres 연결 문자열 |
| `apps/backend/.env` | `DEVICE_AUTH_TOKEN` | 앱과 공유하는 고정 Bearer 토큰(v1 임시 인증) |
| `apps/backend/.env` | `PORT` | 백엔드 리슨 포트(기본 4000) |

모바일 앱의 동기화 설정(REST 서버 URL/토큰, Supabase 프로젝트 URL/anon key)은 환경변수가 아니라 **앱 내 설정 화면(동기화 섹션)에 런타임으로 입력**한다 — 기기별로 다른 백엔드를 가리킬 수 있도록 한 설계.

## 검증/개발 스크립트

```bash
pnpm --filter @habit-tracker/mobile typecheck     # 모바일 타입 체크
pnpm --filter @habit-tracker/backend typecheck    # 백엔드 타입 체크
pnpm --filter @habit-tracker/mobile verify:sync   # 독립 Node 스크립트로 sync 엔진 push/pull 검증
```
