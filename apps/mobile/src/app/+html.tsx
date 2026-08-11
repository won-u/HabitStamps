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
