const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function createId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = "";

  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length];
  }

  return id;
}
