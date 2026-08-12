# 실행 로드맵

> 아키텍처는 [architecture.md](./architecture.md), 기능은 [features.md](./features.md), UX는 [ux-design.md](./ux-design.md) 참고

## 현재 진행 상황 (2026-07-29 기준)

아래 1~6단계는 모두 최소 1회 이상 구현·Android 에뮬레이터 검증까지 완료된 상태다. 이후 사용자 피드백을 반영해 DayStamps 참조 UI/UX 리디자인과 기능 확장을 여러 차례 반복했다.

**완료**
- 모노레포 스캐폴딩, 로컬 도메인 계층(Drizzle+SQLite), 핵심 체크인 루프, 백엔드(Fastify+Postgres) + 동기화 엔진 — 두 클라이언트 간 push/pull 왕복까지 실증 완료.
- 캘린더/통계 화면이 체크인 변경에 반응하지 않던 버그 수정(원인: 일회성 fetch → 모든 Repository에 `observeAll()`류 반응형 구독 도입).
- DayStamps 레퍼런스 기반 UI/UX 리디자인: 풀블리드 컬러 카드, 연결형 스탬프 월간 캘린더, 그룹(카테고리) 섹션, 습관 등록 폼 리디자인(컬러 박스 이름 입력·컬러 그리드·그룹 생성).
- 캘린더 월 이동 스와이프 전환, 오늘 화면 헤더 날짜로 임의 날짜 이동(모달), 습관 상세 캘린더의 탭-이동 후 탭-토글 인터랙션.
- 반복주기에 "월 n회" 추가, 리포트 화면(Weekly/Monthly/Yearly) 신규 구현 + 스와이프 이동 + Monthly/Yearly 습관별 카운트 + 오늘로 이동 FAB(습관 상세/Monthly 리포트/캘린더 탭).
- Noto Sans KR 폰트, 컬러 톤 정제, 데님/데님자켓 아이콘 추가.
- 캘린더 탭에 년/월 선택 모달(헤더 탭으로 특정 년/월 바로 이동) + 현재 월 기준 활성 습관별 체크인 카운트 목록 추가.
- 습관 보관(archive)/복구 기능: 수정 화면의 "보관하기" 버튼, 설정 > 관리 > 보관된 습관 화면(복구), 기존 `HabitRepository`의 `includeArchived` 필터를 그대로 재사용해 화면별 추가 필터링 없이 구현.
- iCloud(CloudKit) 동기화를 시도했다가 제거함 — CloudKit은 유료 Apple Developer Program 가입이 있어야만 컨테이너를 만들 수 있는데 가입 계획이 없어, 영구히 실행 불가능한 코드를 남겨두지 않기 위해 걷어냄(`CloudKitSyncGateway`/`expo-cloudkit` 의존성/설정 전부 삭제). 히스토리는 [architecture.md](./architecture.md) §5-0 참고.
- **Supabase 동기화**를 REST 백엔드와 병행하는 세 번째 `SyncGateway`로 추가(`SupabaseSyncGateway`, Postgres+Auth+RLS, Google 로그인) — CloudKit과 달리 iOS/Android/Web 어디서든 동작해 원래 목표(Android/Web 확장)에 더 잘 맞는다. 설계는 [architecture.md](./architecture.md) §5 참고. 스키마·RLS·LWW 충돌 해소 로직은 로컬 Postgres에 `auth.uid()` 스텁을 만들어 6가지 시나리오로 **실제 실행 검증**했고(CloudKit 때보다 강한 검증), Android 에뮬레이터에서 새 의존성 추가로 인한 회귀가 없음과 REST 동기화가 여전히 동작함을 확인했다. **실제 Supabase 프로젝트 연동(로그인 왕복)은 2026-08-11에 사용자가 직접 프로젝트를 만들어 검증 완료**(아래 "2026-08-11 업데이트" 참고) — 두 기기 간 동기화 왕복은 아직 미검증.

**아직 안 한 것 (v1 원래 범위 중 잔여)**: 체크인 메모 입력 UI, Journal 화면, 리마인더/알림 스케줄링 연결, 데이터 백업/복원, 온보딩, 습관 순서 드래그 정렬, iOS 실기기/시뮬레이터 재검증(현재까지 전부 Android 에뮬레이터 기준).

## 2026-08-11 업데이트: Supabase 실사용 전환 + 통계/리포트 통합

- **Supabase 동기화 실제 연동 완료**: 사용자가 무료 Supabase 프로젝트를 생성하고 `docs/supabase-schema.sql` 실행, Google Cloud Console에서 OAuth 클라이언트 등록, 앱에 프로젝트 URL/anon key 입력 후 Google 로그인까지 마쳤다. 이 과정에서 발견/수정한 두 가지:
  - Google 로그인 완료 후 앱으로 안 돌아오고 `localhost:3000`으로 튕기는 문제 — Supabase Authentication > URL Configuration의 **Redirect URLs** 허용 목록에 앱의 리다이렉트 주소(`exp://...`, 실제 배포 후엔 `habittracker://auth-callback`)가 등록되어 있지 않아서 기본 Site URL로 폴백되는 것이었다. 등록 후 해결.
  - 리다이렉트 후 "Unmatched Route" 에러 — `Linking.createURL("auth-callback")`이 가리키는 경로에 대응하는 화면이 없어서 Expo Router가 매칭 실패 화면을 띄운 것. `apps/mobile/src/app/auth-callback.tsx`를 추가해 즉시 홈으로 리다이렉트하도록 해결.
- **Expo Go 개발 환경 한계 발견 → 로컬 Dev Client로 전환**: 이 개발 머신의 Android 에뮬레이터에서 Expo Go 57.0.3은 앱 실행 즉시 Hermes VM이 SIGSEGV로 죽고(캐시된 57.0.2로 다운그레이드하면 회피 가능하나, 이번엔 `@react-native-async-storage/async-storage` 네이티브 모듈이 불안정해짐 — 두 Expo Go 빌드 모두 이 프로젝트 의존성과 미묘하게 안 맞음). 근본 해결책으로 `expo run:android`를 통해 이 프로젝트 전용 로컬 Dev Client를 빌드해 Expo Go를 완전히 대체했다 — 두 문제 모두 재발하지 않는다. 상세는 [architecture.md](./architecture.md) §5-4 참고.
- **습관 상세 화면에 Statistic 통계 복원 + 스트릭 개편**: 이전 세션에서 만들었다가 커밋되지 않아 유실됐던 "습관별 전체 체크인 통계" 기능을 DayStamps 참고 디자인 기준으로 재구현 — 이번주/이번달/올해/전체 4-타일(`getPeriodCounts`, `packages/core`)과 현재/최장 스트릭 카드에 날짜 범위 + RECORD 배지(`calculateStreak`의 `currentRange`/`longestRange` 확장) 추가.
- **통계 탭 + 리포트 화면 통합**: 아이콘·역할이 겹치던 `(tabs)/stats.tsx`와 `/report` 푸시 화면을 하나로 합쳤다. `통계` 탭 안에 `요약 | Weekly | Monthly | Yearly` 4개 세그먼트로 재구성 — 요약은 기존 통계 탭 내용(앱 전체 카운트 타일 + 습관별 완료율·스트릭 리스트) 그대로, 나머지 세 개는 기존 리포트 화면(카테고리별 그룹핑, 스와이프 이동, 오늘로 이동 FAB) 그대로 이식. 오늘 화면 헤더의 통계 아이콘도 이 화면으로 연결.

**사용자 액션 대기 중**: 없음 — Supabase 동기화까지 실제 검증 완료.

## 2026-08-11 업데이트 (2차): 동기화 단순화 — Google 로그인 단일화 + 자동 동기화 + REST 백엔드 제거

개인용으로 시작했지만 지인들도 같이 쓸 수 있게 배포할 계획이 확정되면서, 자체 서버 운영이 필요 없는 방향으로 동기화를 다시 단순화했다.

- **REST 백엔드 완전 제거**: `apps/backend`, `docker-compose.yml`, `RestSyncGateway`, `apps/mobile/scripts/verify-sync-engine.ts` 삭제. 히스토리는 [architecture.md](./architecture.md) §4 참고.
- **Supabase 프로젝트를 앱에 고정**: 프로젝트 URL/anon key를 `apps/mobile/src/constants/supabase.ts`에 하드코딩 — 사용자가 설정 화면에 값을 입력할 필요가 없어졌다. 이 앱을 설치하는 모두(개인+지인)가 같은 프로젝트를 공유하고, RLS가 Google 계정 기준으로 데이터를 격리한다.
- **설정 화면 단순화**: `사용 안 함/REST 백엔드/Supabase` 3단 선택과 URL/토큰 입력 필드, "지금 동기화" 버튼을 모두 없애고 "Google로 로그인" 버튼 하나만 남겼다.
- **자동 동기화 도입**(`composition/container.ts`의 `runSync`/`scheduleSync`): 로그인 직후(로컬 데이터 마이그레이션 겸용), 앱 실행/포그라운드 복귀 시, 습관·체크인 로컬 변경 후 ~1.5초 디바운스 — 이 세 트리거가 전부 같은 `runSync()`를 호출한다. 새 마이그레이션 알고리즘은 필요 없었다 — 로그인 전 로컬 데이터는 이미 `syncStatus: 'pending'`이라 `syncNow()`가 기존 로직 그대로 전부 밀어올린다. (처음엔 별도 `features/sync/auto-sync.ts` 파일로 분리했다가, `container.ts`와의 순환 참조 때문에 Metro에서 `scheduleSync`가 조용히 미해결 상태로 남는 버그가 있어 한 파일로 합쳤다.) 상세 설계는 [architecture.md](./architecture.md) §5-3 참고.

## 2026-08-11 버그 수정: 체크인 중복 생성 (레이스 컨디션)

실사용 중 "제라도 301EXX"(주 3회 목표) 습관이 "26/3"으로 표시되고, 체크된 날짜를 해제해도 가끔 반영되지 않는 문제가 보고됐다. Supabase 대시보드에서 해당 습관의 `check_ins` row를 날짜순으로 조회해보니, 특정 날짜(당시 테스트하던 날짜들)에 활성(`deleted_at is null`) row가 최대 19개까지 쌓여 있었고, 각 row의 `created_at`이 100~500ms 간격으로 촘촘히 몰려 있었다.

- **근본 원인**: `use-today.ts`와 습관 상세 캘린더(`habit/[id]/index.tsx`)의 체크인 토글이 `getByHabitAndDate`(읽기) → `create`/`softDelete`(쓰기) 두 단계로 구현돼 있었는데, 그 사이에 잠금이 없었다. 같은 (habit, date)에 대해 토글이 짧은 간격으로 두 번 이상 겹쳐 호출되면(연속 탭, 혹은 이번 세션 중 진행한 ADB 자동화 탭 테스트), 나중 호출이 앞선 호출의 `create()`가 커밋되기 전에 `getByHabitAndDate`를 실행해 "아직 없음"으로 오판하고 또 새 row를 만들었다. 해제 시에는 `getByHabitAndDate`가 `.limit(1)`이라 여러 활성 row 중 하나만 지워져, 나머지가 계속 "체크됨"으로 남았다.
- **수정**: `CheckInRepository`에 원자적 `toggle(habitId, date)` 메서드를 추가(`packages/core`의 인터페이스 + `LocalCheckInRepository` 구현)하고, 기존 두 호출부를 모두 이걸로 교체했다. `LocalCheckInRepository.toggle`은 (habitId, date) 키별 in-memory 락으로 겹치는 호출을 직렬화하고, 해제 시에는 활성 row를 전부(과거 레이스로 이미 쌓인 중복 포함) soft-delete하도록 만들어 자체 치유가 되게 했다. 더 이상 쓰이지 않게 된 `getByHabitAndDate`는 인터페이스/구현에서 함께 제거.
- **서버·로컬에 이미 쌓인 중복 데이터 정리**: 코드 수정만으로는 과거에 생긴 중복 row가 없어지지 않으므로, Supabase SQL Editor에서 실행한 정리 스크립트로 habit_id+date별 가장 먼저 생성된 row만 남기고 나머지를 soft-delete, `updated_at`을 갱신했다(사용자가 직접 실행·완료). LWW 규칙상 서버 `updated_at`이 더 최신이면 로컬을 덮어쓰므로, 각 기기가 다음 pull 때 자동으로 동일하게 정리된다 — 별도 로컬 정리 스크립트는 불필요했다.

## 2026-08-11 버그 수정: 캘린더 탭 요일 정렬 + 오늘 화면 날짜 스트립

emulator-5556(폰)에서 실사용 확인 중 캘린더 탭이 요일과 무관하게 그냥 왼쪽부터 6칸씩 채워지고 있고(요일 헤더도 없음), 오늘 화면 상단 날짜 스트립은 앱을 열면 항상 맨 왼쪽(과거 날짜)에 스크롤이 고정돼 있어 정작 "오늘"이 화면 밖으로 잘려 있는 문제가 보고됐다.

- **캘린더 탭** (`(tabs)/calendar.tsx`): 요일 헤더(일~토) 추가, `getDay(startOfMonth(month))`만큼 앞에 빈 칸을 넣어 1일이 실제 요일 칸에 오도록 수정, 6칸이 아닌 7칸(요일 수만큼)으로 그리드 재구성. 셀 크기를 `aspectRatio: 1`(퍼센트 너비와 flex-wrap 조합에서 신뢰할 수 없게 동작함이 확인됨 — 가로 151px/세로 116px로 실제 정사각형이 되지 않았다) 대신 `useWindowDimensions` 기준 정확한 픽셀 계산으로 변경. 이 계산을 `Math.floor` 없이 그대로 쓰면 7칸+6개 gap이 컨테이너 너비와 반올림 오차 없이 딱 맞아떨어져, Yoga가 셀 너비를 올림 처리하면서 7번째 칸(토요일)이 매번 다음 줄로 밀려나는 것도 함께 확인·수정(`Math.floor`로 여유 확보). 체크인 dot이 없는 날에도 숫자 위치가 흔들리지 않도록 `dotsRow`에 고정 높이(6) 부여.
- **오늘 화면 날짜 스트립** (`(tabs)/index.tsx`): 스트립이 항상 "오늘"로 끝나는 배열인데 `ScrollView`가 마운트 시 기본적으로 맨 왼쪽에 위치해 있어 오늘 칸이 화면 밖으로 밀려나 있었다. `ref` + `scrollToEnd({ animated: false })`를 마운트 시 1회 호출해 오늘이 항상 보이는 상태로 시작하도록 수정.

## 2026-08-11 버그 수정: 로그인해도 기존 데이터가 동기화되지 않음

emulator-5556에서 Google 로그인 후 "마지막 동기화" 시각은 갱신되는데 서버에 이미 있던 습관이 하나도 내려오지 않는 문제가 보고됐다.

- **근본 원인**: 로그아웃 상태에서도 앱 실행/포그라운드 복귀마다 `runSync()`가 돌고 있었는데, 이때 쓰이던 `NoopSyncGateway`는 실제로 아무것도 안 하면서도 `pull()`이 `serverTime: new Date().toISOString()`(현재 시각)을 반환했다. `runSync()`가 이 값을 그대로 `lastSyncedAt`에 저장해버려서, 로그인하기 직전까지도 `lastSyncedAt`이 계속 "지금"으로 최신화되고 있었다. 실제 로그인 후 첫 동기화가 `since = lastSyncedAt`(이미 최근 시각) 기준으로 `updated_at > since`만 pull하다 보니, 서버에 이미 있던 습관/체크인이 전부 필터링돼 걸러졌다.
- **수정**: `runSync()`가 로그아웃 상태면 `lastSyncedAt`을 전혀 건드리지 않고 즉시 반환하도록 변경(`composition/container.ts`) — "동기화 안 함"과 "지금 막 동기화함"을 더 이상 혼동하지 않는다. 더 이상 쓰이지 않는 `NoopSyncGateway`는 삭제.
- 이미 이 버그로 `lastSyncedAt`이 오염된 기기는 코드 수정만으로는 저절로 복구되지 않는다 — 로그아웃 후 재로그인해도 `lastSyncedAt`이 그대로 남아있으면 여전히 최근 시각 기준으로 pull하기 때문. emulator-5556은 실제 데이터가 없는 테스트 기기라 `pm clear`로 앱 데이터를 초기화해 검증했다.

위 수정 후 재로그인해보니 "마지막 동기화"는 갱신되고 습관 개수(`1/1`)도 맞는데 정작 카드가 하나도 안 보이는 **두 번째 문제**가 이어서 발견됐다:

- **근본 원인**: 기기의 로컬 SQLite를 직접 열어보니(`adb ... run-as ... cat files/SQLite/habit-tracker.db`), 동기화된 습관 "제라도 301EXX"는 `category_id`가 채워져 있는데 이 기기의 `categories` 테이블은 비어 있었다. 카테고리는 `SyncGateway`가 다루지 않는 로컬 전용 데이터라(§5), 습관의 `categoryId` 값 자체는 다른 필드처럼 그대로 동기화되지만 그 카테고리의 실체(이름/색)는 원래 기기에만 있다. `(tabs)/index.tsx`의 그룹핑 로직이 "로컬에 존재하는 카테고리와 매치되는 습관만" 그룹에 포함시키고 있어서, 매치 안 되는 습관은 `items.length`엔 잡히지만 어떤 그룹에도 안 들어가 화면에서 통째로 사라졌다.
- **수정**: 그룹핑 시 `categoryId`가 이 기기에 실재하는 카테고리를 가리킬 때만 그 카테고리 그룹으로 보내고, 아니면(카테고리 없음 또는 모르는 카테고리) "기본" 그룹으로 폴백하도록 변경 — 어떤 습관도 화면에서 사라지지 않는다.
- 위 그룹핑 폴백은 임시방편이었고, 사용자 피드백("사용자라면 이전에 저장된 상태 그대로 동기화되기를 기대할 것")에 따라 바로 아래 항목에서 카테고리 자체를 완전히 동기화하도록 확장했다.

## 2026-08-11 기능 추가: 카테고리 완전 동기화

`Category` 모델과 `LocalCategoryRepository`는 애초부터 `SyncableRepository`(findPendingSync/markSynced/applyRemoteChanges/applyRemoteDeletes)를 전부 구현해두고 있었지만 — 정작 `SyncGateway`/`SyncEngine`/Supabase 스키마 쪽에서 habits·checkIns 둘만 다루고 카테고리는 빠져 있어서 로컬 전용으로 남아 있었다(바로 위 항목의 버그가 그 결과). 이번에 세 번째 동기화 엔티티로 정식 편입했다.

- `packages/core`: `SyncChangeSet`에 `categories: EntityChangeSet<Category>` 추가(`emptySyncChangeSet`/zod 스키마 포함).
- `SyncEngine`(`apps/mobile/src/data/sync/sync-engine.ts`): 생성자가 `CategoryRepository`를 추가로 받고, habits/checkIns와 동일하게 pending 카테고리를 push하고 원격 변경분을 pull해 반영한다. pull 적용 순서는 **카테고리 → 습관 → 체크인** — 습관의 `categoryId`가 가리키는 카테고리가 그 습관 자체보다 먼저 로컬에 존재해야 오늘 화면 그룹핑이 첫 렌더부터 올바르게 되기 때문.
- `SupabaseSyncGateway`: `sync_upsert_categories` RPC 호출(push)과 `categories` 테이블 `.select()`(pull) 추가, `CategoryRow ↔ Category` 매핑.
- `docs/supabase-schema.sql`: `categories` 테이블(+ `user_id`/RLS/인덱스) 신설, `sync_upsert_categories` RPC를 `sync_upsert_habits`와 같은 LWW 패턴으로 추가. **기존에 이미 Supabase 프로젝트를 설정해둔 사용자는 이 SQL 파일 전체를 다시 한번 SQL Editor에서 실행해야 한다** — `if not exists`/`or replace`/`drop policy if exists` 위주라 재실행해도 안전하다.
- `composition/container.ts`: `categoryRepository`도 `habitRepository`/`checkInRepository`처럼 `withSyncTrigger`로 감싸 로컬 카테고리 생성/수정/보관이 자동으로 동기화를 예약하게 했다.
- 이미 로컬에 있던 카테고리들은 한 번도 push된 적이 없어 전부 `syncStatus: 'pending'`으로 남아 있었으므로, 이 배포 이후 첫 자동 동기화 때 별도 마이그레이션 없이 그대로 push된다.
- emulator-5556에서 재확인: "제라도 301EXX"가 원래 카테고리 이름/색 그대로 표시되는지까지 검증 필요(사용자 확인 대기).

**실제 배포 후 발견된 이슈 3가지와 해결**:

1. **PostgREST 스키마 캐시**: SQL을 실행해도 `sync_upsert_categories` RPC가 곧바로 `Could not find the function ... in the schema cache` 에러를 냈다 — 확인해보니 실제로는 함수가 생성되지 않은 상태였다(SQL Editor에서 파일 앞부분 실행 중 뭔가 중단됐던 것으로 추정). `select proname from pg_proc where proname = 'sync_upsert_categories'`로 직접 확인 후, 카테고리 관련 구문만 다시 실행해 해결 — 이후 `NOTIFY pgrst, 'reload schema'`는 필요 없었다(함수가 진짜로 없었을 뿐 캐시 문제가 아니었음).
2. **기존 기기의 워터마크가 새 엔티티보다 앞서 있는 문제**: 카테고리를 막 동기화 대상으로 편입한 시점에는, 카테고리의 `updated_at`이 (원래 로컬에서 만들어진) 예전 시각 그대로인데 기존에 계속 써오던 기기의 `lastSyncedAt`은 이미 그보다 훨씬 뒤로 진행돼 있다. 증분 pull(`updated_at > since`)은 이런 카테고리를 영원히 못 본다 — 새 엔티티 타입을 동기화 대상에 추가할 때마다 구조적으로 재발할 수 있는 문제. **로그인할 때마다 `lastSyncedAt`을 `null`로 리셋**하도록 `settings.tsx`의 `handleGoogleSignIn`을 고쳐서, 로그아웃 후 재로그인이 곧 "전체 재동기화" 버튼 역할을 하게 했다 — 이번에도 실제로 태블릿/폰 모두 로그아웃 후 재로그인으로 카테고리가 정상적으로 내려오는 것까지 확인했다.
3. **에뮬레이터 시계 오차로 인한 일시적 인증 실패**: 재로그인 직후 한 번 `JWT issued at future`(발급 시각이 서버 기준 미래로 인식됨) 에러로 동기화가 실패했다가, 곧바로 재시도(포그라운드 복귀)에서는 성공했다 — 에뮬레이터 시스템 시계의 일시적 오차로 추정되며 앱 코드 문제는 아니다. 기존에도 동기화 실패는 조용히 무시되고 다음 트리거 때 재시도되므로 별도 대응은 불필요.

**남은 후속 과제 → 해결됨**: 위에서 발견한 태블릿 로컬의 잔여 중복은, 서버(Supabase)의 현재 상태를 다시 진단해보니 실제로는 **서버가 이미 완전히 깨끗한 상태**(이 습관 기준 83개 row, 중복 0건)였고, 문제는 태블릿의 로컬 SQLite에만 남아있는 29개의 "가짜 synced" row였다 — `sync_status: 'synced'`로 표시돼 있지만 실제로는 서버에 존재하지 않는 row들로, 전부 이번 세션 테스트 중(2026-08-09~11) 생성됐다가 서버에서는 이미 정리됐지만 로컬에는 반영되지 않은 것들이었다(pull은 "서버가 준 변경분"만 반영할 뿐, 서버에 아예 없는 로컬 전용 row를 능동적으로 지우진 않으므로 발생 — sync 설계상 자연스러운 사각지대).

- 서버 진단 쿼리(`select id, date, deleted_at, ... from check_ins where habit_id = ...`) 결과와 태블릿 로컬 DB를 id 기준으로 직접 대조해, 로컬에만 있고 서버엔 없는 29개 row를 정확히 특정.
- 태블릿의 `habit-tracker.db` 파일을 꺼내 그 29개 row만 `deleted_at`을 채워 soft-delete한 뒤 다시 기기에 써넣는 방식으로 정리(사용자 승인 후 진행 — 자동 모드 안전장치가 로컬 DB 직접 수정을 1차 차단했으나, 무엇을 왜 하려는지 설명 후 명시적 허락을 받아 진행).
- 정리 후 태블릿에서 "제라도 301EXX"가 정상적으로 3/3 표시되는 것, 폰 쪽은 원래부터 중복이 없었던 것(서버와 84 vs 83으로 거의 일치, 날짜 중복 없음)까지 확인 완료.

## 2026-08-11 기능 추가: 오늘 화면 그룹·습관 드래그 재정렬

오늘 화면에서 그룹(카테고리) 순서와 그룹 내 습관 순서를 롱터치+드래그로 바꿀 수 있게 했다. `Habit`/`Category` 모델에는 이미 `sortOrder` 필드가 있었고 로컬 저장소의 `list()`가 이미 그 값으로 정렬하고 있었지만, 정작 사용자가 그 값을 바꿀 UI가 없었다.

- **`react-native-draggable-flatlist` 같은 서드파티 라이브러리를 새로 추가하지 않았다** — 이 프로젝트는 RN 0.86 + Reanimated 4(New Architecture)라는 최신 조합을 쓰고 있어서, 그 조합에 대한 호환성이 검증되지 않은 라이브러리를 들이는 리스크보다 이미 설치돼 있던 `react-native-gesture-handler`/`react-native-reanimated`(둘 다 `habit-card.tsx`의 체크 애니메이션 등에서 이미 쓰이고 있음) 위에 직접 만드는 쪽을 택했다. `apps/mobile/src/components/reorderable-list.tsx`에 범용 세로 드래그 재정렬 컴포넌트를 새로 구현 — 화면이 FlatList가 아니라 몇 개 섹션을 가진 단일 ScrollView 구조라 가벼운 자체 구현으로 충분했다.
- `Gesture.Pan().activateAfterLongPress(350)`으로 "롱터치 후 드래그"를 구현 — 일반 탭은 그대로 카드/헤더의 기존 `Pressable`/`Link`에 도달하고, 350ms 이상 누르고 있을 때만 드래그가 시작된다.
- 행마다 실제 높이를 `onLayout`으로 측정해 누적 오프셋을 계산 — 습관 카드(고정 높이)와 그룹 전체 블록(헤더+가변 개수의 카드, 접힘 여부에 따라 높이가 또 달라짐) 양쪽에 재사용하기 위해서다.
- 그룹을 드래그할 때 그 안의 습관 카드까지 같이 끌려오지 않도록, `renderItem`이 드래그 제스처를 직접 노출하는 render-prop 패턴(`DragHandle`)으로 설계 — 그룹은 헤더에만 제스처를 걸고, 습관 목록은 별도의 중첩된 `ReorderableList`로 각자 자기 카드에 제스처를 건다.
- **버그 1**: `GestureDetector must be used as a descendant of GestureHandlerRootView` — Expo Router가 이 프로젝트 버전에서는 루트를 자동으로 감싸주지 않았다. `app/_layout.tsx`에서 `GestureHandlerRootView`로 명시적으로 감싸 해결.
- **버그 2 (제스처가 중간에 멈추는 문제)**: `onEnd`에서만 커밋(잠금 해제 + 저장)을 하고 있었는데, `adb shell input draganddrop`으로 만든 합성 터치 이벤트가 정상적인 `onEnd`를 안 타고 취소되는 경우가 있어 드래그가 영원히 "잠긴" 채로 남았다(재시작 전까지 다른 갱신도 안 먹힘). 항상 호출되는 `onFinalize`로 커밋을 옮겨 해결.
- **버그 3 (가장 까다로웠던 것)**: 그룹을 재정렬해도 화면이 갱신되지 않고 이전 순서를 계속 보여줬다 — DB에는 새 순서가 정확히 저장되는데도 그랬다. 원인은 `ReorderableList`의 재동기화 로직이 "키 시퀀스가 같으면 아무것도 안 한다"였던 것: 그룹 자체의 key(카테고리 id)는 습관 순서가 바뀌어도 그대로이므로 "같다"고 판단해 그룹의 새 `items` 내용을 절대 안 받아들이고 있었다. 키 시퀀스는 로컬 상태 그대로 유지하되, 각 항목의 실제 객체는 항상 최신 `data`에서 다시 가져오도록 수정.
- 태블릿+폰 두 기기 모두에서 습관 재정렬/그룹 재정렬 각각 실기기(에뮬레이터) 드래그로 검증 — 재정렬 직후 화면 즉시 반영, DB에 정확한 `sortOrder` 저장, 앱 재시작 후에도 유지되는 것까지 확인. `sortOrder`는 다른 필드처럼 그대로 동기화되므로, 한 기기에서 재정렬하면 다른 기기에도 그 순서가 그대로 전파된다.

## 2026-08-11 기능 추가: 웹 빌드용 IndexedDB 저장소 (PWA 준비)

아이폰에서 Xcode 무료 서명(7일마다 재설치 필요)이 번거로워, PWA 방향을 검토하던 중 "로그인 필수로 하면 로컬 DB 자체가 필요 없지 않냐"는 질문이 나왔다가, 오프라인 사용이 실제로 필요하다는 결론으로 다시 로컬 우선(local-first) 구조를 웹에도 유지하기로 했다.

- 이 프로젝트는 Expo Router 기반이라 별도 웹앱 없이 `expo start --web`/`expo export -p web`으로 같은 코드베이스가 웹 빌드로 나온다. 웹엔 `expo-sqlite`가 없으므로 `apps/mobile/src/data/local/*-repository.web.ts` 세 개(habit/check-in/category)를 IndexedDB(`idb` 라이브러리) 기반으로 새로 구현 — Metro의 플랫폼별 파일 확장자 해석(`*.web.ts`가 웹에서 우선 매칭)을 이용해 `composition/container.ts`를 비롯한 기존 코드는 한 줄도 안 바꿨다. 상세 설계는 `docs/architecture.md` §3-4 참고.
- `SyncEngine`/`SyncGateway`/충돌 해소 로직은 저장소를 가리지 않게 이미 설계돼 있어서 100% 그대로 재사용 — 웹에서도 Supabase 로그인·자동 동기화가 그대로 동작한다.
- `_layout.tsx`가 SQLite 전용 `useMigrations`를 직접 부르지 않도록 `use-db-ready.ts`(네이티브)/`use-db-ready.web.ts`(웹)로 분리 — 웹 빌드가 Drizzle 마이그레이션 코드를 아예 번들하지 않게 했다.
- **검증**: 이 환경엔 GUI 브라우저가 없어서 Playwright+Chromium을 새로 설치해 헤드리스로 검증했다 — 습관 생성 → 체크인 토글 → 페이지 새로고침까지 실제 웹 페이지에서 수행하고, `indexedDB`를 직접 열어 새로고침 전후 데이터가 동일하게 남아있는 것을 확인. 오늘 화면 드래그 재정렬도 실제 마우스 이벤트(`mousedown` → 350ms 대기 → `mousemove` → `mouseup`)로 재현해 웹에서 동일하게 동작함을 확인했다.
- **이 검증 중 발견한 버그(플랫폼 무관, 안드로이드에도 있던 버그)**: `ReorderableList`의 제스처가 실제로 활성화 안 된 일반 탭에서도 `onFinalize`가 호출되면서 `onReorder`가 매번 실행되고 있었다 — 체크인 토글처럼 드래그와 무관한 탭마다 모든 습관의 `sortOrder`가 불필요하게 재저장되는 부작용이 있었다. IndexedDB 전후 스냅샷 비교로 습관의 `updatedAt`/`version`이 체크인 토글 때마다 같이 바뀌는 걸 보고 발견 — `onStart`에서만 세우는 `hasActivated` 플래그로 실제 드래그가 시작된 경우에만 커밋하도록 수정.
- 안드로이드 에뮬레이터에서도 재확인해 이번 변경으로 인한 회귀가 없는 것 확인.

## 2026-08-12 기능 추가: PWA 매니페스트 + 오프라인 앱 셸 캐싱

"제대로 된 앱처럼" 설치되게 해달라는 요청 — 위 IndexedDB 작업은 데이터 오프라인만 담당했고, 앱 코드 자체(HTML/JS/CSS)를 오프라인에서 불러오는 부분이 빠져 있었다.

- `src/app/+html.tsx`(신규) + `public/manifest.json`(신규): 홈 화면 설치, iOS Safari 전용 상태바/전체화면 메타 태그, 라이트/다크 `theme-color`. `app.json`의 `web.*` 필드는 이 export 방식에서 매니페스트를 생성해주지 않는 것을 확인해 `+html.tsx` 수동 오버라이드로 대체.
- `public/sw.js`(신규, 수동 작성 Service Worker): 같은 origin GET 요청을 캐시 우선으로 서빙하고 백그라운드로 갱신, 다른 origin(Supabase)은 그대로 통과. 상세는 `docs/architecture.md` §3-5 참고.
- **발견한 함정**: 최초 `register()` 호출 시점의 그 페이지 로드 자체는 SW가 아직 활성화되기 전이라 캐시되지 않는다 — install 단계에서 `/`를 미리 fetch해 그 안의 스크립트/스타일시트 URL까지 정규식으로 뽑아 사전 캐싱하지 않으면, 완전한 최초 방문 후 바로 오프라인으로 전환 시 셸 자체가 비어 로드에 실패했다. Playwright로 "온라인 최초 방문 → `setOffline(true)` → 새로고침"을 재현해 발견, 사전 캐싱 추가 후 재검증(오프라인 새로고침 스크린샷이 온라인 때와 동일).
- 앱 아이콘: 커스텀 브랜딩이 없어(iOS 네이티브도 Expo 기본 템플릿 아이콘 그대로) 기존 아이콘을 배경색(`#F9F8F6`)에 합성해 재사용. 커스텀 아이콘 디자인은 별도 작업으로 남김.

## 2026-08-12 배포: Cloudflare Pages + 웹 로그인 버그 수정

`expo export -p web`의 `dist/`를 실제로 Cloudflare Pages(`wrangler pages deploy`)에 배포하며 발견/해결한 것들.

- `/habit/[id]`, `/habit/[id]/edit`처럼 빌드 시점에 실제 ID를 알 수 없는 동적 라우트는 `dist/habit/[id].html` 같은 템플릿 파일로만 export된다. Cloudflare Pages는 존재하는 파일 경로가 없으면 404를 내므로, `apps/mobile/public/_redirects`에 `/habit/:id` → `/habit/[id].html` 200 규칙을 추가해 실제 습관 ID로 들어오는 딥링크/새로고침이 깨지지 않게 했다.
- **웹 로그인이 에러 없이 조용히 실패하는 버그 발견**: 배포 후 실제 iOS에서 (홈 화면에 설치한 PWA로) Google 로그인을 하면 팝업 완료 후 설정 화면이 계속 로그아웃 상태로 남았다. 원인은 standalone PWA 모드의 `window.open`이 진짜 팝업이 아니라 같은 WKWebView를 이동시켜버려서, `openAuthSessionAsync`의 팝업-완료 통지(`postMessage`) 경로 자체가 성립하지 않는 것. `auth-callback.tsx`에 웹 전용 fallback(URL에서 직접 토큰 파싱 후 `setSession()`)을 추가해 해결 — 상세는 `docs/architecture.md` §5-3.
- 그 전 단계에서 별도로 겪은 것(코드 문제 아님): Supabase Authentication의 Redirect URLs 허용 목록에 새 배포 도메인을 추가하지 않으면, Supabase가 기본 Site URL(네이티브용 `habittracker://…`)로 리다이렉트해버려 Safari가 "유효하지 않은 주소" 에러를 띄운다 — 배포 도메인을 추가해 해결.
- **실제 습관 데이터로 테스트해서야 드러난 today 화면 버그**: 로그인 성공 후 실제 계정 데이터(습관 여러 개)로 열어보니 상단 날짜 스트립이 짤리고, 목록이 스크롤 안 되고, 화면 맨 아래 흰 여백이 보이는 문제가 나왔다. 원인은 습관 목록 `ScrollView`에 높이 제약(`style`)이 없어 콘텐츠 전체 높이로 늘어나버린 것 하나였다 — 이제까지의 자동 테스트는 전부 "습관 0개" 빈 상태만 확인해서 놓쳤다. `style={{flex:1}}` 추가 + 날짜 스트립 `flexShrink:0`으로 해결, 가짜 습관 20개로 재현·검증. 상세는 `docs/architecture.md` §3-5.
- **웹에서 드래그 재정렬이 안 되던 문제 — 원인 3가지**: (1) `HabitCard`가 `<a href>`로 렌더링돼 Safari의 링크 관련 기본 동작들(롱프레스 미리보기, 탭 하이라이트 등)이 드래그와 충돌 → `Link asChild`를 걷어내고 `Pressable` + `router.push()`로 교체해 앵커 자체를 없앰. (2) `Gesture.Pan()`이 매 렌더 새로 만들어져 진행 중인 터치가 끊기던 문제 → `useMemo`로 안정화하고 콜백이 읽는 값은 `useSharedValue`로 교체(처음 `useRef`로 시도했으나 Reanimated 워클릿 경계를 침범해 예전 스냅샷만 돌려주는 문제가 있었음 — `adb logcat`의 워클릿 경고로 발견). (3) 스크롤 가능한 목록에서만 재현되던 문제(사용자가 "그룹 여러 개"가 아니라 "스크롤 필요 여부"라는 걸 직접 격리해준 게 결정적) → `react-native-gesture-handler`의 확인된 미해결 웹 이슈([#2622](https://github.com/software-mansion/react-native-gesture-handler/issues/2622))였다: 롱프레스 Pan 제스처가 스크롤 가능한 ScrollView 안에 있으면 웹 구현이 그 요소를 터치-스크롤 후보에서 마운트 시점에 아예 제외해버려서 타이밍을 아무리 손봐도(React state 버전, DOM 직접 조작 버전 둘 다 시도) 고칠 수 없었다. 최종 해결: 웹에서만 카드/헤더 전체가 아니라 오른쪽의 작은 전용 손잡이 아이콘만 드래그 영역으로 삼는다(대부분의 웹 정렬 라이브러리가 쓰는 표준 해법) — 네이티브는 기존처럼 카드/헤더 전체 롱프레스 유지. 안드로이드(`adb shell input draganddrop`)와 웹(Playwright) 양쪽 최종 검증 완료 — 상세는 `docs/architecture.md` §3-5.
- **위 수정들이 실기기에 안 보이는 문제 → Service Worker 캐시 버전 미변경이 원인**: `sw.js` 내용을 여러 번 고쳤는데도 실기기에서 계속 옛 버전처럼 동작해서 확인해보니, `CACHE_NAME`을 한 번도 안 올려서 브라우저가 `/sw.js`가 바이트 단위로 똑같다고 보고 새 버전을 설치조차 안 하고 있었다. `CACHE_NAME`을 `v1→v2`로 올려 강제 갱신시켰고, 겸사겸사 캐싱 전략도 바꿨다: 그동안 HTML 문서(내비게이션 요청)까지 캐시 우선이라 "배포해도 새로고침하면 계속 옛 화면"이 될 수 있는 구조였던 것 — 이제 문서는 네트워크 우선(오프라인일 때만 캐시 폴백)으로, 콘텐츠 해시가 붙는 정적 자산만 캐시 우선으로 유지한다. 앞으로 `sw.js`를 고칠 때는 매번 `CACHE_NAME`도 같이 올려야 한다는 걸 `docs/architecture.md` §3-5에 기록.
- **손잡이 드래그 도입 후 실기기에서 드러난 3가지 자잘한 버그**: (1) 오늘 화면 상단 날짜 스트립이 항상 오늘로 끝나야 하는데, 마운트 시점 `useEffect`에서 `scrollToEnd()`를 부르는 게 실제 콘텐츠 폭이 측정되기 전에 실행돼 짧게 스크롤되는 경우가 있었다 — `ScrollView`의 `onContentSizeChange`(콘텐츠 크기가 실제로 확정될 때 호출됨)로 옮겨 해결. (2) 드래그해서 놓으면, 손가락이 그 시점에 올라가 있는 **다른** 카드의 탭이 잘못 발동해 그 항목 상세 화면으로 들어가거나 체크인이 토글되는 문제 — 처음엔 웹만의 문제로 보고 웹에서만 가드를 걸었는데, 안드로이드 에뮬레이터에서도 같은 증상이 재현돼 네이티브에도 똑같이 적용했다(`markDragJustEnded`/`wasDragJustEnded`, ~400ms). (3) 재정렬 후 가끔 순서가 되돌아가는 느낌 — `persistFlatHabitOrder`가 매번 그룹의 **모든** 습관에 `sortOrder`를 다시 쓰면서 (바뀌지 않은 것까지) 각각 `await` 없이 쐈었다 — 실제로 바뀐 것만 쓰도록 하고 `Promise.all`로 전부 끝난 뒤 반환하도록 고쳤다(디바운스된 자동 동기화가 일부만 반영된 상태로 도는 걸 방지).
- **네이티브에서도 재현된 진짜 원인: 같은 항목을 연달아 두 번 드래그하면 옛 위치 기준으로 계산됨**: "1을 옮겨서 2,1,3,4가 된 직후, 1을 다시 드래그하면 이상하게 동작(1,2,3,4로 돌아가는 것처럼 보임)"으로 보고됐다. 원인: `handleStart`가 그 행의 시작 위치(`startOffsetY`)를 제스처가 마지막으로 다시 만들어졌을 때의 값으로 계속 참조하고 있었다 — 그 제스처는 `disabled` prop이 바뀔 때만(다른 행이 드래그를 시작/종료할 때) 다시 만들어지는데, 같은 행을 연달아 두 번 드래그하는 사이에 다른 행의 드래그가 끼지 않으면 이 재생성이 한 번도 안 일어나서, 두 번째 드래그가 **첫 번째 드래그가 있기 전의** 위치를 기준으로 계산됐다. `order`/`heights`와 같은 방식으로 `useSharedValue` + `useEffect`로 매 렌더 최신값을 동기화하도록 고쳤다. `adb shell input draganddrop`으로 "같은 항목 연속 두 번 드래그"를 재현·검증(짧은 duration은 롱프레스 활성화가 잘 안 돼서 재현 자체가 방해됐다 — 1.5초 이상으로 늘려야 안정적으로 재현/검증됨).
- **아이폰 PWA에서 "여러 칸 끌어도 한 칸만 이동"하던 문제 — 드래그 중 실제 배열/DOM을 재배치하던 게 원인**: 안드로이드에서는 이미 여러 칸 연속 이동이 되는 걸 확인했는데도 아이폰 PWA(손잡이 드래그)에서는 계속 한 칸씩만 옮겨졌다. 기존 구현은 임계값을 넘을 때마다 곧바로 실제 배열을 스플라이스해 DOM 자식 순서까지 매번 바꾸고 있었는데, iOS Safari는 터치 중인 요소의 DOM이 바뀌면 그 터치를 취소하는 것으로 알려져 있어 — 첫 재배치 직후 제스처가 끝나버리는 것과 정확히 들어맞는다(이 샌드박스에서 실기기로 직접 재현하진 못했고, 실제 웹 드래그 라이브러리들의 공통 패턴에 근거해 고쳤다 — 최종 확인은 사용자 실기기 테스트 필요). `reorderable-list.tsx`를 리팩터링해 드래그 중엔 실제 배열을 건드리지 않고 목표 위치(`dragToIndex`)만 기억하며, 사이에 낀 다른 행들은 `shiftY`로 시각적으로만 비켜서게 하고, 실제 스플라이스는 손을 뗄 때 한 번만 하도록 바꿨다. 안드로이드에서 리팩터링 전후로 다시 검증해 회귀 없음을 확인. 상세는 `docs/architecture.md` §3-5 11차.

## 2026-08-12 코드 리뷰 + Critical 수정: 동기화 시계 스큐, 카테고리 폴백 통계 누락

전체 코드베이스(동기화/데이터 계층, UI/제스처, `packages/core` 도메인 계층, 앱 셸/설정/PWA)를 4개 영역으로 나눠 리뷰했다. 전체 결과(Critical 3 / Major 12 / Minor·Nit 17)는 [code-review-2026-08-12.md](./code-review-2026-08-12.md) 참고. 이 중 Critical 3건 중 2건을 이번에 수정했다(나머지 하나는 저장소 관리 문제라 코드 변경 대상이 아니었음).

- **저장소 루트 `auth.md`에 평문 Google OAuth Client Secret**: git에 커밋된 적은 없었지만 `.gitignore` 대상도 아니어서 실수로 커밋될 위험이 있었다 — 사용자가 저장소 밖으로 즉시 이동해 해결.
- **`pull()`이 서버 시각이 아니라 클라이언트 시계를 워터마크로 반환**: `SupabaseSyncGateway.pull()`이 `new Date().toISOString()`(이 기기의 로컬 시계)을 `serverTime`으로 반환하고 있었는데, 이 값이 그대로 `lastSyncedAt`에 저장돼 다음 증분 pull의 기준이 된다. 이 기기의 시계가 실제보다 앞서 있으면(에뮬레이터 시계 오차로 "JWT issued at future" 에러를 겪은 사례가 이미 위에 기록돼 있을 만큼 실제로 발생하는 조건) `lastSyncedAt`이 미래 시각으로 오염되고, 이후 다른 기기가 실제 시각 기준으로 push한 변경분은 `updated_at > lastSyncedAt` 조건을 영원히 통과하지 못해 **그 기기의 시계가 그 미래 시각을 따라잡기 전까지 다시는 내려오지 않는다** — 에러 없이 조용히, 이 앱의 핵심 가치(다중 기기 동기화)가 깨지는 경로였다.
  - **수정**: Postgres의 `now()`를 반환하는 `sync_server_time()` RPC(`docs/supabase-schema.sql`, `security definer` + `search_path` 고정)를 추가하고, `pull()`이 이 RPC 호출 결과를 `serverTime`으로 쓰도록 변경(`apps/mobile/src/data/sync/supabase-sync-gateway.ts`).
  - **이미 Supabase 프로젝트를 설정해둔 사용자는 `docs/supabase-schema.sql` 전체를 SQL Editor에서 다시 실행해야 한다** — `create or replace function`이라 재실행해도 안전하고, 이 함수가 없으면 다음 `pull()` 호출이 즉시 실패한다.
- **Stats 리포트(Weekly/Monthly/Yearly)에서 로컬에 없는 카테고리를 가진 습관이 통째로 사라짐**: `features/reports/group-by-category.ts`의 `groupByCategory()`가 `categoryId`가 `null`일 때만 "기본" 그룹으로 폴백하고 있었다 — 값이 있지만 이 기기에 없는 카테고리(다른 기기에서 동기화된 카테고리)를 가리키면 어떤 그룹에도 들어가지 못했다. 이는 2026-08-11에 오늘 화면(`(tabs)/index.tsx`)에서 이미 한 번 발견·수정된 것과 정확히 같은 결함인데, 그 수정이 통계 화면이 쓰는 공용 함수에는 반영되지 않고 있었다(코드 주석에 "Today 화면은 자체 인라인 복사본을 씀, 이번 변경 범위 밖"이라 적혀 있어 알고도 전파가 안 된 상태였다).
  - **수정**: `groupByCategory()`가 `categories` 목록에 실재하는 카테고리일 때만 그 그룹으로 보내고, 아니면(없음/모르는 카테고리) "기본"으로 폴백하도록 오늘 화면과 동일한 로직으로 통일. 오늘 화면 쪽의 관련 주석("카테고리는 로컬 전용이라…")도 이미 사실이 아니게 된 지 오래라(2026-08-11 카테고리 완전 동기화 이후) 같이 정정했다.

**남은 것**: Major 12건(동기화 부분 실패 시 가짜 conflict 무한 반복, RPC 배치 전체 롤백, `check_ins` UNIQUE 제약 부재, `SECURITY DEFINER` 함수 3개 `search_path` 미고정, 스트릭 계산이 반복주기를 무시, `packages/core` 유닛 테스트 0개, 웹 빌드에서 `expo-secure-store`가 no-op이라 설정이 새로고침마다 초기화 등)와 Minor·Nit 17건은 아직 미착수 — 상세와 우선순위는 [code-review-2026-08-12.md](./code-review-2026-08-12.md) 참고.

## 구현 단계

1. ✅ **프로젝트 스캐폴딩**: pnpm workspace 초기화, `packages/core`(모델/인터페이스 정의), `apps/mobile`(Expo + expo-router 초기화). *(당시 함께 만든 `apps/backend`/`docker-compose.yml`은 2026-08-11에 제거 — architecture.md §4)*
2. ✅ **로컬 도메인 계층**: Drizzle 스키마(Habit/CheckIn/Category, 동기화 필드 포함) + 마이그레이션, LocalRepository 구현체, 반응형 `observe*()` 구독. *(Reminder는 스키마/모델만, 로컬 구현체는 아직 없음)*
3. ✅ **핵심 UI 루프**: 오늘 화면(체크인 애니메이션 포함) → 습관 추가/수정 폼 → 캘린더 뷰. 이 시점에 로컬 전용으로 "매일 쓸 수 있는" 앱이 완성됨. *(온보딩은 미구현으로 남음)*
4. **통계/Journal/설정/알림**: 통계 요약 화면과 설정 화면은 ✅ 완료. Journal 세그먼트·알림 스케줄링(`expo-notifications`)·데이터 백업/복원은 ❌ 아직 미구현.
5. ✅ **DayStamps 참조 리디자인 + 기능 확장** (v1.5, 반복 진행): UI/UX 리디자인, 그룹 기능, 반복주기 확장(월 n회), 통계 탭(요약 | Weekly | Monthly | Yearly 세그먼트로 통합) — 상세는 위 "현재 진행 상황"/"2026-08-11 업데이트" 참고.
6. ✅ **Supabase 동기화**: `SupabaseSyncGateway` + Google 로그인 구현·실제 프로젝트 연동·자동 동기화 트리거까지 완료. REST 백엔드는 최종적으로 걷어내고 이 경로 하나로 통합(위 "동기화 단순화" 참고).

## 검증 방법 (End-to-End)

- ✅ **로컬 전용 동작**: 습관 생성 → 체크인 → 앱 재시작 후 데이터 유지 확인(SQLite 영속성) → 캘린더/통계 숫자 정합성(수동 계산과 대조) — Android 에뮬레이터에서 확인.
- ❌ **알림**: 리마인더 스케줄링 자체가 아직 없어 검증 대상 아님(§ 위 "아직 안 한 것" 참고).
- ✅ **Supabase 동기화**: 로그인 시 마이그레이션, 로컬 변경 후 자동 push, 포그라운드 복귀 시 자동 pull — Android 에뮬레이터(태블릿+폰 두 대)에서 확인.
- ⏳ **iOS 검증**: Mac 환경이 없어 아직 수행하지 못함 — 향후 Mac 확보 시 최우선 재검증 대상.

## 향후 확장 (v2 이후, 참고용)

- Web(Next.js) 클라이언트 추가 — `packages/core`의 도메인 타입/Repository 인터페이스 재사용.
- iOS WidgetKit / Android 위젯 — 네이티브 확장 필요, RN만으로는 구현 불가.
- AI 습관 추천, Apple Watch/visionOS 연동, 체크인 사진 첨부, 통계 고도화.

이 항목들은 v1 범위 밖이며, v1 완료 및 검증 이후 별도 계획으로 다룬다.
