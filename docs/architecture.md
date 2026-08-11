# 아키텍처 설계

> DayStamp 스타일 개인/지인용 습관 트래커 앱 — React Native(Expo), 로컬 우선 + Supabase 자동 동기화 구조

## 배경

아이폰 앱 **DayStamp - Habit Tracker**(매일 습관을 체크인하면 캘린더에 "스탬프"가 쌓이는 컨셉)를 레퍼런스로 한 개인용 습관 트래커를 만든다.

확정된 방향:
- **기술 스택**: React Native (Expo managed + Dev Client). 당초 iCloud(CloudKit) 동기화를 검토했으나, RN에서 CloudKit 구조화 동기화를 붙이기 어렵고 무엇보다 iCloud는 Apple 생태계 전용이라 향후 Android/Web 확장 목표와 근본적으로 상충하여 기각.
- **v1 범위**: 로컬 전용 저장(기기 내 SQLite), 계정/서버 없음. 단, 처음부터 "동기화 어댑터를 나중에 갈아끼우기만 하면 되는" 구조로 설계.
- **범위 추가(이후 걷어냄)**: 한때 로컬에서 실제로 구동 가능한 자체 REST 백엔드(Fastify+Postgres)를 만들어 push/pull을 검증했으나, 개인/지인용 배포 앱에 자체 서버 운영은 과한 구성이라 판단해 2026-08-11에 완전히 제거했다 — 상세는 §4, §5-4 참고.
- **최종 목표**: iOS를 시작으로 Android/Web까지, 이 앱이 소유한 고정 Supabase 프로젝트로 멀티 디바이스 동기화(Google 로그인 게이팅)까지 확장 가능한 구조.

---

## 1. 최종 기술 스택

| 영역 | 결정 | 대안(기각 사유) |
|---|---|---|
| RN 실행 방식 | **Expo managed + expo-dev-client + EAS Build** | Bare RN CLI — 빌드/서명/OTA 파이프라인을 직접 관리해야 해 개인 프로젝트엔 과함 |
| 라우팅 | **expo-router** (파일 기반, 웹 라우팅도 겸함) | React Navigation 수동 설정 |
| 로컬 DB | **expo-sqlite + Drizzle ORM** | WatermelonDB(데코레이터/네이티브 빌드 리스크, sync 내장이지만 자체 프로토콜 설계 목표와 안 맞음), Realm(Device Sync 사업 방향 불확실), RxDB(라이선스 경계 모호) |
| 상태관리 | **Zustand** (도메인 데이터는 DB 쿼리 훅으로 별도 관리, DB가 항상 source of truth) | Redux Toolkit(보일러플레이트 과함), Jotai |
| 알림 | **expo-notifications** | notifee (필요시 v1.5에 부분 도입 고려) |
| 동기화 백엔드 | **Supabase**(Postgres + Auth + RLS, 무료 티어, 이 앱이 소유한 고정 프로젝트) | 자체 Fastify+Postgres 백엔드 — 한때 실제로 만들어 검증까지 했으나, 서버 운영 부담이 개인/지인용 배포에 안 맞아 2026-08-11 제거(§4) |
| 인증 | **Google OAuth**(Supabase Auth), 로그인 안 하면 로컬 전용 | 고정 Bearer 토큰 — 제거된 REST 백엔드와 함께 폐기 |
| ID 전략 | **클라이언트 생성 UUIDv7** (PK, 로컬/서버 공유) | 서버 auto-increment — 오프라인 생성 시 FK 무결성 깨짐 |
| 모노레포 | **pnpm workspaces** (`packages/core` 공유) | Nx/Turborepo(패키지 5개 미만인 지금은 과설계) |

**핵심 원칙**: 로컬 SQLite DB가 항상 진실의 원천(source of truth). UI/도메인 코드는 절대 서버를 직접 보지 않고 항상 로컬 Repository만 본다. Sync는 로컬 DB를 채워주는 별도 계층(SyncGateway)으로 분리한다. 이 원칙 덕분에 v1(서버 없음)→v2(서버 있음) 전환 시 UI/도메인 계층은 한 줄도 바뀌지 않는다.

---

## 2. 모노레포 구조

```
habit-tracker/
├── pnpm-workspace.yaml
├── packages/
│   └── core/                       # 순수 TS 도메인 (RN 어디에도 의존 안 함)
│       └── src/
│           ├── models/             # Habit, CheckIn, Category, Reminder 타입 + zod 스키마
│           ├── repositories/       # Repository 인터페이스(계약만, 구현 없음)
│           ├── usecases/           # calculateStreak, getPeriodCounts — 순수 함수
│           └── sync/                # SyncChangeSet, SyncGateway 인터페이스
└── apps/
    └── mobile/                     # Expo RN 앱 — 유일한 앱, 자체 백엔드 없음
        ├── app/                    # expo-router 화면: (tabs)/index,calendar,stats,settings, habit/[id],new
        └── src/
            ├── ui/                 # 프레젠테이션 컴포넌트
            ├── features/           # 화면별 훅/로직 (use-today, reports/group-by-category 등)
            ├── constants/          # theme.ts, supabase.ts(고정 프로젝트 URL/anon key)
            ├── data/
            │   ├── local/          # drizzle schema.ts, migrations/, sqlite client
            │   ├── local/*-repository.ts  # LocalHabitRepository 등 구현체
            │   ├── supabase/       # client.ts, auth.ts (Google 로그인)
            │   └── sync/           # SupabaseSyncGateway, SyncEngine
            ├── state/              # zustand store (외관/lastSyncedAt만 — 동기화 설정은 더 이상 없음)
            ├── notifications/      # expo-notifications 스케줄링
            └── composition/        # DI 조립부 — container.ts
```

`domain`(=`packages/core`)은 React Native/DB 라이브러리를 import하지 않는 순수 TypeScript로 유지 — ESLint `no-restricted-imports` 규칙으로 강제. 이 규칙 하나로 웹(Next.js) 재사용성과 유닛테스트 용이성이 함께 확보된다.

---

## 3. 동기화 이식성 설계 (핵심)

### 3-1. 엔티티 공통 필드 (Habit/CheckIn/Category/Reminder 모두 적용)

| 필드 | 타입 | 이유 |
|---|---|---|
| `id` | UUID v7 (클라이언트 생성) | 오프라인 생성 보장, 서버와 PK 공유, 인덱스 지역성 |
| `createdAt` / `updatedAt` | ISO8601 | pull 증분 동기화 커서, LWW 판정 기준 |
| `version` | integer | 낙관적 동시성(재시도로 인한 순서 뒤바뀜 감지) |
| `deletedAt` | nullable timestamp | soft delete — 물리 삭제 시 다른 기기에 삭제 사실을 전파할 수 없음 |
| `syncStatus` (로컬 전용, 서버 미전송) | `'synced'\|'pending'\|'conflict'` | dirty-tracking, push 대상 필터링 |

이 필드들을 v1부터 스키마에 넣어두면, v2에서 컬럼 추가/백필 마이그레이션 없이 **순수 추가(additive)** 작업만으로 동기화를 붙일 수 있다.

### 3-2. 도메인 모델 (스키마 수준)

```typescript
interface Habit {
  id: string; name: string; icon: string; color: string;
  categoryId: string | null;
  frequencyType: "daily" | "weekdays" | "timesPerWeek" | "timesPerMonth";
  frequencyConfig: { weekdays?: number[]; timesPerWeek?: number; timesPerMonth?: number };
  isArchived: boolean; sortOrder: number;
  createdAt: string; updatedAt: string; version: number; deletedAt: string | null;
}

interface CheckIn {
  id: string; habitId: string;
  date: string;              // 'YYYY-MM-DD' — completedAt(시각)과 분리해 타임존/DST 버그 방지
  note: string | null; photoUri: string | null; value: number | null; // 정량 습관용
  createdAt: string; updatedAt: string; version: number; deletedAt: string | null;
}
// DB 제약: UNIQUE(habitId, date) WHERE deletedAt IS NULL — 습관당 하루 1스탬프

interface Category {
  id: string; name: string; color: string; sortOrder: number;
  createdAt: string; updatedAt: string; version: number; deletedAt: string | null;
}

interface Reminder {
  id: string; habitId: string; timeOfDay: string; // 'HH:mm'
  daysOfWeek: number[]; isEnabled: boolean;
  localNotificationId: string | null; // 기기별 값, 동기화 대상 아님
}
```

- **Journal(메모 모아보기)**은 별도 테이블 없이 `CheckIn.note`/`photoUri`가 채워진 레코드 조회 쿼리로 구현(과설계 방지). 자유 메모가 필요해지면 그때 `notes` 테이블을 추가(additive라 안전). *(현재 상태: `note`/`photoUri` 필드와 쿼리 설계는 있으나 입력 UI/Journal 화면은 아직 미구현 — [features.md](./features.md) 참고)*
- **Reminder**는 모델·Repository 인터페이스(`packages/core`)만 정의되어 있고, `apps/mobile`에는 아직 로컬 구현체(`LocalReminderRepository`)와 `expo-notifications` 스케줄링 연결이 없다 — 스캐폴드만 존재하는 상태.
- **Category(그룹)**는 계획 단계보다 먼저 v1에 편입되어 실제 구현됨: `packages/core`의 `Category` 모델 + `apps/mobile`의 `LocalCategoryRepository`(SQLite `categories` 테이블), 습관 등록 폼에서 그룹 선택/인라인 생성, 오늘 화면·리포트 화면에서 그룹별 섹션 렌더링까지 연결되어 있다. 2026-08-11부터 habits/checkIns와 동일하게 Supabase로 동기화된다(§5) — 그 전까지는 로컬 전용이라, 습관의 `categoryId`는 동기화되는데 그 카테고리 자체(이름/색)는 원래 기기에만 있어서 다른 기기에서 습관이 통째로 안 보이는 버그가 있었다(roadmap.md 참고).
- 인덱스: `checkins(habit_id, date)`, `checkins(updated_at)`(pull용), `habits(updated_at)`, `habits(deleted_at)`.
- 제약(NOT NULL/UNIQUE/FK)은 애플리케이션이 아니라 SQLite/Postgres DB 레벨에서 건다.
- 마이그레이션은 `drizzle-kit generate`로 SQL 파일 생성, 앱 부팅 시 `drizzle-orm/expo-sqlite/migrator`로 적용.

### 3-3. Repository / SyncGateway 추상화

```typescript
// packages/core/src/repositories/habit-repository.ts
interface HabitRepository {
  create(input: CreateHabitInput): Promise<Habit>;
  update(id: string, patch: UpdateHabitInput): Promise<Habit>;
  softDelete(id: string): Promise<void>;
  list(filter?: { includeArchived?: boolean }): Promise<Habit[]>;
  observe(filter?: object): { subscribe(cb: (habits: readonly Habit[]) => void): () => void };
}

// packages/core/src/sync/sync-gateway.ts
interface SyncChangeSet {
  habits: { created: Habit[]; updated: Habit[]; deletedIds: string[] };
  checkIns: { created: CheckIn[]; updated: CheckIn[]; deletedIds: string[] };
  categories: { created: Category[]; updated: Category[]; deletedIds: string[] };
}
interface SyncGateway {
  push(changes: SyncChangeSet): Promise<{ acceptedAt: string }>;
  pull(sinceIso: string): Promise<{ serverTime: string; changes: SyncChangeSet }>;
}
```

UI/usecase는 `HabitRepository` 인터페이스에만 의존한다. v1은 `LocalHabitRepository`(Drizzle) 하나만 존재하고, Sync는 이 Repository의 upsert 메서드를 통해서만 로컬 DB에 반영되는 **완전히 별도 계층**이다.

**어댑터 스위칭(Composition Root, `apps/mobile/src/composition/container.ts` 실제 구현)**:
```typescript
export async function runSync(): Promise<void> {
  const client = getConfiguredSupabaseClient(); // 고정 SUPABASE_URL/ANON_KEY
  const { data } = await client.auth.getSession();
  if (!data.session) return; // 로그아웃 상태 — lastSyncedAt도 건드리지 않는다

  const engine = new SyncEngine(habitRepository, checkInRepository, categoryRepository, new SupabaseSyncGateway(client));
  // ...syncNow 호출 후 lastSyncedAt 갱신
}
```
과거엔 설정 화면에서 `사용 안 함 / iCloud / REST 백엔드` 여러 모드를 사용자가 직접 선택했지만, 2026-08-11부터는 **선택지가 아니라 로그인 여부**로 결정된다 — 로그인 안 했으면 `runSync()`가 아무것도 하지 않고 즉시 반환하고, 로그인했으면 `SupabaseSyncGateway`로 동기화한다. 어느 프로젝트로 동기화할지도 더 이상 설정값이 아니라 `constants/supabase.ts`에 고정되어 있다. 자세한 트리거 지점(로그인 직후/로컬 변경 직후/포그라운드 복귀 시)은 §5-3 참고.

과거엔 로그아웃 상태에서 `NoopSyncGateway`(push/pull이 아무 일도 안 하지만 `pull()`이 `serverTime: new Date().toISOString()`을 반환)를 통해 `SyncEngine`을 그대로 태웠는데, 이 결과값을 `runSync()`가 그대로 `lastSyncedAt`에 저장해버려서 **로그아웃 상태에서의 매 포그라운드 동기화마다 `lastSyncedAt`이 "지금"으로 계속 갱신**되는 버그가 있었다. 그러면 실제로 로그인한 시점엔 이미 `lastSyncedAt`이 최근 값이라, 로그인 직후 pull이 `updated_at > lastSyncedAt` 조건으로 서버에 이미 있던 습관/체크인을 전부 걸러버려 "로그인해도 동기화가 안 되는" 것처럼 보였다. 지금은 `runSync()`가 로그아웃 상태면 `lastSyncedAt`을 건드리지 않고 즉시 반환하므로, 로그인 시점의 `lastSyncedAt`은 진짜 "마지막으로 실제 동기화한 시각"(최초 로그인이면 여전히 없음 → epoch)만 반영한다.

---

## 4. (제거됨) 자체 REST 백엔드 — 히스토리

v1 초반엔 "백엔드는 향후 고려사항이 아니라 실제 산출물"이라는 원칙 아래 `apps/backend`(Fastify + Drizzle + PostgreSQL, `docker-compose.yml`로 로컬 구동)를 실제로 만들고, `/api/v1/sync/{push,pull}` 엔드포인트로 두 클라이언트 간 push/pull 왕복까지 Android 에뮬레이터에서 end-to-end 검증했다(LWW 충돌 해소, `id` upsert, `deletedIds` 기반 soft-delete 전파 등 — Supabase 경로가 지금 쓰는 것과 같은 설계를 REST로 먼저 검증한 셈이다).

2026-08-11, 개인/지인용 배포 앱에 자체 서버 운영(Docker, Postgres 백업, 고정 토큰 인증 교체 등)은 과한 구성이라 판단해 **`apps/backend`, `docker-compose.yml`, `RestSyncGateway`를 전부 제거**하고 Supabase 단일 경로로 통합했다(§5). REST 백엔드의 구현 디테일(API 스펙, 동기화 프로토콜, 로컬 검증 9단계)이 필요하면 git 히스토리(이 커밋 이전)를 참고할 것 — 이 문서에는 더 유지하지 않는다.

---

## 5. Supabase 동기화 — 유일한 SyncGateway

### 5-0. 히스토리: iCloud/CloudKit을 검토했다가 걷어낸 이유

v1 초반엔 iCloud를 "Apple 생태계 전용이라 Android/Web 확장과 상충한다"는 이유로 기각했다(§배경). 이후 iPhone에서 먼저 쓸 계획이 확정되며 "자체 서버 없이 사용자 자신의 iCloud 계정만으로 동기화"라는 장점이 재조명되어, 한 차례 CloudKit(`expo-cloudkit` 패키지)로 `CloudKitSyncGateway`를 실제로 구현했었다. 하지만 **CloudKit 컨테이너 생성 자체가 유료 Apple Developer Program 가입($99/년)을 요구**하고, 이 프로젝트는 가입 계획이 없어 **그 코드는 영구히 실행 불가능한 상태**였다 — 미사용 코드를 남겨두지 않는다는 원칙에 따라 CloudKit 관련 코드·의존성·설정 전체를 제거했다.

이 과정에서 재확인된 것: **원래 목표(Android/Web 확장)에는 CloudKit보다 Supabase가 더 잘 맞는다** — CloudKit은 애초에 iOS 전용이었지만, Supabase는 같은 JS 클라이언트로 iOS/Android/Web 어디서든 동일하게 동작한다.

### 5-1. 검토한 방식과 채택 사유

| 방식 | 검토 결과 |
|---|---|
| iCloud Key-Value Store | 전체 1MB / 키 1024개 제한 — 전체 이력엔 부적합. **채택 안 함**. |
| iCloud Drive에 SQLite 파일 자체를 동기화 | Apple 공식 가이드가 비추천하는 안티패턴(충돌 시 데이터 유실 위험). **채택 안 함**. |
| CloudKit | 유료 Apple Developer Program 필요, iOS 전용. 가입 계획이 없어 **구현 후 제거**(§5-0). |
| **Supabase**(Postgres + Auth + RLS, 무료 티어) | 무료, 크로스플랫폼, 관리형 호스팅이라 서버를 직접 띄워둘 필요가 없음 — **채택**. |

**Supabase 무료 티어의 실제 제약과 이 프로젝트에서의 영향**:
- DB 500MB/파일 1GB/MAU 5만 — 개인용 습관 데이터엔 충분.
- **7일간 DB 활동이 없으면 프로젝트가 자동 일시정지**된다(대시보드에서 재개 가능, 장기 방치 시 삭제 사례도 있음). 자동 백업/PITR도 없다. 다만 이 앱은 **local-first**라 SQLite가 항상 진짜 원본이고 Supabase는 동기화 중계지일 뿐이므로, Supabase 쪽 데이터가 사라져도 다음 동기화 때 각 기기가 자기 로컬 데이터를 다시 올리면 복구된다 — 이 아키텍처가 무료 티어의 두 리스크를 실질적으로 완충한다.

### 5-2. 스키마/RLS/충돌 해소 설계 (`docs/supabase-schema.sql`)

- `habits`/`check_ins`/`categories` 테이블에 `user_id` 컬럼을 추가하고 Row Level Security로 `user_id = auth.uid()`인 행만 보이게 격리한다 — 이 앱을 설치한 모든 사람(개인+지인)이 **같은 고정 Supabase 프로젝트를 공유**하므로, 처음부터 사용자별 격리가 필수다.
- **LWW 충돌 해소는 Postgres 함수(RPC)로 서버에서 원자적으로 처리**한다 — `sync_upsert_habits`/`sync_upsert_check_ins`/`sync_upsert_categories`가 `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE <table>.updated_at < excluded.updated_at`로 "들어오는 값이 더 최신일 때만" 덮어쓰고, 실제로 반영된 id만 반환한다. 클라이언트(`SupabaseSyncGateway`)는 요청한 id 중 반환되지 않은 것을 `conflicts`로 보고한다 — 평범한 `.upsert()` 호출로는 이 정책을 표현할 수 없어 RPC로 옮긴 것.
- **검증**: `habits`/`check_ins` 쪽은 실제로 로컬 Postgres에 `auth.uid()`/`auth.users`를 스텁으로 만들어 6가지 시나리오(최초 insert 수락, 더 오래된 쓰기 거부, 더 최신 쓰기 수락, RLS로 타 사용자 행 격리, RPC가 호출자 본인 명의로만 행을 생성하는지, pull 쿼리가 RLS로 올바르게 스코프되는지)를 **`authenticated`라는 저권한 role로(테이블 소유자로 실행하면 RLS가 우회되므로) 실제로 실행해 전부 통과 확인**했다(`apps/mobile/scripts/supabase-test/`). `categories`는 같은 패턴을 그대로 복제한 것이라 로직상 동일하게 동작해야 하지만, 이 로컬 스텁 테스트 스위트로 별도 재검증하지는 않았다 — 실제 배포 전에 Supabase 대시보드에서 두 기기 간 카테고리 push/pull을 한 번 더 직접 확인할 것.

### 5-3. `SupabaseSyncGateway` (`apps/mobile/src/data/sync/supabase-sync-gateway.ts`)

- 기존 `SyncGateway` 인터페이스를 그대로 구현. `push()`는 위 RPC 세 개를 호출, `pull()`은 `updated_at > since`로 `.select()`한다 — RLS가 자동으로 본인 행만 반환하므로 게이트웨이가 `user_id`를 따로 필터링할 필요가 없다. `pull()`이 카테고리를 habits보다 먼저 적용하도록 `SyncEngine`이 순서를 맞춘다 — 그래야 habits의 `categoryId`가 가리키는 카테고리가 그 습관이 로컬에 반영되는 시점에 이미 존재한다.
- CloudKit 때와 달리 **네이티브 모듈이 아닌 순수 JS 클라이언트**(`@supabase/supabase-js`)라 `Platform.OS` 가드나 동적 import가 필요 없다 — iOS/Android/Web 어디서든 같은 코드 경로.
- 세션 저장은 `expo-secure-store`가 아니라 `@react-native-async-storage/async-storage`를 쓴다 — SecureStore는 항목당 ~2048바이트 제한이 있어 Supabase 세션(JWT access/refresh token 포함)이 그 한도를 넘기기 쉽고, 이는 Supabase 커뮤니티에서 널리 보고된 이슈다.
- 로그인은 `@react-native-google-signin/google-signin`(네이티브, Credential Manager 기반)이 아니라 `signInWithOAuth` + `expo-web-browser`의 브라우저 리다이렉트 플로우를 쓴다 — 전자는 커스텀 네이티브 모듈이라 Expo Go에서 동작하지 않아(CloudKit과 같은 종류의 문제) 이 개발 환경에서 검증이 불가능해지므로, Expo Go에서도 그대로 동작하는 후자를 택했다. 실제로 Android 에뮬레이터(Expo Go)에서 새 의존성들이 정상 번들링되고, 로그인 버튼이 (미설정 상태에서) 크래시 없이 올바른 안내 메시지를 띄우는 것까지 확인했다.
- Apple 로그인은 아직 없다 — App Store 배포 시 Google 등 제3자 소셜 로그인을 제공하면 Apple 로그인도 함께 제공해야 한다는 심사 규정이 있지만, 이는 Apple Developer Program 가입 이후에나 의미가 있어 지금은 범위 밖으로 남겨둔다.
- **자동 동기화 트리거**(`apps/mobile/src/composition/container.ts`의 `runSync`/`scheduleSync`, "지금 동기화" 버튼 없음, 2026-08-11 도입): (1) 로그인 직후 즉시 1회 — 그때까지의 로컬 데이터를 서버로 마이그레이션하는 역할을 겸함, (2) 앱 실행 시 및 `AppState`가 `background|inactive → active`로 전환될 때마다(`_layout.tsx`) 즉시 1회 — 다른 기기의 변경분을 받아옴, (3) 습관/체크인 로컬 변경(`create`/`update`/`softDelete`) 직후 ≈1.5초 디바운스 후 1회 — `container.ts`가 `habitRepository`/`checkInRepository`를 Proxy로 감싸 트리거한다. 세 트리거 모두 같은 `runSync()`를 호출하며, `syncNow()`의 push는 애초에 `findPendingSync()`(로컬에서 아직 안 올라간 행) 기준이라 "언제 호출하든 밀린 것 전부 올라간다"가 그대로 성립한다. OS 레벨 백그라운드 실행(앱이 완전히 종료된 상태)은 범위 밖 — `expo-task-manager` 등 새 네이티브 모듈과 재빌드가 필요하고 iOS는 타이밍을 OS가 임의로 정해서 보장이 안 된다. `runSync`/`scheduleSync`를 별도 `features/sync/auto-sync.ts` 파일로 분리했다가, `container.ts`와 서로 import하는 순환 참조 때문에 Metro에서 `scheduleSync`가 조용히 미해결로 남아 동기화가 안 도는 버그가 있었다 — 지금처럼 한 파일에 같이 둔다.
- 동기화 실패(오프라인 등)는 조용히 무시한다 — 로컬 행은 `syncStatus: 'pending'`으로 남아 다음 트리거 때 재시도되므로, 에러 배너/재시도 UI를 따로 만들지 않았다([features.md](./features.md)의 "화려한 시각화보다 통계 계산의 신뢰도" 원칙).

### 5-4. 프로젝트 설정 — 완료됨(앱 소유자가 한 번만 하는 작업)

이 앱은 사용자가 각자 자기 Supabase 프로젝트를 연결하는 구조가 아니라, **이 앱을 배포하는 사람(개발자)이 만든 프로젝트 하나를 모든 설치본이 공유**한다(RLS로 사용자별 데이터 격리, §5-2). 아래는 그 프로젝트를 만들 때 한 번만 필요한 절차이고, 2026-08-11에 완료되어 URL/anon key가 `apps/mobile/src/constants/supabase.ts`에 고정되어 있다 — 새로 설치하는 사람은 이 절차를 반복할 필요 없이 Google로 로그인만 하면 된다.

1. [supabase.com](https://supabase.com)에서 무료 프로젝트 생성.
2. 프로젝트의 SQL Editor에 `docs/supabase-schema.sql` 전체를 붙여넣고 실행.
3. Authentication > Providers에서 Google 활성화 — Google Cloud Console에서 OAuth 클라이언트를 만들고 Client ID/Secret을 등록, Redirect URI는 Supabase가 제공하는 `https://<project>.supabase.co/auth/v1/callback`로 설정.
4. Authentication > URL Configuration에서 **Redirect URLs**에 앱의 콜백 주소를 추가(`Linking.createURL("auth-callback")`이 만드는 값 — 실제 빌드에서는 `habittracker://auth-callback`, Expo Go/Dev Client 개발 중엔 `exp://**` 와일드카드). 여기 등록돼 있지 않으면 로그인 후 앱으로 안 돌아오고 기본 Site URL로 리다이렉트되어 실패한다 — Site URL 자체는 와일드카드를 못 쓰므로 `habittracker://`로 바꿔두면 이 실패 케이스를 피할 수 있다.
5. 프로젝트 URL과 anon(public) key(Supabase 대시보드 Settings > API)를 `apps/mobile/src/constants/supabase.ts`에 채워넣고 빌드.
6. 같은 Google 계정으로 두 기기에 로그인해 동일한 데이터가 보이는지 확인 — 단일 기기 로그인+마이그레이션은 2026-08-11에 실제 프로젝트로 검증 완료(§5-5), 두 기기 간 동기화 왕복은 아직 미검증.

**스키마가 바뀔 때마다 필요한 작업**: `docs/supabase-schema.sql`은 `create table if not exists`/`create or replace function`/`drop policy if exists` 위주라 **전체를 다시 붙여넣고 실행해도 안전**하다 — 카테고리 동기화 추가(2026-08-11) 때도 새 테이블/정책/RPC가 포함된 파일 전체를 그대로 재실행하는 방식으로 반영한다. 이미 로그인한 기기에 `lastSyncedAt`이 남아있는 상태에서 새 엔티티(카테고리)가 처음 추가되는 경우, 그 기기가 이미 갖고 있던 카테고리들은 `syncStatus: 'pending'`인 채로 로컬에 남아 있으므로 다음 자동 동기화(포그라운드 복귀 등) 때 정상적으로 push된다 — 별도 마이그레이션 스텝이 필요 없다.

### 5-5. 로컬 개발 환경: Expo Go 대신 로컬 Dev Client 사용

2026-08-11 기준, 이 프로젝트 개발에 쓰는 Android 에뮬레이터에서는 범용 Expo Go 앱 대신 **이 프로젝트 전용 로컬 Dev Client**(`expo run:android`로 빌드)를 쓴다. 이유:

- Expo Go 57.0.3(SDK 57 "권장" 버전)은 이 에뮬레이터에서 앱 실행 직후 Hermes VM이 즉시 `SIGSEGV`로 죽는다 — Supabase 관련 코드와 무관하게 스캐폴딩 단계 커밋만으로도 재현되는, Expo Go 클라이언트 자체의 문제.
- 캐시된 Expo Go 57.0.2로 다운그레이드하면 크래시는 피하지만, 이번엔 `@react-native-async-storage/async-storage`의 네이티브 모듈이 불안정해져(`Native module is null, cannot access legacy storage`) Supabase 세션 저장에 영향을 줄 수 있다.
- 두 문제 모두 "이 프로젝트의 의존성 버전과 Expo Go라는 사전 빌드된 범용 바이너리가 미묘하게 안 맞는" 유형의 문제라, Expo Go 자체를 버리고 `expo run:android`로 이 프로젝트만의 네이티브 앱(Dev Client)을 로컬 빌드하는 쪽으로 전환했다 — 실제 배포 빌드(EAS Build)와 동일하게 `package.json`에 고정된 버전 그대로 컴파일되므로 두 문제 모두 재발하지 않는다.
- 최초 빌드 시 Gradle이 NDK/CMake/빌드 도구를 자동 설치하고, 이 과정에서 Metro의 파일 워처가 시스템 inotify 한도(`fs.inotify.max_user_watches`)를 넘겨 죽을 수 있다 — `sudo sysctl fs.inotify.max_user_watches=524288`로 올려서 해결.

---

## 트레이드오프 요약

- **Expo vs Bare RN**: Expo는 DX/OTA/빌드 편의성이 크지만, 완전히 이색적인 네이티브 모듈(특히 향후 iOS WidgetKit 위젯)을 붙일 때 config plugin 학습이 필요. 위젯은 RN 자체의 근본적 한계이므로 Expo/Bare 선택과 무관하게 v2 이후 별도 작업 필요.
- **Drizzle+SQLite vs WatermelonDB**: WatermelonDB는 sync 프로토콜이 내장되어 초기 구현 속도는 빠를 수 있으나, 데코레이터 기반 모델과 네이티브 빌드 의존성이 유지보수 부담을 늘림. Drizzle은 직접 sync 엔진을 짜야 하지만, 서버와 스키마 문법이 동일해 장기 이식성에서 우위.
- **자체 REST 백엔드 vs 관리형 Supabase**: 자체 백엔드는 서버/DB 운영·백업·인증 교체를 직접 짊어져야 한다. 개인/지인 규모에선 그 운영 부담이 이점(완전한 제어, 자체 도메인)보다 크다고 판단해 2026-08-11 REST 백엔드를 걷어내고 Supabase로 완전히 이전했다(§4). 나중에 진짜 자체 인프라가 필요해지면 `SyncGateway` 인터페이스가 이미 그 교체 지점이다.
- **Notes를 별도 테이블로 안 만든 것**: Journal 화면이 나중에 "습관과 무관한 자유 메모"까지 요구하면 스키마 추가가 필요하지만, 순수 추가(additive) 변경이라 기존 데이터/앱 코드에 영향 없음.
