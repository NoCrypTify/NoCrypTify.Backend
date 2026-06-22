import type { FastifyInstance } from 'fastify';
import { createNote, revealNote, listNotes } from './notesRepository.js';

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

interface CreateNoteBody {
  title?: string;
  content: string;
  key: string;
}

interface RevealParams {
  noteId: string;
}

interface RevealBody {
  key: string;
}

export default async function notesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notes', async () => {
    return listNotes();
  });

  app.post<{ Body: CreateNoteBody }>(
    '/notes',
    {
      schema: {
        body: {
          type: 'object',
          required: ['content', 'key'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', maxLength: 200 },
            content: { type: 'string', minLength: 1 },
            key: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { title, content, key } = request.body;
      const note = await createNote({ title: title ?? null, content, key });
      return reply.code(201).send(note);
    },
  );

  app.post<{ Params: RevealParams; Body: RevealBody }>(
    '/notes/:noteId/reveal',
    {
      schema: {
        params: {
          type: 'object',
          required: ['noteId'],
          properties: {
            noteId: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        body: {
          type: 'object',
          required: ['key'],
          additionalProperties: false,
          properties: {
            key: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { noteId } = request.params;
      const { key } = request.body;
      try {
        const note = await revealNote(noteId, key);
        if (!note) return reply.code(404).send({ error: 'Note not found' });
        return reply.send(note);
      } catch {
        return reply.code(403).send({ error: 'Invalid key' });
      }
    },
  );
}
