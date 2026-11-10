import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, StaleWhileRevalidate, CacheFirst, NetworkFirst } from "serwist";

// Declare serwist manifest variable (injected by @serwist/next at build time)
declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Cache data files (cvdict.json, kVietnamese.json) — Cache First, long TTL
    {
      matcher: /\/_next\/static\/.*/i,
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [],
      }),
    },
    // Vietnamese dictionary data — Cache First (rarely changes)
    {
      matcher: /\/.*\.(json)$/i,
      handler: new CacheFirst({
        cacheName: "dictionary-data",
        plugins: [],
      }),
    },
    // hanzi-writer character stroke data — StaleWhileRevalidate
    {
      matcher: /cdn\.jsdelivr\.net\/npm\/hanzi-writer-data/i,
      handler: new StaleWhileRevalidate({
        cacheName: "hanzi-writer-data",
        plugins: [],
      }),
    },
    // Self-hosted fonts (public/fonts/, one file per character range) — Cache First
    {
      matcher: /\/fonts\/.*\.woff2$/i,
      handler: new CacheFirst({
        cacheName: "fonts",
        plugins: [],
      }),
    },
    // Google Fonts — Cache First
    {
      matcher: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: "google-fonts",
        plugins: [],
      }),
    },
    // Navigation — NetworkFirst (offline fallback)
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        plugins: [],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
