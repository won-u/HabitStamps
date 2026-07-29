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

**아직 안 한 것 (v1 원래 범위 중 잔여)**: 체크인 메모 입력 UI, Journal 화면, 리마인더/알림 스케줄링 연결, 데이터 백업/복원, 온보딩, 습관 순서 드래그 정렬, iOS 실기기/시뮬레이터 재검증(현재까지 전부 Android 에뮬레이터 기준).

**다음에 정리하면 좋을 것**: 통계 탭과 리포트 화면 경로 통합([ux-design.md](./ux-design.md) §7).

## 구현 단계

1. ✅ **프로젝트 스캐폴딩**: pnpm workspace 초기화, `packages/core`(모델/인터페이스 정의), `apps/mobile`(Expo + expo-router 초기화), `apps/backend`(Fastify 초기화), 루트 `docker-compose.yml`.
2. ✅ **로컬 도메인 계층**: Drizzle 스키마(Habit/CheckIn/Category, 동기화 필드 포함) + 마이그레이션, LocalRepository 구현체, 반응형 `observe*()` 구독. *(Reminder는 스키마/모델만, 로컬 구현체는 아직 없음)*
3. ✅ **핵심 UI 루프**: 오늘 화면(체크인 애니메이션 포함) → 습관 추가/수정 폼 → 캘린더 뷰. 이 시점에 로컬 전용으로 "매일 쓸 수 있는" 앱이 완성됨. *(온보딩은 미구현으로 남음)*
4. **통계/Journal/설정/알림**: 통계 요약 화면과 설정 화면은 ✅ 완료. Journal 세그먼트·알림 스케줄링(`expo-notifications`)·데이터 백업/복원은 ❌ 아직 미구현.
5. ✅ **백엔드 모듈**: `apps/backend` 라우트(`/habits`, `/checkins`, `/sync/push`, `/sync/pull`) 구현, Drizzle+Postgres 스키마/마이그레이션, 인증 플러그인(고정 토큰).
6. ✅ **동기화 연결**: `RestSyncGateway`/`SyncEngine` 구현, 설정 화면에 Developer 섹션 추가, 로컬 검증 절차 수행(architecture.md 4-5) — Android 에뮬레이터 기준 두 클라이언트 간 push/pull 왕복 확인 완료.
7. ✅ **DayStamps 참조 리디자인 + 기능 확장** (v1.5, 반복 진행): UI/UX 리디자인, 그룹 기능, 반복주기 확장(월 n회), 리포트 화면(Weekly/Monthly/Yearly + 스와이프 + 카운트 + 오늘로 이동 FAB) — 상세는 위 "현재 진행 상황" 참고.

## 검증 방법 (End-to-End)

- ✅ **로컬 전용 동작**: 습관 생성 → 체크인 → 앱 재시작 후 데이터 유지 확인(SQLite 영속성) → 캘린더/통계 숫자 정합성(수동 계산과 대조) — Android 에뮬레이터에서 확인.
- ❌ **알림**: 리마인더 스케줄링 자체가 아직 없어 검증 대상 아님(§ 위 "아직 안 한 것" 참고).
- ✅ **백엔드 단독**: `docker compose up -d` 후 `curl`로 CRUD/sync 엔드포인트 직접 호출해 응답 스키마 확인.
- ✅ **엔드투엔드 동기화**: architecture.md 4-5절의 9단계 절차(두 클라이언트 간 push/pull 왕복)를 독립 Node 스크립트와 실제 앱 UI 양쪽으로 수행, 통과 확인.
- ⏳ **iOS 검증**: Mac 환경이 없어 아직 수행하지 못함 — 향후 Mac 확보 시 최우선 재검증 대상.

## 향후 확장 (v2 이후, 참고용)

- 실사용자 인증(계정 시스템)을 포함한 프로덕션 동기화로 전환 (`plugins/auth.ts`의 고정 토큰 → JWT/OAuth 교체).
- Web(Next.js) 클라이언트 추가 — `packages/core`의 도메인 타입/Repository 인터페이스 재사용.
- iOS WidgetKit / Android 위젯 — 네이티브 확장 필요, RN만으로는 구현 불가.
- AI 습관 추천, Apple Watch/visionOS 연동, 체크인 사진 첨부, 통계 고도화.

이 항목들은 v1 범위 밖이며, v1 완료 및 검증 이후 별도 계획으로 다룬다.
