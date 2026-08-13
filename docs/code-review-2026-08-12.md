# 코드 리뷰 (2026-08-12)

> 아키텍처는 [architecture.md](./architecture.md), 진행 상황은 [roadmap.md](./roadmap.md) 참고.
> 이 문서는 특정 시점의 스냅샷이다 — 이후 코드가 바뀌면 여기 적힌 파일:라인이 어긋날 수 있다.

## 범위와 방법

`packages/core` 전체, `apps/mobile/src` 전체, `docs/supabase-schema.sql`, 설정/PWA 관련 파일을 4개 영역(동기화·데이터 계층 / UI·제스처·화면 / `packages/core` 도메인 계층 / 앱 셸·설정·PWA)으로 나눠 각각 독립적으로 검토했다. 이미 `architecture.md`/`roadmap.md`에 기록된 과거 버그 수정 이력은 재확인만 하고 새로 지적하지 않았다.

## 총평

아키텍처 설계 자체는 개인/지인용 앱 치고 상당히 탄탄하다 — 로컬 SQLite를 진실의 원천으로 두고 Repository 인터페이스 뒤로 동기화를 완전히 분리한 구조 덕에 REST 백엔드 → Supabase 전환이 도메인 코드 변경 없이 끝났고, 같은 설계 덕분에 네이티브/웹(IndexedDB) 저장소도 자연스럽게 공존한다. 드래그 재정렬 컴포넌트 하나에 11차례에 걸친 실기기 버그 수정 기록이나 "로그인해도 동기화 안 됨" 같은 실사용 버그를 근본 원인까지 추적해 고친 과정을 보면, 겉보기 기능이 아니라 실제로 굴러가는지를 계속 검증해온 흔적이 뚜렷하다.

다만 이번 리뷰에서는 바로 그 견고함이 새로 추가된 기능(카테고리 동기화, 웹 배포)에는 아직 고르게 전파되지 않은 지점들과, 순수 함수 계층에 테스트가 전혀 없어 조용히 남아있는 계산 버그가 주로 발견됐다.

**총 32건** — Critical 3 / Major 12 / Minor 11 / Nit 6.

---

## 🔴 Critical

### 1. 저장소 루트에 평문 Google OAuth Client Secret — ✅ 해결됨 (2026-08-12)

**파일**: `auth.md` (전체, git 미추적)

Google OAuth Client Secret과 Supabase URL/anon key가 마크다운 파일로 저장소 루트에 그대로 있었다. git에 커밋된 이력은 없었지만(`git log --all` 결과 없음) `.gitignore` 대상도 아니어서, 다음 `git add .` 한 번이면 그대로 영구히 커밋 히스토리에 남을 위험이 있었다.

클라이언트 코드(`signInWithGoogle`)는 PKCE 기반 `signInWithOAuth`만 쓰고 Client Secret을 전혀 참조하지 않는다 — 애초에 이 저장소에 있을 이유가 없는 값이었다. Supabase anon key는 설계상 공개돼도 안전(RLS로 보호, `constants/supabase.ts`에도 의도적으로 하드코딩)하지만 Client Secret은 진짜 비밀값이다.

**조치**: 사용자가 파일을 저장소 밖으로 이동. Client Secret 로테이션은 별도 권장 사항으로 남음(평문으로 로컬에 존재했던 이력이 있어 완전히 무해하다고 단정할 수는 없음).

### 2. `pull()` 워터마크가 서버 시각이 아니라 클라이언트 시계 — ✅ 해결됨 (2026-08-12)

**파일**: `apps/mobile/src/data/sync/supabase-sync-gateway.ts:168` · `composition/container.ts:87`

`pull()`이 `serverTime: new Date().toISOString()`으로 로컬 기기 시계를 반환하고, 이 값이 그대로 다음 증분 pull의 기준(`lastSyncedAt`)이 됐다.

이 기기의 시계가 실제보다 앞서 있으면(로드맵에 이미 "에뮬레이터 시계 오차로 JWT issued at future" 사례가 기록될 만큼 실제로 발생하는 조건) `lastSyncedAt`이 미래 시각으로 저장된다. 이후 다른 기기가 실제 시각 기준으로 push한 변경분은 `updated_at > lastSyncedAt` 조건을 영원히 통과하지 못해 **그 기기의 시계가 그 미래 시각을 따라잡기 전까지 다시는 내려오지 않는다** — 이 앱의 핵심 가치(다중 기기 동기화)가 에러 없이 조용히 깨지는 경로였다.

**조치**: Postgres `now()`를 반환하는 `sync_server_time()` RPC를 추가(`docs/supabase-schema.sql`, `security definer` + `search_path` 고정)하고, `pull()`이 이 RPC 결과를 `serverTime`으로 사용하도록 변경. **기존 Supabase 프로젝트는 `docs/supabase-schema.sql` 전체를 SQL Editor에서 재실행해야 이 함수가 생기고, 재실행 전까지는 `pull()`이 실패한다.**

### 3. Stats 리포트에서 로컬에 없는 카테고리를 가진 습관이 통째로 사라짐 — ✅ 해결됨 (2026-08-12)

**파일**: `apps/mobile/src/features/reports/group-by-category.ts:22-38`

통계 탭(Weekly/Monthly/Yearly)이 쓰는 `groupByCategory()`는 `categoryId`가 **null일 때만** "기본" 그룹으로 폴백했다. 값이 있지만 이 기기에 없는 카테고리(다른 기기에서 동기화된 카테고리)를 가리키면 그 습관은 어떤 그룹에도 들어가지 못하고 조용히 빠졌다.

이건 2026-08-11에 `(tabs)/index.tsx`에서 정확히 같은 시나리오로 발견·수정된 버그와 동일한 결함인데, 그 수정이 이 공용 함수에는 반영되지 않았다 — 코드 주석에 "Today 화면은 자체 인라인 복사본을 씀(이번 변경 범위 밖)"이라고 적혀 있어 알고도 전파가 안 된 것으로 보인다.

**조치**: `groupByCategory()`가 `categories` 목록에 실재하는 카테고리일 때만 그 그룹으로 보내고 아니면 "기본"으로 폴백하도록 오늘 화면과 동일한 로직으로 통일. 오늘 화면의 관련 주석("카테고리는 로컬 전용")도 2026-08-11 카테고리 완전 동기화 이후 사실이 아니게 됐던 것을 함께 정정.

---

## 🟠 Major

### 동기화 / 데이터 계층

- **push() 부분 실패 시 이미 성공한 행이 "가짜 conflict"로 영구 고착** (`supabase-sync-gateway.ts:124-152`, `sync-engine.ts:38-44`) — ✅ **해결됨 (2026-08-13)**. habits/checkIns/categories 세 RPC를 순차 호출하다 하나가 실패하면 즉시 throw돼, 앞서 성공한 RPC는 서버엔 반영됐지만 로컬은 `pending`으로 남았다. `SyncPushResult`에 `failedIds`(해당 엔티티 타입의 RPC 자체가 실패해 LWW 평가도 못 받은 id)를 추가해 `conflicts`(서버가 실제로 거부한 id)와 구분하고, `push()`가 각 RPC 에러를 개별 catch해 더 이상 throw하지 않도록 변경 — 한 엔티티 타입이 실패해도 나머지는 정상 markSynced된다. 부수 효과로 push 부분 실패가 더 이상 pull() 실행 자체를 막지 않는다.
- **RPC 배치 한 행의 오류가 전체 배치를 롤백** (`supabase-schema.sql`의 `sync_upsert_*` 세 함수) — ✅ **해결됨 (2026-08-13)**. 함수 본문 전체가 암묵적 트랜잭션이라, 배치 중 한 행이라도 캐스팅 실패하면 같은 배치의 정상 행까지 통째로 롤백되고 있었다. 세 함수 모두 행 단위 insert를 `begin/exception when others` 블록으로 감싸 개별 행 오류가 배치 전체를 막지 않도록 수정(디버깅용 `raise warning` 포함).
- **`check_ins`에 (habit_id, date) UNIQUE 제약이 실제로는 없음** (`schema.ts:69-73`, `supabase-schema.sql:25-39`) — ✅ **해결됨 (2026-08-12)**. architecture.md가 스스로 명시한 원칙("`UNIQUE(habitId, date) WHERE deletedAt IS NULL`")과 실제 구현이 어긋났었다. Postgres/SQLite 양쪽에 partial unique index를 추가하고, 기존에 쌓여있을 수 있는 중복은 정리 후 인덱스를 생성하도록 마이그레이션/스키마에 포함했다. 단순 추가만 하면 두 기기가 오프라인에서 같은 날 독립 체크인 후 동기화될 때 push가 실패하며 배치 전체가 막힐 수 있어, `sync_upsert_check_ins`의 예외 처리와 로컬 `applyRemoteChanges`의 충돌 병합(노트/사진/값을 잃지 않고 서버 쪽을 정본으로 병합)도 함께 구현했다. 상세는 roadmap.md 참고.
- **`SECURITY DEFINER` RPC 3개에 `search_path` 미고정** (`supabase-schema.sql:85, 129, 168`) — ✅ **해결됨 (2026-08-13)**. Postgres/Supabase의 잘 알려진 search_path 하이재킹 패턴, Supabase Security Advisor가 "Function Search Path Mutable"로 표시하는 항목이었다. `sync_upsert_habits`/`sync_upsert_check_ins`/`sync_upsert_categories` 세 함수 모두에 `search_path = public, pg_temp` 고정 — `sync_server_time()`에 이미 적용했던 패턴을 확장.

### 도메인 계층 (`packages/core`)

- **스트릭 계산이 반복주기(frequencyType)를 전혀 모른다** (`calculate-streak.ts:36-76`) — ✅ **해결됨 (2026-08-12)**. 순수 달력일 연속성만으로 스트릭을 판정해서, weekdays/timesPerWeek/timesPerMonth 습관(4종 중 3종)은 정상적으로 쉬는 날도 전부 단절로 처리되고 있었다 — 실제 기기 데이터로 확인한 결과 한 습관의 스트릭이 2일→25일로 바뀔 만큼 실질적인 오차였다. weekdays는 지정 요일만 필수로 요구하고, timesPerWeek/timesPerMonth는 완전히 지난 기간이 목표 미달일 때만 끊기도록 재구현. 22개 유닛 테스트 추가.
- **`frequencyConfig`가 `frequencyType`과 교차 검증되지 않음** (`habit.ts:7-26`, `habit-form.tsx:68-82`) — `frequencyType: "weekdays"`에 `weekdays: []`가 zod 검증도, UI의 `canSubmit`도 통과해 "0/0" 진행률의 영구 체크 불가 습관이 만들어질 수 있다.
- **기간 카운트가 미래 날짜를 걸러내지 않음** (`period-counts.ts:29-33`) — `date <= today` 상한이 없어, 기기 시계 오차로 미래 날짜 체크인이 섞이면 "이번 주/이번 달/올해" 타일이 부풀려질 수 있다.
- **`packages/core`에 유닛 테스트가 0개** — ✅ **해결됨 (2026-08-12)**. `calculate-streak.ts`/`period-counts.ts`는 주석에서 스스로 "pure, trivially testable"이라 밝히면서도 테스트가 없었다. Vitest를 도입하고 두 파일에 27개 테스트를 추가 — 위 스트릭 Major 항목은 실제로 이 테스트를 먼저 작성하며 구현했다. `packages/core` 전체의 다른 함수까지 포괄하는 것은 아니라 완전한 커버리지는 아님.
- **정량 습관 `value`에 하한 없음** (`check-in.ts:16`) — 음수를 그대로 허용.

### UI / 앱 셸

- **여러 지점에서 DB 쓰기 실패가 조용히 삼켜짐** (`habit-card.tsx:37-41`, `(tabs)/index.tsx:132-142`, `habit-form.tsx:70-94`) — 체크인 토글, 재정렬 저장, 그룹 생성, 습관 저장 모두 실패 시 사용자 피드백이 없다.
- **웹 빌드에서 `expo-secure-store`가 사실상 no-op** (`state/settings-store.ts:5-13`) — ✅ **해결됨 (2026-08-13)**. 웹 구현이 `export default {}`라, `colorSchemePreference`/`lastSyncedAt`/`defaultGroupSortOrder`가 새로고침마다 초기화되고 있었다. Supabase 세션과 같은 이유로 `@react-native-async-storage/async-storage`로 교체(이 스토어의 필드는 전부 비밀값이 아니라 SecureStore가 애초에 불필요했음) — 이제 `expo-secure-store`는 코드베이스 어디에서도 안 쓰여서 의존성/app.json plugin에서 완전히 제거. Playwright로 웹에서 새로고침 후에도 설정이 유지되는 것을 확인.
- **로그아웃 흐름에 에러 처리·로딩 상태 부재** (`(tabs)/settings.tsx:54-56`) — `handleGoogleSignIn`과 비대칭. 실패 시 조용히 로그인 상태로 착각할 수 있고 중복 클릭 방지도 없다.

---

## 🟡 Minor

- **`markSynced`의 `syncedAt` 인자가 완전히 무시됨** (`habit/category/check-in-repository.ts` 및 각 `.web.ts`) — SyncEngine이 힘들게 실어 나르는 값을 최종 소비처가 없다.
- **`toggleLocks` 맵이 절대 비워지지 않음** (`check-in-repository.ts:22, 42-45`) — (habitId, date) 조합마다 항목이 쌓이기만 함. 실질적 메모리 영향은 작음.
- **`categories` 테이블 주석이 실제 동작과 모순** (`schema.ts:32`) — "local-only"라 적혀 있지만 2026-08-11부터 실제로 세 번째 동기화 엔티티다.
- **로컬 LWW 비교 경계값이 서버와 다름** (`applyRemoteChanges` 계열, `>=` vs 서버의 `<`) — 동률 상황이 드물어 실질 위험은 낮지만 기준을 통일하는 게 안전.
- **`version` 필드가 문서 의도와 달리 실제 계약상 미사용** (`base.ts:23`) — "낙관적 동시성" 용도라 문서화돼 있지만 어디서도 버전 비교를 하지 않는다. 실제 충돌 해소는 전부 `updated_at` LWW.
- **`date` 정규식이 달력상 무효한 날짜를 통과** (`check-in.ts:11`) — `"2026-13-45"`도 통과, `addDays()`의 오버플로 정규화로 스트릭 계산이 조용히 오염될 수 있음.
- **`icon`/`color`/`reminder.daysOfWeek`에 값 제약 없음** (`habit.ts:19-20`, `category.ts:6`, `reminder.ts:8`) — 자유 문자열/빈 배열이 그대로 통과.
- **헤더 날짜가 타임존에 따라 하루 어긋날 수 있음** (`(tabs)/index.tsx:144`) — `new Date(viewedDate)` 재파싱이 UTC 자정 기준이라, UTC보다 뒤처진 타임존에서 하루 전으로 보일 수 있음. 한국(UTC+9)에선 드러나지 않음.
- **접근성 라벨 누락** (`habit-card.tsx:53-93`, `(tabs)/index.tsx:258-266`) — 카드 바깥 영역/배지/그룹 헤더에 accessibilityRole·Label·State 없음.
- **`reorderable-list` — 드래그 중 동기화로 항목이 사라지는 경우 가드 없음** (`reorderable-list.tsx:96-117, 129-144`) — 발생 확률은 낮음.
- **`.gitignore` 커버리지 부족** — `apps/mobile/.env`는 있지만 `*.pem`, `.env.local` 계열, 임의 문서 패턴이 없음. auth.md 사고 재발 방지 차원에서 보강 권장.

## 🟡 Nit

- **`calculate-streak.ts` — `Set` 중복 생성** (37, 61행) — 이미 dedup된 배열을 다시 감쌈. 동작엔 무해.
- **성능 — 불필요한 리렌더 유발 패턴** (`use-today.ts:75-100`, `reorderable-list.tsx:180`) — 지금 규모(개인용)에선 체감 문제 없을 가능성 높음.
- **`archive.tsx` — `useMemo` 없는 파생 계산** (20-21행) — 스타일 통일성 차원.
- **`sw.js` 사전 캐싱이 Expo 내부 경로 규칙에 암묵적으로 결합** (16행) — 지금은 정상 동작, fragile한 지점.
- **`_layout.tsx` — 자동 동기화가 DB ready 체크보다 먼저 호출될 가능성** (39-48행) — sync-engine 쪽 방어 여부 교차 확인 필요.
- **`apps/backend` 로컬 잔재물** — node_modules만 남아있고 git엔 아무것도 트래킹돼 있지 않음. 저장소 관점에선 무해, 로컬 정리는 선택사항.

---

## ✓ 잘 되어 있는 점

- **동기화 이식성 설계** — Repository/SyncGateway 인터페이스 분리 덕에 REST 백엔드 → Supabase 전환이 도메인 코드 변경 없이 끝났고, 웹 IndexedDB 저장소도 같은 인터페이스로 자연스럽게 붙었다.
- **순수 도메인 계층** — `packages/core`가 실제로 RN/DB 어떤 것도 import하지 않는 순수 TypeScript로 유지되고 있다. zod 스키마, `strict` + `noUncheckedIndexedAccess` tsconfig 적용도 견고하다.
- **RLS 설계** — habits/check_ins/categories 전부 `user_id = auth.uid()` 격리, LWW 충돌 해소를 서버 RPC로 원자적 처리한 것도 평범한 `.upsert()`보다 견고한 선택.
- **실사용 기반 디버깅 습관** — 체크인 중복 생성 레이스, 로그아웃 시 `lastSyncedAt` 오염, 드래그 재정렬 11차 수정 등 실기기·실데이터로 근본 원인까지 추적해 고친 기록이 문서에 상세히 남아있다.
- **PWA 오프라인 지원** — 네비게이션은 네트워크 우선, 정적 자산은 캐시 우선으로 나눈 Service Worker 전략과 그 과정에서 겪은 함정까지 문서화된 점.

---

## 권장 우선순위

1. ~~`auth.md` 저장소 밖으로 이동~~ — ✅ 완료
2. ~~`pull()` 워터마크를 서버 시각 기준으로 교체~~ — ✅ 완료 (Supabase 프로젝트에 `supabase-schema.sql` 재실행 필요)
3. ~~`group-by-category.ts`의 카테고리 폴백 로직 통일~~ — ✅ 완료
4. ~~calculate-streak / period-counts에 유닛 테스트 추가 후 frequencyType 반영~~ — ✅ 완료 (2026-08-12)
5. ~~`check_ins`에 partial unique index 추가~~ — ✅ 완료 (2026-08-12, Supabase 프로젝트에 `supabase-schema.sql` 재실행 완료)
6. ~~동기화 부분 실패 시 가짜 conflict 방지~~ — ✅ 완료 (2026-08-13)
7. ~~RPC 배치 한 행 오류가 전체 배치를 롤백~~ — ✅ 완료 (2026-08-13)
8. ~~`SECURITY DEFINER` 함수 3개(`sync_upsert_habits/check_ins/categories`)에 `search_path` 고정~~ — ✅ 완료 (2026-08-13, Supabase 프로젝트에 `supabase-schema.sql` 재실행 필요)
9. ~~웹 빌드에서 `expo-secure-store` no-op~~ — ✅ 완료 (2026-08-13, AsyncStorage로 교체)
10. **`frequencyConfig`가 `frequencyType`과 교차 검증되지 않음** — `weekdays: []` 같은 상태로 영구 체크 불가 습관이 만들어질 수 있음
11. **여러 지점에서 DB 쓰기 실패가 조용히 삼켜짐**
