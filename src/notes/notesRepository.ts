import { pool } from '../db/pool.js';
import { encrypt, decrypt } from '../crypto/encryption.js';

interface NoteRow {
  note_id: string;
  title: string | null;
  content_encrypted: string;
  created_at: Date;
}

export interface NoteDto {
  noteId: string;
  title: string | null;
  createdAt: string;
}

export interface NoteWithContentDto extends NoteDto {
  content: string;
}

type NoteMetaRow = Pick<NoteRow, 'note_id' | 'title' | 'created_at'>;

function toDto(row: NoteMetaRow): NoteDto {
  return {
    noteId: row.note_id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listNotes(): Promise<NoteDto[]> {
  const { rows } = await pool.query<NoteMetaRow>(
    `SELECT note_id, title, created_at
     FROM notes
     ORDER BY created_at DESC`,
  );
  return rows.map(toDto);
}

export async function createNote(input: {
  title: string | null;
  content: string;
  key: string;
}): Promise<NoteDto> {
  const ciphertext = encrypt(input.content, input.key);
  const { rows } = await pool.query<NoteRow>(
    `INSERT INTO notes (title, content_encrypted)
     VALUES ($1, $2)
     RETURNING note_id, title, content_encrypted, created_at`,
    [input.title, ciphertext],
  );
  return toDto(rows[0]);
}

export async function revealNote(
  noteId: string,
  key: string,
): Promise<NoteWithContentDto | null> {
  const { rows } = await pool.query<NoteRow>(
    `SELECT note_id, title, content_encrypted, created_at
     FROM notes
     WHERE note_id = $1`,
    [noteId],
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  const content = decrypt(row.content_encrypted, key);
  return { ...toDto(row), content };
}
