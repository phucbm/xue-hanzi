# Hiểu Chữ Hán — Architecture

## What the app does

Từ điển offline Trung - Hán Việt, phân tích chữ Hán, bộ thủ. The user types a Chinese word or pinyin; the app returns:
- Vietnamese meaning (from CVDICT)
- Sino-Vietnamese reading (from Unicode Unihan kVietnamese)
- English definitions, HSK level, frequency stats (from chinese-lexicon / CC-CEDICT)
- Character stroke animation (hanzi-writer → CDN)
- Etymology breakdown for single characters
- Related/compound words

Live at: **hieuchuhan.phucbm.com**

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Styling | Tailwind v4 (`@theme inline`), shadcn/ui components |
| PWA | Serwist (`@serwist/next`) — service worker in `src/app/sw.ts` |
| Data | The dictionary: static JSON `public/data/dictionary.json`. The owner's data (history, flashcards, AI cache and usage): Turso, schema in `db/migrations/` (`.claude/docs/database.md`) |
| Server | Next.js server runtime on Vercel: API routes (`src/app/api/`) and server actions (`src/app/actions/`) |
| Login | One owner, no accounts: the passphrase sets an httpOnly session cookie (`src/lib/session.ts`) |
| Deploy | Vercel, on every push to `main` |

## Key architectural decision: static dictionary

`chinese-lexicon` is a Node.js-only package (CommonJS `require`). So that search runs in the browser (and offline):

1. **`scripts/build-dictionary.ts`** — run once locally to generate `public/data/dictionary.json` (28 MB, 116K entries enriched with CVDICT + kVietnamese). Committed to the repo.
2. **`src/core/client-dictionary.ts`** — fetches the JSON lazily on first search, builds in-memory indices, implements `lookupWord()` and `getWordDetail()`.
3. **`src/app/actions.ts`** — thin wrappers around `client-dictionary` with the same async signatures used throughout the app (`suggestWords`, `searchWords`, `getWordEntries`).

## Data sources

| File | Origin | Content |
|---|---|---|
| `public/data/dictionary.json` | Built by `scripts/build-dictionary.ts` | All entries: simp/trad, pinyin, EN defs, VI meaning, Sino-Viet, etymology, stats |
| `src/data/cvdict.json` | Parsed from `CVDICT.u8` by `scripts/parse-cvdict.ts` | Vietnamese meanings, keyed by simplified char |
| `src/data/kVietnamese.json` | Unicode Unihan 12.1 | Sino-Vietnamese readings, keyed by char |
| `node_modules/chinese-lexicon` | CC-CEDICT + Outlier Linguistics | EN defs, pinyin, etymology, HSK, frequency |

## Layout (desktop ≥1024px)

```
┌──────────────┬──────────────────────────────────────────────┐
│  HchSidebar  │  SidebarInset (<main>)                       │
│  shadcn      │                                              │
│  inset       │  header: SidebarTrigger | breadcrumb |       │
│              │          Search button | Notebook button      │
│  Logo        │                                              │
│  Nav links   │  ContentArea (scrollable)                    │
│  HchNavUser  │    welcome state  OR  WordTabs               │
└──────────────┴──────────────────────────────────────────────┘

SearchDialog (Cmd+K modal, 900px wide):
┌─────────────────────────┬──────────────────────┐
│  Text search (60%)      │  Handwriting (40%)   │
│  input + Search button  │  canvas + candidates │
│  results list           │                      │
└─────────────────────────┴──────────────────────┘

RightSheet (slides from right): history + notes tabs
```

## Layout (mobile <1024px)

```
┌────────────────────────────┐
│  header: hamburger | word  │
│          Search | Notebook │
├────────────────────────────┤
│  ContentArea (scrollable)  │
│  WordTabs                  │
└────────────────────────────┘

SearchDialog: mode toggle at top (Gõ / Viết tay), one panel at a time
RightSheet: slides from right
```

## Component tree

```
app/
  layout.tsx                  — fonts, metadata (version in title), SwAutoUpdate
  page.tsx                    — all state lives here; openWord() is the single navigation handler
  actions.ts                  — searchWords / suggestWords / getWordEntries (async, client-side)
  sw.ts                       — Serwist service worker (skipWaiting + clientsClaim → silent auto-update)

components/
  layout/
    AppLayout.tsx             — header, nav (Flashcards link once logged in), search, right sheet
    AppLayoutWithHistory.tsx  — AppLayout wired to useHistory() for routes outside the home page
    content-area.tsx          — main content pane: welcome state or WordTabs
    right-sheet.tsx           — right-side sheet: history, and the passphrase login
    HistoryList.tsx           — the lookup history list + login/logout
  search/
    search-dialog.tsx         — Cmd+K dialog: text input + Search button + handwriting pad
    WordRow.tsx               — generic row: simp + trad + pinyin + vi
  word/
    WordTabs                  — tab strip: compound word → one tab per char
    WordTabContent            — content for a single tab
    WordInfoBox               — pinyin, Sino-Viet, VI/EN defs, stats
    StrokeBox                 — hanzi-writer stroke animation
    EtymologySection          — component breakdown diagram
    RelatedSection            — topWords chip list
    DefinitionSection         — definitions list
    WordAIExplanation         — AI explanation (OpenRouter, see agents.md)
    WordMaterialNote          — "Đã gặp ở": the owner's course lessons holding the word (material_words)
    AddToFlashcardsButton     — decks, exclude, mark hard, forget
  shared/
    WordBadge                 — compact simp+pinyin chip
  HandwritingPad.tsx          — canvas for drawing; Pointer Events; Undo + Clear buttons

core/
  client-dictionary.ts        — lazy-load dictionary.json, search + lookup
  dictionary.ts               — server-side version (not used at runtime, kept for reference)
  segmenter.ts                — isCompound(), segmentWord() — splits compounds into chars
  handwriting.ts              — HandwritingRecognizer: Web Worker lifecycle for hanzi_lookup WASM
  types.ts                    — WordEntry, WordSummary, ViewedWord, etc.

hooks/
  useHistory                  — lookup history: localStorage, synced to Turso (`/api/history*`) when logged in
```

## Search flow

See `.claude/docs/ux-search.md` for the full interaction spec.

Summary: user opens SearchDialog (Cmd+K or button) → types or draws → clicks **Tìm** or presses Enter → results appear → clicks a result → `openWord(simp)` → `getWordEntries(simp)` → `WordTabs` → dialog closes.

## History flow

`openWord(simp)` → `addWordEntry()` (useHistory) → localStorage, and when logged in `PUT /api/history/<id>` → Turso `user_history` (one row per word or search, last time and count). Logged in, a viewed word also becomes a flashcard (`upsertFlashcardOnView`, `.claude/docs/flashcards.md`).

## PWA / offline

- Service worker pre-caches all static assets at install time (Serwist precache)
- `dictionary.json` cached with CacheFirst strategy after first load
- hanzi-writer stroke data (CDN) cached with StaleWhileRevalidate
- On new deploy: new SW skips waiting, claims clients, `controllerchange` fires → `SwAutoUpdate` calls `window.location.reload()` — silent, automatic
