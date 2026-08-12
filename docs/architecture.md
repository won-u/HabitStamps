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
            │   ├── local/*-repository.ts      # LocalHabitRepository 등 구현체 — 네이티브(SQLite)
            │   ├── local/*-repository.web.ts  # 같은 이름, 웹 빌드 전용(IndexedDB) — §3-4
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

UI/usecase는 `HabitRepository` 인터페이스에만 의존한다. 네이티브(iOS/Android)는 `LocalHabitRepository`(Drizzle+SQLite), 웹 빌드는 같은 이름의 IndexedDB 구현체(§3-4)를 쓴다. Sync는 이 Repository의 upsert 메서드를 통해서만 로컬 DB에 반영되는 **완전히 별도 계층**이라, 저장소가 어느 쪽이든 SyncEngine/SyncGateway 코드는 한 글자도 안 바뀐다.

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

### 3-4. 웹 빌드 전용 로컬 저장소 — IndexedDB

이 프로젝트는 Expo Router 기반이라 `expo start --web` / `expo export -p web`으로 같은 코드베이스가 그대로 웹 빌드로 나온다(별도 Next.js 앱이 필요 없음). 다만 웹에는 `expo-sqlite`가 없으므로, `apps/mobile/src/data/local/*-repository.web.ts`가 IndexedDB(`idb` 라이브러리로 얇게 래핑) 기반의 같은 이름 구현체를 제공한다.

- **적용 방식**: Metro/Expo의 플랫폼별 파일 확장자 해석(`*.web.ts`가 웹 빌드에서 확장자 없는 `*.ts`보다 우선 매칭됨)을 그대로 이용 — `composition/container.ts`를 비롯해 이 Repository들을 import하는 어떤 코드도 플랫폼 분기 없이 그대로 동작한다. 바뀌는 건 어떤 파일이 번들에 들리느냐뿐이다.
- **DB 초기화도 플랫폼별로 분리**: `_layout.tsx`가 직접 `useMigrations`(Drizzle/SQLite 전용 API)를 부르는 대신 `data/local/use-db-ready.ts`(네이티브)/`use-db-ready.web.ts`(웹, `indexedDB.open` 프라미스를 기다림)를 통해 "DB 준비 완료" 여부만 받는다 — 웹 빌드가 SQLite 마이그레이션 코드를 아예 참조/번들하지 않게 하기 위해서다.
- **스키마**: `habits`/`check_ins`/`categories` 세 오브젝트 스토어, 각각 `id`를 keyPath로 하고 `syncStatus`(전부)와 `habitId`/`date`(체크인만) 인덱스를 둔다. `frequencyConfig` 같은 중첩 객체는 SQLite처럼 JSON 문자열로 직렬화할 필요 없이 구조화 복제(structured clone)로 그대로 저장된다.
- **`toggle()` 등 도메인 로직은 그대로 이식**: 체크인의 원자적 `toggle(habitId, date)`(§ roadmap.md 2026-08-11 체크인 중복 버그 수정 참고)도 같은 in-memory 락 패턴을 IndexedDB 버전에 그대로 복제했다 — 저장소가 바뀌어도 동시성 버그의 성격은 같기 때문.
- **검증**: Playwright + Chromium으로 실제 브라우저에서 습관 생성 → 체크인 토글 → 페이지 새로고침까지 수행하고, `indexedDB`를 직접 열어 데이터가 정확히 남아있는지 확인 — 새로고침 전후 데이터가 동일하게 유지되는 것으로 영속성 검증 완료. 오늘 화면의 드래그 재정렬(§5 이전, `components/reorderable-list.tsx`)도 마우스 이벤트(`mousedown` → 350ms 대기 → `mousemove` → `mouseup`)로 재현해 웹에서도 동일하게 동작함을 확인했다.
- **이 테스트 중 발견한 버그(플랫폼 무관)**: `ReorderableList`의 제스처가 실제로 활성화되지 않은 일반 탭에서도 `onFinalize`가 호출되어 `onReorder`가 매번 실행되고 있었다 — 체크인 토글 같은 무관한 탭마다 모든 습관의 `sortOrder`가 불필요하게 재저장되는 부작용이 있었다(습관의 `updatedAt`/`version`이 체크인 토글 때마다 같이 바뀌는 것으로 발견). `onStart`에서만 세우는 `hasActivated` 플래그로 실제 드래그가 시작된 경우에만 커밋하도록 수정.

### 3-5. PWA — 홈 화면 설치 + 오프라인 앱 셸 캐싱

웹 빌드를 "탭한 링크"가 아니라 아이콘을 탭해 여는 앱처럼 만들려면 두 가지가 더 필요하다: (1) 설치 가능하게 만드는 매니페스트, (2) 데이터와 별개로 **앱 코드 자체**를 오프라인에서 불러오는 캐싱. §3-4의 IndexedDB는 데이터 오프라인만 담당하고, 코드(HTML/JS/CSS) 오프라인은 이 절이 담당한다.

- **설치 가능하게 만들기**: Expo Router의 정적 웹 export는 `app.json`의 `web.*` 필드로 매니페스트를 생성해주지 않는다(확인 완료 — 필드는 스키마에 존재하지만 export 결과물에 반영되지 않음). 대신 `src/app/+html.tsx`(export 시 루트 HTML 문서를 완전히 대체하는 Expo Router 전용 파일)에서 직접 `<link rel="manifest">`와 iOS Safari 전용 태그(`apple-mobile-web-app-capable` 등 — Safari는 표준 매니페스트의 `theme_color`/`display`를 상태바/전체화면에 반영하지 않아 별도 필요)를 추가하고, `apps/mobile/public/manifest.json` + 아이콘 PNG들(`public/`은 Expo가 가공 없이 그대로 웹 루트에 복사하는 디렉터리)을 둔다.
- **앱 셸 오프라인 캐싱**: `public/sw.js`(수동 작성 Service Worker, `+html.tsx`의 인라인 스크립트로 등록) — `install` 시점에 `/`를 먼저 받아와 그 HTML 안의 `<script src>`/`<link href>`를 정규식으로 추출해 JS/CSS/아이콘까지 한 번에 캐시한다. 빌드마다 파일명에 콘텐츠 해시가 붙어 매번 바뀌므로(Expo가 별도 에셋 매니페스트를 안 만들어줌), 하드코딩된 파일명 목록 대신 이 방식을 택했다. **내비게이션(HTML 문서) 요청은 네트워크 우선**(온라인이면 항상 최신을 받아오고, 실패할 때만 캐시로 폴백) — 처음엔 이것도 캐시 우선으로 했다가, Cloudflare Pages에 새 버전을 배포해도 실기기에서 새로고침해도 계속 옛 화면이 보이는 문제를 실제로 겪고 나서 바꿨다. 콘텐츠 해시가 붙는 정적 자산(JS/CSS/아이콘)은 URL 자체가 빌드마다 달라지므로 캐시 우선으로 둬도 안전하다. Supabase 등 다른 origin 요청은 그대로 통과시켜 SW가 동기화 API 응답을 캐시하지 않게 한다.
- **`sw.js` 자체를 수정했는데도 반영이 안 되는 경우**: 브라우저는 `/sw.js`가 이전 등록본과 바이트 단위로 같으면 새로 설치를 시도조차 하지 않는다 — `CACHE_NAME` 상수를 실제로 바꾼 배포(`habit-tracker-shell-v1` → `v2`)에서 처음 겪었다. `sw.js` 내용이 바뀌는 배포에서는 `CACHE_NAME`도 같이 올려서 브라우저가 그 변경을 확실히 감지하게 할 것.
- **검증 중 발견한 함정**: 최초 `register()` 직후의 그 페이지 로드는 SW가 아직 활성화되기 전이라 자기 자신의 HTML/JS 요청이 fetch 핸들러를 거치지 않는다(`clients.claim()`을 불러도 마찬가지 — 이미 시작된 요청은 되돌릴 수 없음). 그래서 install 단계에서 `/`를 명시적으로 fetch해 미리 캐시해두지 않으면, 진짜 완전한 최초 방문 직후 오프라인으로 전환했을 때 셸 자체가 비어 있어 로드에 실패한다. Playwright로 "온라인 최초 방문 → `context().setOffline(true)` → 새로고침" 시나리오를 직접 재현해 이 문제를 발견하고 install 시 사전 캐싱을 추가해 해결— 재현 후에는 오프라인 새로고침도 온라인 때와 동일하게 렌더링됨을 스크린샷으로 확인했다.
- **아이콘**: `assets/images/icon.png`(Expo 기본 템플릿 아이콘, 이 프로젝트는 아직 커스텀 앱 아이콘을 만든 적이 없음 — iOS 네이티브 빌드도 동일)을 PIL로 실제 라이트 테마 배경색(`#F9F8F6`)에 합성 후 리사이즈해 `apple-touch-icon.png`(180×180)/`icon-192.png`/`icon-512.png`로 사용. 커스텀 브랜딩이 필요하면 추후 별도 작업.
- **standalone 모드에서만 드러난 today 화면 레이아웃 버그(2026-08-12, 실기기 발견)**: Cloudflare Pages 배포 후 실제로 습관이 여러 개 들어있는 계정으로 iOS 홈 화면 PWA를 테스트하니 (1) 상단 날짜 스트립이 짤려 보이고, (2) 습관 목록이 스크롤되지 않고, (3) 화면 맨 아래에 흰 여백이 보이는 세 가지 문제가 동시에 나타났다. 원인은 하나였다: `(tabs)/index.tsx`의 습관 목록 `ScrollView`가 `contentContainerStyle`만 받고 컴포넌트 자체엔 `style`(즉 높이 제약)이 없었다 — react-native-web에서는 `ScrollView` 자신에게 `flex:1` 같은 높이 제약이 없으면 콘텐츠 전체 높이만큼 그냥 늘어나 버려 스크롤이 성립하지 않는다. 이제까지의 모든 자동 테스트가 "습관 0개"인 빈 상태만 확인했어서(마지막 화면 캡처들 참고) 이 버그를 놓쳤다 — 콘텐츠가 뷰포트를 넘칠 일이 없었으니 증상이 드러나지 않았다. 습관 목록이 뷰포트보다 커지면서 페이지 전체 높이 계산이 흔들려 위쪽 날짜 스트립 찌그러짐과 아래쪽 흰 여백까지 같이 나타난 것으로 보인다. 고침: 그 `ScrollView`에 `style={{flex:1}}`을 추가하고, 날짜 스트립/헤더 행에 `flexShrink:0`을 명시해 어떤 상황에서도 압축되지 않게 했다. 가짜 습관 20개를 IndexedDB에 직접 넣어 Playwright로 재현·검증(스크롤 전/후 `scrollTop` 변화 확인). 덧붙여 `+html.tsx`에 테마 배경색을 `body`에 미리 깔아두는 CSS를 추가해, 세이프 에어리어(노치/홈 인디케이터) 틈에 흰 배경이 비치는 경우에 대한 방어선도 함께 뒀다. 이 세 증상이 standalone 모드에서만 보고된 건 우연 — 실기기에서 실제 데이터로 테스트한 게 이번이 처음이라 그때 처음 드러난 것뿐, 코드상 native/일반 브라우저에도 동일하게 있던 버그다.
- **웹에서 드래그 재정렬이 안 되던 문제 — 원인은 3가지가 겹쳐 있었다**: 위 스크롤 수정 배포 후 실기기에서 확인하는 과정에서 드래그 재정렬 자체가 여러 층위로 안 됐다. 최종적으로 확인된 원인과 수정은 다음 세 가지다.
  1. **`HabitCard`가 상세 화면으로 가는 `Link`(웹에서 `<a href>`)로 렌더링되고 있었다** — iOS Safari가 앵커에 붙이는 기본 동작들(롱프레스 시 링크 미리보기, 탭 하이라이트, 클릭 처리)이 카드에 걸린 드래그 제스처와 계속 충돌했다. `<Link asChild>`를 걷어내고 `Pressable` + `useRouter().push(...)`로 프로그래밍 방식 이동으로 바꿔 앵커 자체를 없앴다(상세 페이지 이동 동작은 100% 동일하게 유지). 같은 계열의 다른 Safari 기본 동작(길게 눌렀을 때 텍스트 선택 말풍선, 탭 시 회색 하이라이트)도 `+html.tsx`에서 앱 전체에 `user-select:none`(입력 필드 제외)과 `-webkit-tap-highlight-color:transparent`로 껐다.
  2. **`components/reorderable-list.tsx`의 `Gesture.Pan()...`이 `DraggableRow`의 렌더 본문에서 매 렌더마다 새로 만들어지고 있었다** — 드래그 도중 항목이 실제로 자리를 옮기면(`onDragMove` → 부모의 `order` state 갱신) 새 `order`/`heights` props로 리렌더되면서 `Gesture.Pan()` 객체도 매번 새로 만들어져 `GestureDetector`에 재연결됐다. 진행 중인 터치가 그때마다 끊겼다 이어지길 반복해 "흔들림"으로 보였다. `Gesture.Pan()` 체인 전체를 `useMemo(() => ..., [disabled])`로 감싸 재렌더 사이에 안정적으로 유지하고, 콜백이 필요로 하는 `order`/`heights`/`onDragMove` 등은 `useSharedValue` + `useEffect` 동기화로 읽게 바꿨다(처음엔 `useRef`로 시도했으나, `runOnJS`로 워클릿이 호출하는 함수가 닫고 있는 일반 `useRef`는 Reanimated가 "워클릿에 전달된 것"으로 취급해버려 이후의 매 렌더 재할당이 경고를 내며 예전 스냅샷만 계속 돌려줬다 — `adb logcat`의 `[Worklets] Tried to modify key 'current'...` 경고로 발견). `adb shell input draganddrop`(안드로이드)과 Playwright 마우스 드래그(웹) 양쪽에서 실제 항목 교체를 확인했다.
  3. **웹에서만: 스크롤 가능한 목록에서는 위 수정 후에도 여전히 드래그가 안 됨** — 항목이 적어 스크롤이 필요 없는 목록에서는 되고, 실제 계정처럼 스크롤이 필요한 목록에서는 "조금 따라오다 원위치로 튕기는" 증상이 남아있었다(사용자가 이 조건을 정확히 격리해준 게 결정적이었다 — 그룹이 여러 개인지는 무관하고, 순수하게 스크롤 필요 여부였다). 조사해보니 이건 앱 코드로 고칠 수 없는 **`react-native-gesture-handler`의 알려진 미해결 이슈**였다: `Gesture.Pan().activateAfterLongPress(...)`가 스크롤 가능한 `ScrollView` 안에 있을 때 웹 구현이 감싸인 요소의 `touch-action`을 마운트 시점에 `"none"`으로 고정해버리는데(`GestureDetector`의 `touchAction` prop 기본값), 이게 롱프레스 활성화 여부와 무관하게 그 요소를 터치 스크롤 후보에서 아예 제외시킨다 — [react-native-gesture-handler#2622](https://github.com/software-mansion/react-native-gesture-handler/issues/2622)에 "Platform: Web" 라벨이 붙은 채 미해결로 열려 있다. `touchAction`을 동적으로 전환하는 시도(React state 버전, 이어서 DOM을 직접 동기 조작하는 버전)를 모두 해봤지만 스크롤 가능한 목록에서는 소용없었다 — 라이브러리 자체가 "이 요소로 시작된 터치는 스크롤 후보가 아니다"를 마운트 시점에 확정해버리기 때문에, 타이밍을 아무리 손봐도 근본적으로 못 고친다.
    **최종 해결**: 웹에서만 카드/그룹 헤더 **전체**가 아니라 오른쪽의 작은 전용 손잡이 아이콘(`reorder-three`)만 `GestureDetector`로 감싼다 — 이러면 "이 터치가 스크롤인지 드래그인지" 애매함 자체가 없어진다(손잡이를 잡으면 항상 드래그, 카드의 다른 곳을 잡으면 그 부분은 애초에 제스처에 감싸인 적이 없으니 항상 스크롤). 대부분의 웹 정렬 라이브러리가 기본으로 채택하는 방식이기도 하다. 네이티브(iOS/Android)는 이 문제가 없어 기존처럼 카드/헤더 전체를 감싸는 롱프레스 방식을 그대로 유지한다(`Platform.OS === 'web'`로 분기, 손잡이 아이콘도 웹에서만 렌더링). `reorderable-list.tsx`의 `DragHandle`은 다시 `{gesture, isDragging}`만 노출하는 단순한 형태로 되돌아갔다 — `touchAction` 동적 전환/DOM ref 메커니즘은 이 방식으로 완전히 대체되어 필요 없어졌다. 안드로이드 에뮬레이터(전체 카드 롱프레스)와 웹(손잡이로만 드래그, 카드 본문은 스크롤/탭 정상) 양쪽에서 최종 검증했다.
- **9차: 드롭 직후 손가락 아래에 있던 다른 카드로 잘못 이동/체크인되는 문제 — 웹뿐 아니라 네이티브에서도 재현**: 처음엔 "웹 `Pressable`의 터치 처리가 `GestureDetector`의 소비를 모른다"는 웹 전용 설명으로 가드를 웹에만 걸었는데, 안드로이드 에뮬레이터에서도 같은 증상이 나와서 플랫폼 무관하게 적용했다. `reorderable-list.tsx`에 모듈 스코프 `lastDragEndedAt` 타임스탬프(`markDragJustEnded`/`wasDragJustEnded`, ~400ms)를 두고, 드래그가 실제로 활성화됐던 경우(`hasActivated`) `onFinalize`에서 기록한다 — 카드/그룹 헤더의 모든 `onPress`가 이 직후면 무시한다.
- **10차: 같은 항목을 연달아 두 번 드래그하면 두 번째가 옛 위치 기준으로 계산됨**: "1을 옮겨서 2,1,3,4가 된 직후 1을 다시 드래그하면 1,2,3,4로 돌아가는 것처럼 보인다"로 보고됐다. 원인은 5차에서 고친 것과 같은 계열의 스테일 클로저였는데, 이번엔 `startOffsetY`(그 행의 드래그 시작 시점 위치)가 대상이었다: `handleStart`는 `useMemo`로 고정된 제스처 안에 갇혀 있어서, 그 제스처가 마지막으로 다시 만들어졌을 때의 `startOffsetY` 값을 계속 참조한다. 그 재생성은 `disabled` prop이 바뀔 때만(다른 행이 드래그를 시작/종료할 때) 일어나므로, 같은 행을 연달아 두 번 드래그하는 사이에 **다른 행의 드래그가 한 번도 안 끼면** 이 재생성이 전혀 안 일어나서, 두 번째 드래그가 **그 행이 첫 번째 드래그로 옮겨지기 전의** 위치를 `dragStartOffsetY`로 삼아버렸다. `order`/`heights`와 똑같이 `currentOffsetYShared`(`useSharedValue` + `useEffect`로 매 렌더 동기화)를 추가해 `handleStart`가 항상 최신 위치를 읽게 고쳤다. `adb shell input draganddrop`으로 "같은 항목 연속 두 번 드래그"를 재현해 검증했다 — 이때 겪은 함정: `draganddrop`의 duration이 짧으면(예: 700ms) 짧은 이동 거리에서 롱프레스 활성화(350ms) 자체가 잘 안 돼서 재현이 안 되는 것처럼 보였다 — 1.5초 이상으로 늘리니 안정적으로 재현/검증됐다.

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
- **웹에서 로그인이 조용히 실패하던 버그(2026-08-12, Cloudflare Pages 배포 후 발견)**: `signInWithGoogle`은 `WebBrowser.openAuthSessionAsync`로 연 팝업이 `redirectTo`에 도달하면 `maybeCompleteAuthSession()`으로 opener에 `postMessage`를 보내는 걸 전제로 토큰을 받아 `setSession()`을 호출한다 — 이게 opener(원래 탭)의 실행 컨텍스트에서 일어난다. 그런데 **iOS에서 홈 화면에 설치한 PWA(standalone 모드)로 앱을 열었을 때는 `window.open`이 진짜 팝업을 만들지 않고 그 WKWebView 자체를 통째로 이동시킨다** — opener/popup 관계가 아예 성립하지 않아 `postMessage`도, 그 뒤의 `setSession()` 호출도 실행되지 않는다. 리다이렉트된 URL에 토큰이 그대로 붙어 있는데도(주소창에는 안 보이지만 해시로) 아무도 읽지 않고 `/(tabs)`로 리다이렉트만 되어, 에러 없이 조용히 로그인이 안 된 상태로 남는다. 고침: `apps/mobile/src/data/supabase/auth.ts`에 `completeWebRedirectSignIn()`을 추가해, `auth-callback.tsx`가 마운트될 때(웹에서만) **자신의 URL에서 직접 토큰을 파싱해 `setSession()`을 호출**하는 fallback을 둔다 — 팝업이든 전체 페이지 이동이든 이 화면에 도달하기만 하면 항상 동작한다. 가짜 JWT로 실제 파싱→`setSession()` 호출까지 도달하는 것을 Playwright로 확인(Supabase가 `Invalid JWT structure`로 정상 거부하는 것까지 재현).
- **자동 동기화 트리거**(`apps/mobile/src/composition/container.ts`의 `runSync`/`scheduleSync`, "지금 동기화" 버튼 없음, 2026-08-11 도입): (1) 로그인 직후 즉시 1회 — 그때까지의 로컬 데이터를 서버로 마이그레이션하는 역할을 겸함, (2) 앱 실행 시 및 `AppState`가 `background|inactive → active`로 전환될 때마다(`_layout.tsx`) 즉시 1회 — 다른 기기의 변경분을 받아옴, (3) 습관/체크인 로컬 변경(`create`/`update`/`softDelete`) 직후 ≈1.5초 디바운스 후 1회 — `container.ts`가 `habitRepository`/`checkInRepository`를 Proxy로 감싸 트리거한다. 세 트리거 모두 같은 `runSync()`를 호출하며, `syncNow()`의 push는 애초에 `findPendingSync()`(로컬에서 아직 안 올라간 행) 기준이라 "언제 호출하든 밀린 것 전부 올라간다"가 그대로 성립한다. OS 레벨 백그라운드 실행(앱이 완전히 종료된 상태)은 범위 밖 — `expo-task-manager` 등 새 네이티브 모듈과 재빌드가 필요하고 iOS는 타이밍을 OS가 임의로 정해서 보장이 안 된다. `runSync`/`scheduleSync`를 별도 `features/sync/auto-sync.ts` 파일로 분리했다가, `container.ts`와 서로 import하는 순환 참조 때문에 Metro에서 `scheduleSync`가 조용히 미해결로 남아 동기화가 안 도는 버그가 있었다 — 지금처럼 한 파일에 같이 둔다.
- 동기화 실패(오프라인 등)는 조용히 무시한다 — 로컬 행은 `syncStatus: 'pending'`으로 남아 다음 트리거 때 재시도되므로, 에러 배너/재시도 UI를 따로 만들지 않았다([features.md](./features.md)의 "화려한 시각화보다 통계 계산의 신뢰도" 원칙).

### 5-4. 프로젝트 설정 — 완료됨(앱 소유자가 한 번만 하는 작업)

이 앱은 사용자가 각자 자기 Supabase 프로젝트를 연결하는 구조가 아니라, **이 앱을 배포하는 사람(개발자)이 만든 프로젝트 하나를 모든 설치본이 공유**한다(RLS로 사용자별 데이터 격리, §5-2). 아래는 그 프로젝트를 만들 때 한 번만 필요한 절차이고, 2026-08-11에 완료되어 URL/anon key가 `apps/mobile/src/constants/supabase.ts`에 고정되어 있다 — 새로 설치하는 사람은 이 절차를 반복할 필요 없이 Google로 로그인만 하면 된다.

1. [supabase.com](https://supabase.com)에서 무료 프로젝트 생성.
2. 프로젝트의 SQL Editor에 `docs/supabase-schema.sql` 전체를 붙여넣고 실행.
3. Authentication > Providers에서 Google 활성화 — Google Cloud Console에서 OAuth 클라이언트를 만들고 Client ID/Secret을 등록, Redirect URI는 Supabase가 제공하는 `https://<project>.supabase.co/auth/v1/callback`로 설정.
4. Authentication > URL Configuration에서 **Redirect URLs**에 앱의 콜백 주소를 추가(`Linking.createURL("auth-callback")`이 만드는 값 — 실제 빌드에서는 `habittracker://auth-callback`, Expo Go/Dev Client 개발 중엔 `exp://**` 와일드카드). 여기 등록돼 있지 않으면 로그인 후 앱으로 안 돌아오고 기본 Site URL로 리다이렉트되어 실패한다 — Site URL 자체는 와일드카드를 못 쓰므로 `habittracker://`로 바꿔두면 이 실패 케이스를 피할 수 있다. **웹 빌드(PWA)를 배포할 때마다 그 배포 도메인도 여기 추가해야 한다** — 예: Cloudflare Pages라면 `https://<project>.pages.dev/auth-callback`(또는 `https://<project>.pages.dev/**`). 안 해두면 Supabase가 요청된 `redirectTo`를 거부하고 기본 Site URL(네이티브용 `habittracker://…`)로 리다이렉트해버려, 웹 브라우저가 그 주소를 열지 못해 "유효하지 않은 주소" 에러가 뜬다.
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
