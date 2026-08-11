// 앱 셸(JS/HTML/CSS/아이콘)을 캐시해서 오프라인에서도 앱 코드 자체가 실행되게 한다.
// Supabase 등 다른 origin으로 가는 요청은 건드리지 않는다(동기화 API 응답을 캐시하면 안 됨).
//
// 빌드마다 JS/CSS 파일명에 콘텐츠 해시가 붙어서 바뀌기 때문에(Expo Router 웹
// export가 별도의 에셋 매니페스트를 안 만들어줌), install 시점에 index.html을
// 직접 받아 그 안의 <script src>/<link href>를 정규식으로 뽑아 함께 캐시한다.
// 이렇게 하면 첫 방문 한 번만으로 셸 전체가 캐시되어, 재방문 없이도 바로
// 오프라인에서 열릴 수 있다.
const CACHE_NAME = 'habit-tracker-shell-v1';

async function precacheShell(cache) {
  const shellResponse = await fetch('/', { cache: 'no-store' });
  if (!shellResponse.ok) return;
  const html = await shellResponse.clone().text();
  const assetUrls = new Set(['/', '/manifest.json', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']);
  for (const match of html.matchAll(/(?:src|href)="(\/_expo\/[^"]+|\/favicon\.ico)"/g)) {
    assetUrls.add(match[1]);
  }
  await cache.put('/', shellResponse);
  await Promise.all(
    [...assetUrls]
      .filter((url) => url !== '/')
      .map((url) => fetch(url, { cache: 'no-store' }).then((res) => res.ok && cache.put(url, res))),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(precacheShell));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? networkFetch;
    }),
  );
});
