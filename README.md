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

Frontend expects backend at `http://localhost:4000`.
Set `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` if needed.

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

Image endpoint currently returns placeholder URLs. Swap `backend/src/services/imageService.js` with Gemini API calls later.

## Manual sanity checklist

- [ ] Login works with static credentials
- [ ] Register creates a user in `backend/data/users.json`
- [ ] Child profile gating works
- [ ] Four story cards render in menu
- [ ] Book open/flip/close animations run
- [ ] App returns to main menu after final page
