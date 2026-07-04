import { encrypt, decrypt } from './encryption.js';

describe('encrypt', () => {
  it('returns a non-empty string', () => {
    expect(encrypt('hello', 'secret')).toBeTruthy();
  });

  it('does not return the plaintext', () => {
    expect(encrypt('hello', 'secret')).not.toBe('hello');
  });

  it('returns valid Base64', () => {
    const result = encrypt('hello', 'secret');
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
    expect(Buffer.from(result, 'base64').toString('base64')).toBe(result);
  });

  it('produces different ciphertext each call (random IV + salt)', () => {
    const a = encrypt('hello', 'secret');
    const b = encrypt('hello', 'secret');
    expect(a).not.toBe(b);
  });

  it('can encrypt an empty string', () => {
    expect(() => encrypt('', 'secret')).not.toThrow();
  });

  it('can encrypt unicode content', () => {
    expect(() => encrypt('héllo wörld 🔒', 'pässphräse')).not.toThrow();
  });
});

describe('decrypt', () => {
  it('round-trips plaintext correctly', () => {
    const plain = 'my secret note';
    expect(decrypt(encrypt(plain, 'key123'), 'key123')).toBe(plain);
  });

  it('round-trips an empty string', () => {
    expect(decrypt(encrypt('', 'key'), 'key')).toBe('');
  });

  it('round-trips unicode content', () => {
    const plain = 'héllo wörld 🔒';
    expect(decrypt(encrypt(plain, 'pass'), 'pass')).toBe(plain);
  });

  it('round-trips a long string', () => {
    const plain = 'x'.repeat(10_000);
    expect(decrypt(encrypt(plain, 'longkey'), 'longkey')).toBe(plain);
  });

  it('throws on a wrong key', () => {
    const ciphertext = encrypt('secret content', 'correct-key');
    expect(() => decrypt(ciphertext, 'wrong-key')).toThrow();
  });

  it('throws on a subtly different key', () => {
    const ciphertext = encrypt('secret content', 'mypassword');
    expect(() => decrypt(ciphertext, 'mypassword ')).toThrow();
  });

  it('throws on tampered ciphertext', () => {
    const buf = Buffer.from(encrypt('hello', 'key'), 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'), 'key')).toThrow();
  });

  it('throws on tampered auth tag', () => {
    const buf = Buffer.from(encrypt('hello', 'key'), 'base64');
    // auth tag starts at byte 28 (16 salt + 12 iv)
    buf[28] ^= 0x01;
    expect(() => decrypt(buf.toString('base64'), 'key')).toThrow();
  });

  it('each encrypt produces independently decryptable ciphertext', () => {
    const c1 = encrypt('note one', 'key');
    const c2 = encrypt('note two', 'key');
    expect(decrypt(c1, 'key')).toBe('note one');
    expect(decrypt(c2, 'key')).toBe('note two');
  });
});
