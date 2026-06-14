// Opentide Service Worker
// Handles: install/activate lifecycle, cache-first shell, push events.
// Notification scheduling (session opens, calendar events) is driven by the
// app via postMessage so the SW doesn't need to know the session math.

const CACHE = "opentide-v2";

// Shell assets to pre-cache on install (Next.js injects hashed chunks at
// build time; we only cache the bare essentials here to avoid stale JS).
const PRECACHE = ["/", "/manifest.webmanifest", "/icon.svg"];

// ---------------------------------------------------------------------------
// Install — pre-cache the shell
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ---------------------------------------------------------------------------
// Activate — remove old caches, take control immediately
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// Fetch — network-first for HTML documents (so the served page always matches
// the current build's hashed chunks — stale HTML pointing at old chunk URLs is
// what causes ChunkLoadError flashes after a rebuild); stale-while-revalidate
// for other shell assets (icons, manifest).
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, and Next.js internal requests
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Navigation (HTML document) requests: network-first so the markup always
  // references the chunks the current build actually emitted. Fall back to
  // cache only when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((c) => c ?? caches.match("/")))
    );
    return;
  }

  // Other shell assets (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached); // fallback to cache if offline
      return cached ?? fetchPromise;
    })
  );
});

// ---------------------------------------------------------------------------
// Push — show a notification from the server (future Web Push integration).
// The payload is a JSON string: { title, body, url? }
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Opentide", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Opentide", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag ?? "opentide",
      data: { url: data.url ?? "/" },
    })
  );
});

// ---------------------------------------------------------------------------
// Notification click — focus or open the app
// ---------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find(
          (c) => new URL(c.url).pathname === target
        );
        if (existing) return existing.focus();
        return self.clients.openWindow(target);
      })
  );
});

// ---------------------------------------------------------------------------
// Message — schedule a local (in-tab) notification via the SW.
// The app sends: { type: "SCHEDULE_NOTIF", title, body, fireAt, tag }
// We use setTimeout approximation since SW timers don't survive sleep.
// ---------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data?.type !== "SCHEDULE_NOTIF") return;
  const { title, body, fireAt, tag } = event.data;
  const delay = Math.max(0, fireAt - Date.now());
  if (delay > 24 * 60 * 60 * 1000) return; // cap at 24h (SW may sleep)
  setTimeout(() => {
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: tag ?? "opentide",
      data: { url: "/" },
    });
  }, delay);
});
