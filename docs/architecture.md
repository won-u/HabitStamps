# 아키텍처 설계

> DayStamp 스타일 개인용 습관 트래커 앱 — React Native(Expo), 로컬 우선 + 자체 백엔드 확장 구조

## 배경

아이폰 앱 **DayStamp - Habit Tracker**(매일 습관을 체크인하면 캘린더에 "스탬프"가 쌓이는 컨셉)를 레퍼런스로 한 개인용 습관 트래커를 만든다.

확정된 방향:
- **기술 스택**: React Native (Expo managed + Dev Client). 당초 iCloud(CloudKit) 동기화를 검토했으나, RN에서 CloudKit 구조화 동기화를 붙이기 어렵고 무엇보다 iCloud는 Apple 생태계 전용이라 향후 Android/Web 확장 목표와 근본적으로 상충하여 기각.
- **v1 범위**: 로컬 전용 저장(기기 내 SQLite), 계정/서버 없음. 단, 처음부터 "동기화 어댑터를 나중에 갈아끼우기만 하면 되는" 구조로 설계.
- **범위 추가**: 동기화 어댑터 추상화 설계만으로 끝내지 않고, 로컬에서 실제로 구동 가능한 REST 백엔드 모듈까지 함께 만들어 push/pull이 실제로 되는지 검증한다. 백엔드는 "향후 고려사항"이 아니라 실제 산출물이다.
- **최종 목표**: iOS를 시작으로 Android/Web까지, 자체 백엔드 서버로 멀티 디바이스 동기화까지 확장 가능한 구조.

---

## 1. 최종 기술 스택

| 영역 | 결정 | 대안(기각 사유) |
|---|---|---|
| RN 실행 방식 | **Expo managed + expo-dev-client + EAS Build** | Bare RN CLI — 빌드/서명/OTA 파이프라인을 직접 관리해야 해 개인 프로젝트엔 과함 |
| 라우팅 | **expo-router** (파일 기반, 웹 라우팅도 겸함) | React Navigation 수동 설정 |
| 로컬 DB | **expo-sqlite + Drizzle ORM** | WatermelonDB(데코레이터/네이티브 빌드 리스크, sync 내장이지만 자체 프로토콜 설계 목표와 안 맞음), Realm(Device Sync 사업 방향 불확실), RxDB(라이선스 경계 모호) |
| 상태관리 | **Zustand** (도메인 데이터는 DB 쿼리 훅으로 별도 관리, DB가 항상 source of truth) | Redux Toolkit(보일러플레이트 과함), Jotai |
| 알림 | **expo-notifications** | notifee (필요시 v1.5에 부분 도입 고려) |
| 백엔드 | **Fastify + Drizzle ORM(node-postgres) + PostgreSQL, Docker Compose로 로컬 구동** | NestJS(개인 프로젝트에 과설계), Supabase(v2 가속 옵션으로만 남김) |
| 인증(백엔드) | v1: **고정 Bearer 토큰 1개**(`.env`의 `DEVICE_AUTH_TOKEN`), 계정 없음 | JWT/OAuth — 실사용자 없는 지금 시점엔 과설계, `plugins/auth.ts`로 격리해 v2 교체 지점 확보 |
| ID 전략 | **클라이언트 생성 UUIDv7** (PK, 로컬/서버 공유) | 서버 auto-increment — 오프라인 생성 시 FK 무결성 깨짐 |
| 모노레포 | **pnpm workspaces** (`packages/core` 공유) | Nx/Turborepo(패키지 5개 미만인 지금은 과설계) |

**핵심 원칙**: 로컬 SQLite DB가 항상 진실의 원천(source of truth). UI/도메인 코드는 절대 서버를 직접 보지 않고 항상 로컬 Repository만 본다. Sync는 로컬 DB를 채워주는 별도 계층(SyncGateway)으로 분리한다. 이 원칙 덕분에 v1(서버 없음)→v2(서버 있음) 전환 시 UI/도메인 계층은 한 줄도 바뀌지 않는다.

---

## 2. 모노레포 구조

```
habit-tracker/
├── pnpm-workspace.yaml
├── docker-compose.yml              # postgres + backend 로컬 기동
├── packages/
│   └── core/                       # 클라이언트/서버 공용 (RN·Node 어디에도 의존 안 하는 순수 TS)
│       └── src/
│           ├── models/             # Habit, CheckIn, Category, Reminder 타입 + zod 스키마
│           ├── repositories/       # Repository 인터페이스(계약만, 구현 없음)
│           └── sync/                # SyncChangeSet, SyncGateway 인터페이스
├── apps/
│   ├── mobile/                     # Expo RN 앱
│   │   ├── app/                    # expo-router 화면: (tabs)/index,calendar,stats,settings, habit/[id],new
│   │   └── src/
│   │       ├── ui/                 # 프레젠테이션 컴포넌트
│   │       ├── features/           # 화면별 훅 (useHabitList, useCheckInToday 등)
│   │       ├── data/
│   │       │   ├── local/          # drizzle schema.ts, migrations/, sqlite client
│   │       │   ├── repositories/   # LocalHabitRepository 등 구현체
│   │       │   └── sync/           # RestSyncGateway, NoopSyncGateway, SyncEngine
│   │       ├── state/              # zustand store (설정/UI 상태)
│   │       ├── notifications/      # expo-notifications 스케줄링
│   │       └── composition/        # DI 조립부 (v1 로컬 전용 ↔ v1.5 sync 전환 지점)
│   └── backend/                    # Fastify REST API
│       ├── src/
│       │   ├── db/schema.ts        # drizzle-orm/pg-core 스키마
│       │   ├── db/migrations/
│       │   ├── routes/             # habits.ts, checkins.ts, sync.ts
│       │   └── plugins/            # auth(bearer token), error-handler
│       ├── Dockerfile
│       └── drizzle.config.ts
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

interface Category { id: string; name: string; color: string; sortOrder: number; }

interface Reminder {
  id: string; habitId: string; timeOfDay: string; // 'HH:mm'
  daysOfWeek: number[]; isEnabled: boolean;
  localNotificationId: string | null; // 기기별 값, 동기화 대상 아님
}
```

- **Journal(메모 모아보기)**은 별도 테이블 없이 `CheckIn.note`/`photoUri`가 채워진 레코드 조회 쿼리로 구현(과설계 방지). 자유 메모가 필요해지면 그때 `notes` 테이블을 추가(additive라 안전). *(현재 상태: `note`/`photoUri` 필드와 쿼리 설계는 있으나 입력 UI/Journal 화면은 아직 미구현 — [features.md](./features.md) 참고)*
- **Reminder**는 모델·Repository 인터페이스(`packages/core`)만 정의되어 있고, `apps/mobile`에는 아직 로컬 구현체(`LocalReminderRepository`)와 `expo-notifications` 스케줄링 연결이 없다 — 스캐폴드만 존재하는 상태.
- **Category(그룹)**는 계획 단계보다 먼저 v1에 편입되어 실제 구현됨: `packages/core`의 `Category` 모델 + `apps/mobile`의 `LocalCategoryRepository`(SQLite `categories` 테이블), 습관 등록 폼에서 그룹 선택/인라인 생성, 오늘 화면·리포트 화면에서 그룹별 섹션 렌더링까지 연결되어 있다.
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
}
interface SyncGateway {
  push(changes: SyncChangeSet): Promise<{ acceptedAt: string }>;
  pull(sinceIso: string): Promise<{ serverTime: string; changes: SyncChangeSet }>;
}
```

UI/usecase는 `HabitRepository` 인터페이스에만 의존한다. v1은 `LocalHabitRepository`(Drizzle) 하나만 존재하고, Sync는 이 Repository의 upsert 메서드를 통해서만 로컬 DB에 반영되는 **완전히 별도 계층**이다.

**어댑터 스위칭(Composition Root)**:
```typescript
async function buildSyncEngine(settings: { syncMode: 'off'|'icloud'|'rest'; syncServerUrl: string|null; deviceToken: string }) {
  let gateway: SyncGateway = new NoopSyncGateway();
  if (settings.syncMode === 'icloud' && Platform.OS === 'ios') {
    const { CloudKitSyncGateway } = await import('./cloudkit-sync-gateway'); // iOS에서만 로드
    gateway = new CloudKitSyncGateway(CLOUDKIT_CONTAINER_ID);
  } else if (settings.syncMode === 'rest' && settings.syncServerUrl) {
    gateway = new RestSyncGateway(settings.syncServerUrl, settings.deviceToken);
  }
  return new SyncEngine(habitRepository, checkInRepository, gateway);
}
```
설정 화면의 "동기화" 섹션에서 `사용 안 함 / iCloud / REST 백엔드` 세 모드를 런타임에 전환한다 — **코드 변경 없이 설정만으로** 전환되는 원칙은 그대로 유지. `iCloud` 모드는 iOS에서만 활성화되고(Android에서는 선택 자체가 비활성화됨), 나머지는 §5 참고.

---

## 4. 백엔드 모듈 (실제 구동/검증 가능한 산출물)

### 4-1. 로컬 구동 환경

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: habit, POSTGRES_PASSWORD: habit, POSTGRES_DB: habit_tracker }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  backend:
    build: ./apps/backend
    environment:
      DATABASE_URL: postgres://habit:habit@postgres:5432/habit_tracker
      DEVICE_AUTH_TOKEN: local-dev-token
    ports: ["4000:4000"]
    depends_on: [postgres]
volumes: { pgdata: }
```

### 4-2. REST API 스펙 (base: `/api/v1`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET/POST | `/habits`, `/habits/:id` (PATCH/DELETE) | CRUD (웹 관리자 화면 및 향후 완전 온라인 모드 대비, v1~v1.5 앱은 호출 안 함) |
| GET/POST | `/checkins`, `/checkins/:id` (PATCH/DELETE) | 상동 |
| **POST** | **`/sync/push`** | 로컬에서 쌓인 변경분(created/updated/deletedIds) 일괄 업로드 |
| **GET** | **`/sync/pull?since=<ISO8601>`** | `since` 이후 변경분(서버 기준) 다운로드 |

- 에러 응답 통일: `{ "error": { "code": "...", "message": "..." } }`
- 삭제는 항상 soft delete(`deletedAt` 설정), 물리 삭제 없음.

### 4-3. 동기화 프로토콜

- **Push**: 각 레코드를 `id` 기준 upsert. 서버 row가 없으면 insert. 있으면 `updatedAt` 비교 후 **LWW(Last-Write-Wins)**로 최신 값 채택, 클라이언트가 진 경우 응답의 `conflicts` 배열로 알려 다음 pull에서 자연스럽게 덮어쓰게 함. UUID를 클라이언트가 생성하므로 push는 멱등(재시도 안전).
- **Pull**: `WHERE updated_at > :since ORDER BY updated_at ASC`. `since` 없으면 최초 전체 동기화, 있으면 증분 동기화. 응답의 `deletedIds`는 `deletedAt`이 채워진 row → 클라이언트도 동일하게 soft delete 반영.
- LWW를 택한 이유: 1인 사용자가 여러 기기에서 쓰는 시나리오이지 여러 사용자 협업이 아니므로 CRDT 등 정교한 병합은 과설계. `version` 컬럼은 추후 "동시 편집 감지 알림" 등 확장 지점으로 남김.

### 4-4. 네트워킹 주의사항

- iOS 시뮬레이터: `http://localhost:4000` 그대로 접근 가능.
- Android 에뮬레이터: `localhost`는 에뮬레이터 자신을 가리키므로 반드시 `http://10.0.2.2:4000` 사용.
- 실기기 테스트: 같은 Wi-Fi의 PC/Mac LAN IP(`http://192.168.x.x:4000`), 방화벽 4000 포트 허용 필요.

### 4-5. 로컬 검증 절차 — ✅ 실제 수행 완료 (Android 에뮬레이터 기준)

개발 환경에 Mac이 없어 **iOS 시뮬레이터 대신 Android 에뮬레이터(`emulator-5554`, Docker `android-studio-gui` 컨테이너, `network_mode: host`)로 전 과정을 실제 검증**했다. iOS에서의 재검증은 아직 하지 않았다.

1. `docker compose up -d` — Postgres + backend 기동
2. `pnpm --filter @habit-tracker/backend db:migrate` — 마이그레이션 적용
3. `curl http://localhost:4000/api/v1/habits` → 200/빈 배열 확인 (헬스체크)
4. `pnpm --filter @habit-tracker/mobile start` → Expo Dev Client, Android 에뮬레이터에서 실행
5. 앱에서 습관 생성 + 오늘 체크인 (서버 URL 미설정 상태 → 순수 로컬, `syncStatus='pending'` 확인)
6. Settings > Developer에서 Sync Server URL(`http://10.0.2.2:4000`)/Device Token 입력
7. "지금 동기화" 탭 → `POST /sync/push` 호출 확인
8. `psql`로 Postgres에 접속해 `habits`/`check_ins` 테이블에 실제로 row가 들어갔는지 확인
9. 두 번째 "클라이언트"(독립 Node 스크립트 `apps/mobile/scripts/verify-sync-engine.ts` + 실제 앱 UI 양쪽)에서 pull로 동일 데이터가 나타나는지 확인 → **통과 확인함, 아키텍처 전체가 검증됨**

검증 중 발견/수정한 이슈:
- Postgres가 `timestamp with time zone`을 텍스트 모드로 반환할 때 형식이 엄격한 ISO 8601이 아니어서(`"2026-07-29 02:09:20.000+00"`) `z.string().datetime()`이 거부함 → `packages/core`의 동기화 관련 timestamp 필드를 전부 `z.string()`으로 완화해 해결.

---

## 5. Supabase 동기화 — REST 백엔드와 병행하는 세 번째 SyncGateway

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

- `habits`/`check_ins` 테이블에 `user_id` 컬럼을 추가하고 Row Level Security로 `user_id = auth.uid()`인 행만 보이게 격리한다 — REST 백엔드(단일 고정 토큰, 단일 사용자 가정)와 달리 Supabase 경로는 여러 사용자를 전제로 하므로 처음부터 사용자별 격리가 필요하다.
- **LWW 충돌 해소는 Postgres 함수(RPC)로 서버에서 원자적으로 처리**한다 — `sync_upsert_habits`/`sync_upsert_check_ins`가 `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE <table>.updated_at < excluded.updated_at`로 "들어오는 값이 더 최신일 때만" 덮어쓰고, 실제로 반영된 id만 반환한다. 클라이언트(`SupabaseSyncGateway`)는 요청한 id 중 반환되지 않은 것을 `conflicts`로 보고한다 — REST 백엔드(§4-3)와 동일한 정책을 평범한 `.upsert()` 호출로는 표현할 수 없어 RPC로 옮긴 것.
- **검증**: 이 SQL은 문서에만 존재하는 게 아니라, 실제로 로컬 Postgres에 `auth.uid()`/`auth.users`를 스텁으로 만들어 6가지 시나리오(최초 insert 수락, 더 오래된 쓰기 거부, 더 최신 쓰기 수락, RLS로 타 사용자 행 격리, RPC가 호출자 본인 명의로만 행을 생성하는지, pull 쿼리가 RLS로 올바르게 스코프되는지)를 **`authenticated`라는 저권한 role로(테이블 소유자로 실행하면 RLS가 우회되므로) 실제로 실행해 전부 통과 확인**했다(`apps/mobile/scripts/supabase-test/`). CloudKit 때는 타입 수준까지만 검증할 수 있었던 것과 달리, 이번엔 핵심 로직 자체를 실행 검증했다.

### 5-3. `SupabaseSyncGateway` (`apps/mobile/src/data/sync/supabase-sync-gateway.ts`)

- 기존 `SyncGateway` 인터페이스를 그대로 구현. `push()`는 위 RPC 두 개를 호출, `pull()`은 `updated_at > since`로 `.select()`한다 — RLS가 자동으로 본인 행만 반환하므로 게이트웨이가 `user_id`를 따로 필터링할 필요가 없다.
- CloudKit 때와 달리 **네이티브 모듈이 아닌 순수 JS 클라이언트**(`@supabase/supabase-js`)라 `Platform.OS` 가드나 동적 import가 필요 없다 — iOS/Android/Web 어디서든 같은 코드 경로.
- 세션 저장은 `expo-secure-store`가 아니라 `@react-native-async-storage/async-storage`를 쓴다 — SecureStore는 항목당 ~2048바이트 제한이 있어 Supabase 세션(JWT access/refresh token 포함)이 그 한도를 넘기기 쉽고, 이는 Supabase 커뮤니티에서 널리 보고된 이슈다.
- 로그인은 `@react-native-google-signin/google-signin`(네이티브, Credential Manager 기반)이 아니라 `signInWithOAuth` + `expo-web-browser`의 브라우저 리다이렉트 플로우를 쓴다 — 전자는 커스텀 네이티브 모듈이라 Expo Go에서 동작하지 않아(CloudKit과 같은 종류의 문제) 이 개발 환경에서 검증이 불가능해지므로, Expo Go에서도 그대로 동작하는 후자를 택했다. 실제로 Android 에뮬레이터(Expo Go)에서 새 의존성들이 정상 번들링되고, 로그인 버튼이 (미설정 상태에서) 크래시 없이 올바른 안내 메시지를 띄우는 것까지 확인했다.
- Apple 로그인은 아직 없다 — App Store 배포 시 Google 등 제3자 소셜 로그인을 제공하면 Apple 로그인도 함께 제공해야 한다는 심사 규정이 있지만, 이는 Apple Developer Program 가입 이후에나 의미가 있어 지금은 범위 밖으로 남겨둔다.

### 5-4. 사용자가 직접 해야 하는 설정

1. [supabase.com](https://supabase.com)에서 무료 프로젝트 생성.
2. 프로젝트의 SQL Editor에 `docs/supabase-schema.sql` 전체를 붙여넣고 실행.
3. Authentication > Providers에서 Google 활성화 — Google Cloud Console에서 OAuth 클라이언트를 만들고 Client ID/Secret을 등록, Redirect URI는 Supabase가 제공하는 `https://<project>.supabase.co/auth/v1/callback`로 설정.
4. Authentication > URL Configuration에서 **Redirect URLs**에 앱의 콜백 주소를 추가(`Linking.createURL("auth-callback")`이 만드는 값 — 개발 중엔 `exp://<metro-ip>:8081/--/auth-callback` 또는 와일드카드 `exp://**`, 실제 빌드에서는 `habittracker://auth-callback`). 여기 등록돼 있지 않으면 로그인 후 앱으로 안 돌아오고 기본 Site URL(신규 프로젝트 기본값 `http://localhost:3000`)로 리다이렉트되어 실패한다 — Site URL 자체는 와일드카드를 못 쓰므로 `habittracker://`처럼 앱 스킴으로 바꿔두면 이 실패 케이스를 피할 수 있다.
5. 앱의 설정 > 동기화 > Supabase에서 프로젝트 URL과 anon(public) key(둘 다 Supabase 대시보드 Settings > API에 있음)를 입력, "Google로 로그인" 후 "지금 동기화".
6. 두 번째 기기에서 같은 Google 계정으로 로그인하면 동일한 데이터가 보이는지 확인 — 단일 기기 로그인 왕복은 2026-08-11에 사용자가 실제 프로젝트로 검증 완료(§5-5), 두 기기 간 동기화 왕복은 아직 미검증.

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
- **Postgres+Docker vs SQLite 백엔드**: Docker가 약간의 설치 부담을 추가하지만, 향후 실제 배포(Fly.io/Railway/자체 VPS)를 고려하면 이중 마이그레이션을 피하는 게 이득. Docker가 부담스러우면 백엔드만 SQLite로 대체해도 리포지토리/Sync 추상화는 그대로 유효.
- **고정 토큰 인증**: 프로덕션 배포 시점엔 즉시 교체가 필요한 취약한 방식임을 인지하고, `plugins/auth.ts`에 격리해 v2에서 JWT/OAuth로 교체할 지점을 미리 표시.
- **Notes를 별도 테이블로 안 만든 것**: Journal 화면이 나중에 "습관과 무관한 자유 메모"까지 요구하면 스키마 추가가 필요하지만, 순수 추가(additive) 변경이라 기존 데이터/앱 코드에 영향 없음.
