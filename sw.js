// Service worker Choomdle — stratégie volontairement prudente pour éviter de réintroduire les
// bugs de données de cartes obsolètes qu'on a déjà eus par le passé :
// - HTML, JS et données de cartes (wnc.js, i18n.js) : TOUJOURS réseau en priorité. Le cache
//   n'est utilisé qu'en dernier recours si le réseau échoue (mode hors-ligne).
// - Images de cartes et polices : cache en priorité (elles ne changent jamais après upload),
//   ça accélère les rechargements sans jamais servir une version périmée des DONNÉES de jeu.

const STATIC_CACHE = 'choomdle-static-v1';
const STATIC_HOSTS = ['img.choomdle.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // On ne touche qu'aux requêtes GET (pages, scripts, images). Les requêtes POST/PUT/PATCH
  // (connexion, écriture de stats vers Supabase) ne passent jamais par le cache — les laisser
  // suivre leur comportement réseau normal évite une réponse invalide en cas de coupure.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Images de cartes / polices : cache-first (jamais périmées, gain de vitesse réel).
  if (STATIC_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(resp => {
            if (resp.ok) cache.put(event.request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  // Tout le reste (HTML, JS, données de cartes, API) : réseau d'abord, cache seulement en repli
  // si hors-ligne — pour ne jamais servir une carte du jour périmée.
  event.respondWith(
    fetch(event.request)
      .then(resp => resp)
      .catch(() => caches.match(event.request))
  );
});
