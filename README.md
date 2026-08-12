# Habit Tracker (DayStamps-inspired)

iOS 앱 [DayStamps](https://apps.apple.com/) 를 레퍼런스로 만든 개인/지인용 습관 트래커. React Native(Expo) 모바일 앱을 담은 pnpm 모노레포이며, 로컬 SQLite를 항상 진실의 원천으로 두고 Google 로그인을 하면 이 앱이 소유한 고정 Supabase 프로젝트로 자동 동기화된다(멀티 디바이스, 향후 Android/Web 확장 목적). 로그인하지 않으면 데이터는 기기에만 저장된다.

> 상세 설계·진행 상황 문서는 [`docs/`](./docs) 참고:
> - [architecture.md](./docs/architecture.md) — 기술 스택, 모노레포 구조, 동기화 프로토콜
> - [features.md](./docs/features.md) — 기능 범위(구현 완료/미구현/v2)
> - [ux-design.md](./docs/ux-design.md) — 실제 구현된 화면별 UI/UX
> - [roadmap.md](./docs/roadmap.md) — **현재 진행 상황**과 다음 단계
> - [dev-guide.md](./docs/dev-guide.md) — 안드로이드 빌드, 웹 빌드+Cloudflare Pages 배포, Supabase 운영 실무 가이드
> - [code-review-2026-08-12.md](./docs/code-review-2026-08-12.md) — 코드 리뷰 결과(Critical/Major/Minor)와 조치 현황

## 현재 상태 요약

로컬 전용 핵심 루프(습관 생성/체크인/캘린더/통계)와 Supabase 자동 동기화(로그인 시 마이그레이션, 로컬 변경 즉시 push, 포그라운드 복귀 시 pull)까지 **Android 에뮬레이터에서 end-to-end 검증 완료**. iOS 재검증은 Mac 환경 확보 후 진행 예정. 남은 v1 항목(체크인 메모 UI, 리마인더 알림, 백업/복원, 온보딩 등)은 [docs/roadmap.md](./docs/roadmap.md)에 정리되어 있다.

## 구조

```
habit-tracker/
├── packages/core/     # 도메인 모델·Repository 인터페이스·동기화 계약 (순수 TS)
├── apps/mobile/        # Expo(React Native) 앱 — expo-router, Drizzle+SQLite, 반응형 로컬 Repository
└── docs/                  # 아키텍처/기능/UX/로드맵 문서 + supabase-schema.sql
```

## 시작하기

### 요구사항

- Node.js 20+, pnpm 9 (`packageManager` 필드로 고정됨)
- Android Studio(에뮬레이터) 또는 iOS 시뮬레이터(Mac) — 모바일 앱 실행용

### 설치

```bash
pnpm install
```

### 모바일 앱 실행

```bash
pnpm mobile:start          # Expo dev server
# 또는
pnpm --filter @habit-tracker/mobile android   # Android 에뮬레이터(Expo Go)
pnpm --filter @habit-tracker/mobile ios       # iOS 시뮬레이터 (Mac 필요)
```

일부 개발 환경에서는 Expo Go 클라이언트가 프로젝트 의존성과 미묘하게 안 맞아 크래시가 날 수 있다(겪었던 사례와 원인은 [docs/architecture.md](./docs/architecture.md) §5-5). 이런 경우 `npx expo run:android`로 이 프로젝트 전용 로컬 Dev Client를 빌드해 Expo Go 대신 쓴다 — 최초 빌드만 시간이 걸리고, 이후엔 Metro만 재시작하면 된다. `expo run:android --device <이름>`이 "Could not find device with name" 에러를 내는 환경도 있다(에뮬레이터 콘솔 인증 문제) — 그럴 땐 Gradle 직접 빌드로 우회한다. 안드로이드/웹 빌드+배포/Supabase 운영의 실무 절차는 [docs/dev-guide.md](./docs/dev-guide.md)에 정리했다.

동기화는 별도 설정 없이 켜져 있다 — 설정 > 동기화에서 **Google로 로그인**하면 그 시점의 로컬 데이터가 이 앱이 소유한 고정 Supabase 프로젝트로 자동 업로드되고, 이후로는 로컬 변경 시 자동 push, 앱을 다시 열 때(포그라운드 복귀) 자동 pull이 일어난다. 로그인하지 않으면 완전히 로컬 전용으로 동작한다. Supabase 프로젝트 자체를 새로 만들거나 값을 바꾸고 싶다면 [docs/architecture.md](./docs/architecture.md) §5 참고.

## 사용법

1. 오늘 화면에서 `+` 버튼으로 습관 생성(이름/아이콘/컬러/그룹/반복주기).
2. 습관 카드의 체크 원을 탭해 오늘 체크인. 헤더 날짜를 탭하면 다른 날짜로 이동해 체크할 수 있다.
3. 습관 카드를 탭하면 상세 화면(월간 스탬프 캘린더, 스트릭, Statistic 타일)으로 이동.
4. 오늘 화면 헤더의 막대그래프 아이콘 또는 하단 탭의 통계 → 요약/Weekly/Monthly/Yearly.
5. 설정 화면에서 Google로 로그인하면 다른 기기와 자동으로 데이터가 동기화된다.

## 검증/개발 스크립트

```bash
pnpm --filter @habit-tracker/mobile typecheck     # 모바일 타입 체크
```
