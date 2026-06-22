# Secret Notes — Backend

Node.js (Fastify 5 + TypeScript) REST API that stores notes encrypted in PostgreSQL.

> Step 2.1 scaffold. Real AES encryption (Feature A/B) lands in §4; Dockerfiles in §6.

## Run locally

```bash
# 1. start a local Postgres (from the repo root)
docker compose up -d db

# 2. install deps + configure env
cd backend
npm install
cp .env.example .env

# 3. create the schema
npm run migrate

# 4. start the API (watch mode)
npm run dev
```

API listens on `http://localhost:3000`.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`  | `/health` | — | `{ status: "ok" }` |
| `POST` | `/notes` | `{ title?, content, key }` | `201 { noteId, title, createdAt }` |
| `POST` | `/notes/:noteId/reveal` | `{ key }` | `200 { noteId, title, createdAt, content }` · `404` · `403` |

The internal integer `id` is never exposed — clients only ever see the `noteId` (uuid).

## Data model

`notes(id int PK [internal], note_id uuid [public], title, content_encrypted, created_at)`
