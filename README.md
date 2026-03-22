# Narria Hackathon Storybook

This project is split into two apps:

- `frontend/`: Next.js UI and 3D book experience
- `backend/`: Express API with static JSON data

## Run locally

Start both services at once (Windows):

```bash
npm run dev
```

or double-click `start-dev.bat`.

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

By default the frontend uses Next.js rewrites: browser → `/api/narria/*` → Express at `http://127.0.0.1:4000`. Run the backend on port 4000, or set `NARRIA_BACKEND_URL` in `frontend/.env.local` (used by `next.config.ts`). To call Express directly from the browser instead, set `NEXT_PUBLIC_API_BASE_URL`.

### Story outcome → n8n webhook

When a story finishes, `POST /story-outcomes` saves JSON under `backend/data/story-outcomes/`. If you set **`N8N_STORY_OUTCOME_WEBHOOK_URL`** in `backend/.env` (full `https://…/webhook/…` URL from n8n), the server **also** sends a fire-and-forget **`POST`** with **`Content-Type: application/json`** and the **same body** as the saved file. Failures are logged only; the API still returns `201`.

### Backend: cartoon avatar (Gemini / Nano Banana)

After a parent uploads a profile selfie, the backend can call the Gemini image API to generate a cartoon version.

1. Copy `backend/.env.example` to `backend/.env` (or add `GEMINI_API_KEY` to a `.env` in the **repo root** — the backend loads both; `backend/.env` overrides on conflicts).
2. Set `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Restart the backend and confirm the log line: `Gemini cartoon: enabled (GEMINI_API_KEY loaded)`.
4. Optional: `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`), `GEMINI_CARTOON_PROMPT` (custom prompt).

The original photo is saved as `backend/public/assets/profiles/<parentId>.<ext>`.  
The generated cartoon is saved next to it as `backend/public/assets/profiles/<parentId>_cartoon.<ext>` (extension follows the model output, usually `.png`).

- `GET /profile/photo/:parentId` returns `photoUrl` and `cartoonPhotoUrl` (when the cartoon file exists).
- `POST /audio/elevenlabs/welcome` — JSON body `{ "name": "Jad", "parentId": "parent-123" }` (`parentId` optional; used for a stable filename). Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in backend `.env`. Writes `welcome_<id>.mp3` to `backend/public/assets/audio/personalized/`.
- `POST /profile/photo` returns `cartoonPending: true` when Gemini is configured; cartoon generation runs in the background (poll GET until `cartoonPhotoUrl` is set).

## Demo credentials

- `admin` / `admin`
- `demo` / `demo`

## Implemented flow

1. Parent logs in or registers.
2. If no child profile exists, user creates one.
3. Main menu shows story cards (`wizards`, `dragons`, `princess`, `mermaids`) and `Start Book Story`.
4. Story starts with a closed 3D book.
5. First `Next Page` opens book and shows page 1 image.
6. Next clicks flip pages.
7. After last page, book closes to back cover and returns to main menu.

## Backend API

- `POST /auth/login`
- `POST /auth/register`
- `GET /profile/child/:parentId`
- `POST /profile/child`
- `GET /books`
- `GET /books/:bookId`
- `GET /books/:bookId/pages/:pageNumber`
- `GET /profile/photo/:parentId` / `POST /profile/photo`
- `POST /audio/elevenlabs/welcome` — personalized welcome MP3 (ElevenLabs)

Image endpoint currently returns placeholder URLs. Swap `backend/src/services/imageService.js` with Gemini API calls later.

## Book data and asset locations

Book database is stored in:

- `backend/data/books.json`

Static assets are served by backend at `/assets/...` and should be placed in:

- `backend/public/assets/audio/covers/<bookId>/front.mp3`
- `backend/public/assets/audio/covers/<bookId>/back.mp3`
- `backend/public/assets/audio/pages/<bookId>/page-<n>.mp3`
- `backend/public/assets/images/<bookId>/page-<n>.png` (or `.jpg`)

Current created folders:

- `backend/public/assets/audio/covers/wizards`
- `backend/public/assets/audio/covers/dragons`
- `backend/public/assets/audio/covers/princess`
- `backend/public/assets/audio/covers/mermaids`
- `backend/public/assets/audio/pages/wizards`
- `backend/public/assets/audio/pages/dragons`
- `backend/public/assets/audio/pages/princess`
- `backend/public/assets/audio/pages/mermaids`
- `backend/public/assets/images/wizards`
- `backend/public/assets/images/dragons`
- `backend/public/assets/images/princess`
- `backend/public/assets/images/mermaids`

In `backend/data/books.json`, set audio paths like:

- cover front: `"/assets/audio/covers/wizards/front.mp3"`
- cover back: `"/assets/audio/covers/wizards/back.mp3"`
- page audio: `"/assets/audio/pages/wizards/page-1.mp3"`

**Multiple clips on one page** (played in order, back-to-back; optional pause before each clip via `startDelayMs`):

```json
"audio": [
  "intro.mp3",
  { "src": "main.mp3", "startDelayMs": 0 },
  { "src": "outro.mp3", "startDelayMs": 400 }
]
```

You can also use a single object as before. The same array form works inside `choiceOutcomes` for branch audio.

## Manual sanity checklist

- [ ] Login works with static credentials
- [ ] Register creates a user in `backend/data/users.json`
- [ ] Child profile gating works
- [ ] Four story cards render in menu
- [ ] Book open/flip/close animations run
- [ ] App returns to main menu after final page
