import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Web-only root HTML document (static export) — see docs/architecture.md
 * §3-4. Expo Router doesn't generate a PWA manifest/Apple home-screen tags
 * on its own, so this is where they're added by hand: `public/manifest.json`
 * + `public/apple-touch-icon.png` (both plain static files Expo serves as-is
 * from apps/mobile/public/, no build step).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <title>Habit Tracker</title>

        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Safari ignores manifest.json's theme_color/display for the status
            bar and "Add to Home Screen" full-screen behavior — these
            Apple-specific tags are the only way to get both on iOS. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="습관 트래커" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#F9F8F6" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#111217" media="(prefers-color-scheme: dark)" />

        <ScrollViewStyleReset />

        {/* standalone(홈 화면 설치) 모드의 viewport-fit=cover는 노치/상태바/홈
            인디케이터 영역까지 페이지가 덮게 만든다 — 앱 콘텐츠가 그 영역까지
            정확히 채우지 못하는 순간(레이아웃 리플로우 중 등) body의 기본
            흰 배경이 그대로 비쳐 보인다. 실제 테마 배경색을 미리 깔아
            그 틈에도 흰 배경이 노출되지 않게 한다. */}
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              body { background-color: #F9F8F6; }
              @media (prefers-color-scheme: dark) { body { background-color: #111217; } }

              /* iOS Safari의 롱프레스 링크 미리보기(callout)를 앱 전체에서
                 끈다 — 습관 카드가 상세 화면으로 가는 Link(<a>)라서, 길게
                 눌러 드래그를 시작하려는 순간 이 미리보기가 먼저 뜨면서
                 드래그 제스처를 가로채 버린다. */
              a { -webkit-touch-callout: none; }

              /* 롱프레스 드래그 재정렬과 계속 부딪히는 다른 두 가지 Safari
                 기본 동작도 앱 전체에서 끈다 — 텍스트/요소 선택 말풍선(길게
                 누르면 뜨는 확대경+복사 메뉴)과 탭 시 잠깐 나타나는 회색
                 하이라이트 박스. 습관 이름 등 실제 입력 필드(input/textarea)
                 는 편집 가능해야 하므로 제외. */
              * { -webkit-tap-highlight-color: transparent; }
              *:not(input):not(textarea) {
                -webkit-user-select: none;
                user-select: none;
              }
            `,
          }}
        />

        {/* 앱 셸(JS/HTML/아이콘)을 캐시해서 최초 방문 이후엔 오프라인에서도
            앱 코드 자체가 실행되게 한다. 데이터 오프라인은 IndexedDB(웹)/
            SQLite(네이티브)가 이미 담당 — 이건 그 나머지 절반. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
