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
