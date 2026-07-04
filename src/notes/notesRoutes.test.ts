import { jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { pool } from '../db/pool.js';
import { encrypt, decrypt } from '../crypto/encryption.js';

type QueryFn = (...args: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = jest.spyOn(pool as unknown as { query: QueryFn }, 'query');

const NOTE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const CREATED_AT = new Date('2026-01-15T10:00:00Z');

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  queryMock.mockReset();
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /notes (Feature A — encrypted storage)', () => {
  it('rejects a note without a key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { content: 'secret' },
    });
    expect(res.statusCode).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects a note without content', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { key: 'pw' },
    });
    expect(res.statusCode).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('strips unknown extra properties instead of storing them', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          note_id: NOTE_ID,
          title: null,
          content_encrypted: 'irrelevant',
          created_at: CREATED_AT,
        },
      ],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { content: 'secret', key: 'pw', isAdmin: true },
    });
    expect(res.statusCode).toBe(201);
    // only [title, ciphertext] reach the database
    expect(queryMock.mock.calls[0][1]).toHaveLength(2);
  });

  it('creates a note and returns metadata without the content', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          note_id: NOTE_ID,
          title: 'Test',
          content_encrypted: 'irrelevant',
          created_at: CREATED_AT,
        },
      ],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { title: 'Test', content: 'top secret', key: 'pw' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      noteId: NOTE_ID,
      title: 'Test',
      createdAt: CREATED_AT.toISOString(),
    });
  });

  it('persists only ciphertext, never the plaintext', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          note_id: NOTE_ID,
          title: null,
          content_encrypted: 'irrelevant',
          created_at: CREATED_AT,
        },
      ],
    });
    await app.inject({
      method: 'POST',
      url: '/notes',
      payload: { content: 'top secret', key: 'pw' },
    });

    const params = queryMock.mock.calls[0][1] as [string | null, string];
    const stored = params[1];
    expect(stored).not.toContain('top secret');
    expect(decrypt(stored, 'pw')).toBe('top secret');
  });
});

describe('GET /notes', () => {
  it('lists note metadata without encrypted content', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ note_id: NOTE_ID, title: null, created_at: CREATED_AT }],
    });
    const res = await app.inject({ method: 'GET', url: '/notes' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { noteId: NOTE_ID, title: null, createdAt: CREATED_AT.toISOString() },
    ]);
  });
});

describe('POST /notes/:noteId/reveal (Feature B — secure retrieval)', () => {
  function mockStoredNote(plaintext: string, key: string): void {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          note_id: NOTE_ID,
          title: 'Secret',
          content_encrypted: encrypt(plaintext, key),
          created_at: CREATED_AT,
        },
      ],
    });
  }

  it('rejects an invalid UUID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes/not-a-uuid/reveal',
      payload: { key: 'pw' },
    });
    expect(res.statusCode).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown note', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await app.inject({
      method: 'POST',
      url: `/notes/${NOTE_ID}/reveal`,
      payload: { key: 'pw' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when the key is wrong', async () => {
    mockStoredNote('hidden text', 'right-key');
    const res = await app.inject({
      method: 'POST',
      url: `/notes/${NOTE_ID}/reveal`,
      payload: { key: 'wrong-key' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Invalid key' });
    expect(res.body).not.toContain('hidden text');
  });

  it('returns the plaintext when the key is correct', async () => {
    mockStoredNote('hidden text', 'right-key');
    const res = await app.inject({
      method: 'POST',
      url: `/notes/${NOTE_ID}/reveal`,
      payload: { key: 'right-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      noteId: NOTE_ID,
      title: 'Secret',
      createdAt: CREATED_AT.toISOString(),
      content: 'hidden text',
    });
  });
});
