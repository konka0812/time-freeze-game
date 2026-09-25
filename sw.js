const C = 'tf-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  clients.claim().then(() =>
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
  )
));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // js/html/manifest 走网络优先, 避免部署后拿到旧版
  const netFirst = /\.(js|html|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (netFirst) {
    e.respondWith(
      fetch(e.request).then(res => {
        const cl = res.clone();
        caches.open(C).then(c => c.put(e.request, cl));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // 图片等资源: 缓存优先 + 后台更新
    e.respondWith(
      caches.open(C).then(async c => {
        const hit = await c.match(e.request);
        const net = fetch(e.request).then(res => {
          if (res && res.ok) c.put(e.request, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
