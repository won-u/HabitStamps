# 개발 가이드 — 빌드·배포·Supabase 운영

`docs/architecture.md`가 "왜 이렇게 만들었는지"를 설명한다면, 이 문서는 "지금 이 상태에서 실제로 뭘 어떻게 실행하는지"를 다룬다. 안드로이드 에뮬레이터 빌드, 웹 빌드+Cloudflare Pages 배포, Supabase 프로젝트 운영을 순서대로 정리했다.

## 목차

- [안드로이드 에뮬레이터 빌드·설치](#안드로이드-에뮬레이터-빌드설치)
- [웹 빌드 + Cloudflare Pages 배포](#웹-빌드--cloudflare-pages-배포)
- [Supabase 운영 가이드](#supabase-운영-가이드)
- [자주 겪는 문제 체크리스트](#자주-겪는-문제-체크리스트)

---

## 안드로이드 에뮬레이터 빌드·설치

이 프로젝트는 Expo Go 대신 **로컬 Dev Client**를 쓴다(`docs/architecture.md` §5-5 — Expo Go 57.0.3이 이 에뮬레이터에서 즉시 크래시하고, 캐시된 구버전은 AsyncStorage 네이티브 모듈이 불안정해짐).

### 정상 경로: `expo run:android`

```bash
export ANDROID_HOME=/home/wonu/.local/android-sdk
export PATH="$ANDROID_HOME/platform-tools:$PATH"

cd apps/mobile
adb devices                      # 에뮬레이터가 떠 있는지 먼저 확인
npx expo run:android --device <이름>
```

`ANDROID_HOME`은 셸을 새로 열 때마다 다시 export해야 한다(이 값을 영구히 넣어두려면 `~/.bashrc`/`~/.zshrc`에 추가). `adb devices`로 보이는 이름 그대로 `--device`에 넘기면 되는 게 보통이지만, 이 환경에서는 아래 문제 때문에 **거의 항상 실패한다**.

### 알려진 문제: `--device`가 항상 "Could not find device with name" 에러를 냄

**원인**: `expo run:android --device <이름>`은 내부적으로 각 에뮬레이터의 "친숙한 이름"(AVD 이름, 예: `Pixel_10_Pro`)을 알아내려고 `adb -s <serial> emu avd name`(에뮬레이터 콘솔 프로토콜)을 호출한다. 이 환경의 에뮬레이터는 `ubuntu`라는 다른 유닉스 계정으로 떠 있는데, 콘솔 인증 토큰은 **호출하는 쪽(현재 로그인된 사용자)의 홈 디렉터리**에서 읽어오기 때문에 인증이 항상 실패한다. `adb devices`/`adb install`/`adb shell` 등 일반 ADB 프로토콜은 이 인증이 필요 없어서 멀쩡히 동작하지만, `expo` CLI의 기기 이름 조회만 안 된다 — 그래서 `emulator-5556`으로 넣어도, 실제 AVD 이름(`Pixel_10_Pro`)으로 넣어도 똑같이 실패한다. 이건 **이 환경 자체의 구조적 문제라 고칠 수 없다** — `--device` 없이 실행해도(인터랙티브 기기 선택 프롬프트) 같은 조회 로직을 타서 마찬가지다.

**해결: Gradle로 직접 빌드 + adb로 직접 설치.** `expo run:android`가 내부적으로 하는 일(빌드 → 설치 → Metro 시작 → 앱 실행)을 그대로 수동으로 하면 된다.

```bash
export ANDROID_HOME=/home/wonu/.local/android-sdk
export PATH="$ANDROID_HOME/platform-tools:$PATH"

# 1. 빌드 (최초 빌드는 몇 분 걸림, 이후는 캐시로 빨라짐)
cd apps/mobile/android
./gradlew assembleDebug

# 2. 설치
adb -s emulator-5556 install -r app/build/outputs/apk/debug/app-debug.apk

# 3. 실행 (기존 프로세스가 있으면 먼저 종료)
adb -s emulator-5556 shell am force-stop com.ianwon.habittracker
adb -s emulator-5556 shell am start -n com.ianwon.habittracker/.MainActivity
```

디버그 빌드는 JS를 번들 안에 안 담고 Metro 개발 서버에서 받아온다 — Metro가 이미 떠 있어야 한다(`npx expo start` 또는 이미 실행 중인 다른 프로세스). 포트가 이미 점유돼 있으면(`Port 8081 is running this app in another window`) 새로 띄울 필요 없이 그 기존 서버를 그대로 쓰면 된다. 에뮬레이터가 Metro에 접속 못 하면:

```bash
adb -s emulator-5556 reverse tcp:8081 tcp:8081
```

### 로그 확인

```bash
adb -s emulator-5556 logcat -c                     # 로그 버퍼 비우기(재현 직전에)
adb -s emulator-5556 logcat -d -t 300 | grep -iE "ReactNativeJS|FATAL|Worklets"
```

`[Worklets] Tried to modify key 'current'...` 같은 경고가 보이면 Reanimated 워클릿 경계 침범 문제다(`docs/architecture.md` §3-5 참고).

### 화면 캡처 / 터치 시뮬레이션 (화면을 직접 볼 수 없을 때)

```bash
adb -s emulator-5556 exec-out screencap -p > screen.png

# 롱프레스 후 드래그 재현 (짧은 스와이프와 달리 시작점에서 실제로 "머무른다")
adb -s emulator-5556 shell input draganddrop <x1> <y1> <x2> <y2> <duration_ms>
```

일반 `adb shell input swipe`는 처음부터 선형으로 움직여서 롱프레스 활성화 조건(`activateAfterLongPress`)을 못 만족시킨다 — `draganddrop`을 써야 한다.

---

## 웹 빌드 + Cloudflare Pages 배포

### 빌드

```bash
cd apps/mobile
npx expo export -p web
```

`dist/` 아래에 정적 사이트가 생성된다. `apps/mobile/public/`에 있는 파일(매니페스트, 아이콘, `sw.js`, `_redirects`)은 가공 없이 그대로 `dist/` 루트에 복사된다.

### Cloudflare Pages에 배포

```bash
npx wrangler login                                             # 최초 1회
npx wrangler pages deploy dist --project-name=habit-tracker
```

프로젝트가 없으면 자동으로 생성된다(대시보드에서 미리 만들 필요 없음). Cloudflare 대시보드가 "Worker 생성"을 유도하는 화면을 보여주더라도, 정적 사이트일 뿐이라 Worker 코드는 필요 없다 — "Upload assets"(직접 업로드) 쪽을 쓰면 된다.

배포 후 프로젝트의 안정적인 URL은 `https://<project-name>-<임의문자열>.pages.dev` 형태다(예: `https://habit-tracker-d6y.pages.dev` — 프로젝트 이름 `habit-tracker`가 전역적으로 이미 있어서 접미사가 붙었다). `wrangler`가 매 배포마다 출력하는 해시 붙은 URL(`https://<해시>.habit-tracker-d6y.pages.dev`)은 그 배포 건 전용이고, 접미사 없는 프로젝트 기본 URL이 항상 최신 배포를 가리킨다.

### 재배포할 때마다 확인할 것

1. **Service Worker 캐시 버전**: `apps/mobile/public/sw.js`의 내용을 고쳤다면(캐싱 전략 자체를 바꿨을 때) `CACHE_NAME` 상수도 반드시 같이 올려라. 브라우저는 `/sw.js`가 이전 등록본과 바이트 단위로 같으면 새로 설치를 시도조차 안 해서, 아무리 배포해도 실기기에서 옛 버전처럼 보인다. (내비게이션 요청 자체는 네트워크 우선이라 이 문제와 무관하게 최신 HTML/JS를 받아오지만, `sw.js` 스크립트 자체의 로직 변경은 이 방식으로만 반영된다.)
2. **Google 로그인 리디렉션 URL**: 새 배포 도메인을 처음 쓴다면 Supabase 대시보드에 등록해야 한다 — 아래 [Supabase 운영 가이드](#supabase-운영-가이드) 참고. 안 하면 로그인 완료 후 "유효하지 않은 주소" 에러가 뜬다.
3. **실기기 테스트 시 완전 종료 후 재실행**: 홈 화면에 설치한 PWA는 백그라운드에 오래 남아있을 수 있다 — 앱 스위처에서 완전히 종료했다가 다시 열어야 새 Service Worker/캐시가 확실히 적용된다.

### 로컬에서 정적 빌드 결과물 미리보기

```bash
cd apps/mobile
npx serve -l 8099 dist    # 또는: python3 -m http.server 8099 --directory dist
```

`python3 -m http.server`는 확장자 없는 클린 URL(`/settings` → `/settings.html`)을 자동으로 못 찾아준다 — `npx serve`가 Cloudflare Pages와 동일한 방식으로 동작해서 로컬 검증엔 이쪽이 더 정확하다.

### 동적 라우트(`/habit/[id]`) 관련

빌드 시점에 실제 습관 ID를 알 수 없는 라우트(`/habit/[id]`, `/habit/[id]/edit`)는 `dist/habit/[id].html` 같은 템플릿 파일로만 export된다. `apps/mobile/public/_redirects`에 이미 규칙이 있어서(`/habit/:id` → `/habit/[id].html` 200) Cloudflare Pages에서 실제 ID로 들어오는 딥링크/새로고침이 404 없이 정상 동작한다 — 이 파일을 건드릴 일은 거의 없지만, 새 동적 라우트를 추가하면 같은 패턴으로 규칙을 추가해야 한다.

---

## Supabase 운영 가이드

이 앱은 사용자가 각자 자기 Supabase 프로젝트를 연결하는 구조가 **아니다** — 개발자가 만든 프로젝트 하나를 모든 설치본이 공유하고(RLS로 사용자별 데이터 격리), URL/anon key는 `apps/mobile/src/constants/supabase.ts`에 고정돼 있다. 아래는 이미 완료된 최초 설정 절차(재현하거나 확인할 일이 생겼을 때 참고)와, **배포 도메인을 추가할 때마다 반드시 해야 하는 일**을 나눠서 정리했다.

### 최초 설정(완료됨 — 참고용)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성.
2. SQL Editor에 `docs/supabase-schema.sql` 전체를 붙여넣고 실행(테이블/RLS 정책/RPC). 이 파일은 `create table if not exists` 위주라 스키마가 바뀔 때마다 전체를 다시 실행해도 안전하다.
3. **Authentication → Providers**에서 Google 활성화 — Google Cloud Console에서 OAuth 클라이언트를 만들고 Client ID/Secret을 등록. Google Cloud Console 쪽 "승인된 리디렉션 URI"에는 **Supabase가 제공하는 콜백 주소**(`https://<project-ref>.supabase.co/auth/v1/callback`)를 넣는다 — 앱의 배포 도메인이 아니다.
4. 프로젝트 URL과 anon key(**Settings → API**)를 `apps/mobile/src/constants/supabase.ts`에 채워넣는다.

### 새 배포 도메인을 추가할 때마다 (필수)

**Authentication → URL Configuration → Redirect URLs**에 그 도메인을 추가한다.

| 플랫폼 | 등록해야 하는 값 |
|---|---|
| 네이티브 빌드 | `habittracker://auth-callback` (앱 스킴, `app.json`의 `scheme`) |
| Expo Go / 로컬 Dev Client 개발 중 | `exp://**` (와일드카드) |
| 웹(Cloudflare Pages 등) | 그 배포 도메인 + `/auth-callback`, 예: `https://habit-tracker-d6y.pages.dev/auth-callback` (경로 상관없이 다 허용하려면 `https://habit-tracker-d6y.pages.dev/**`) |

**안 하면 무슨 일이 생기는지**: 로그인 자체(Google 계정 선택, 동의 화면)는 정상적으로 끝나지만, Supabase가 요청받은 `redirectTo`가 허용 목록에 없다고 판단해 그 요청을 거부하고 대신 **Site URL**(기본값 하나만 설정 가능 — 보통 네이티브 스킴으로 되어 있음)로 되돌려보낸다. 그러면 브라우저(특히 웹)가 `habittracker://...` 같은 앱 전용 주소를 열려고 시도하다가 "유효하지 않은 주소"/"이 페이지를 열 수 없음" 에러를 띄운다. 로그인 UI 자체는 문제없이 끝났기 때문에 원인을 착각하기 쉽다 — 항상 이 목록부터 확인할 것.

### 동기화 직접 확인하는 법

Supabase 대시보드의 **Table Editor**에서 `habits`/`check_ins`/`categories` 테이블을 직접 열어보면 된다. 로그인 직후에는 `updated_at`이 로그인 시각 근처로 몰려있는 행들이 그 기기의 로컬 데이터가 막 업로드된 것들이다. 두 기기에서 같은 Google 계정으로 로그인했는데 데이터가 안 보이면:

1. 두 기기 모두 진짜 같은 Google 계정으로 로그인했는지(다른 계정이면 RLS가 정상적으로 서로 격리한다 — 버그가 아니라 의도된 동작).
2. `lastSyncedAt`(로컬 zustand 상태, 기기별로 다름)이 너무 최신으로 찍혀서 증분 pull이 새 데이터를 걸러내고 있는 건 아닌지 — `docs/architecture.md` §3-4·§5-3에 이 클래스의 버그(로그아웃 상태에서도 `lastSyncedAt`이 계속 갱신되던 문제)가 기록돼 있다.
3. 네트워크 오프라인 상태였다면 로컬 행은 `syncStatus: 'pending'`으로 남아 다음 트리거(다음 로컬 변경, 다음 포그라운드 복귀) 때 재시도된다 — 별도 재시도 버튼이 없는 건 의도된 설계다(`docs/features.md`).

### 스키마를 바꿔야 할 때

`docs/supabase-schema.sql`을 고치고, SQL Editor에서 **전체 파일**을 다시 실행한다(부분 실행 X — `create table if not exists`/`create or replace function`/`drop policy if exists` 위주로 작성돼 있어서 전체 재실행이 항상 안전하다). 이미 로그인해서 쓰고 있는 기기가 있어도 마이그레이션 스텝이 따로 필요 없다 — 새 엔티티가 추가되면 그 기기의 기존 로컬 행들은 여전히 `syncStatus: 'pending'`인 채로 남아있어서 다음 자동 동기화 때 정상적으로 올라간다.

---

## 자주 겪는 문제 체크리스트

| 증상 | 원인/확인할 것 |
|---|---|
| `npx expo run:android --device X` → `Could not find device with name` | 위 [안드로이드](#알려진-문제-device가-항상-could-not-find-device-with-name-에러를-냄) 참고 — Gradle 직접 빌드로 우회 |
| 웹에서 로그인 완료 후 "유효하지 않은 주소" | Supabase Redirect URLs에 그 배포 도메인이 없음 |
| 웹 배포했는데 실기기에서 계속 옛 버전 | `sw.js`를 고쳤다면 `CACHE_NAME`을 안 올렸을 가능성 — 완전 종료 후 재실행도 같이 해볼 것 |
| iOS PWA(홈 화면 설치)에서만 특정 동작이 이상함 | standalone 모드는 일반 Safari 탭과 다르게 동작하는 부분이 여러 곳 있다(`window.open`이 진짜 팝업이 아님, safe-area 처리 등) — 먼저 일반 Safari 탭에서 재현되는지 확인해서 standalone 전용 문제인지 구분할 것 |
| 스크롤 가능한 목록에서 드래그 재정렬이 유독 안 됨(웹) | `react-native-gesture-handler`의 확인된 미해결 이슈 — `docs/architecture.md` §3-5 참고, 전용 손잡이 방식으로 우회함 |
