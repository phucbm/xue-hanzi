export const PASSPHRASE_KEY = "hch_passphrase";

export function getPassphrase(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PASSPHRASE_KEY);
}

export function setPassphrase(pass: string): void {
  localStorage.setItem(PASSPHRASE_KEY, pass);
}

export function clearPassphrase(): void {
  localStorage.removeItem(PASSPHRASE_KEY);
}

export function authHeader(pass: string): HeadersInit {
  return { Authorization: `Bearer ${pass}` };
}
