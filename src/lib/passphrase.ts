/**
 * passphrase.ts — the owner's login, browser side. The passphrase is sent once to /api/auth/login, which sets an
 * httpOnly session cookie (src/lib/session.ts); the browser never keeps the passphrase. `hch_logged_in` is only a hint
 * for the UI (show the flashcards link before the server answers); the server checks the cookie on every call.
 */
const LOGGED_IN_KEY = "hch_logged_in";
/** Where older versions stored the passphrase itself: read once to log in with the cookie, then deleted. */
const OLD_PASSPHRASE_KEY = "hch_passphrase";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LOGGED_IN_KEY) === "1";
}

function setFlag(on: boolean) {
  if (on) localStorage.setItem(LOGGED_IN_KEY, "1");
  else localStorage.removeItem(LOGGED_IN_KEY);
}

export async function login(passphrase: string): Promise<boolean> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  setFlag(res.ok);
  return res.ok;
}

export async function logout(): Promise<void> {
  setFlag(false);
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}

/** Asks the server whether this device's cookie is valid. A passphrase left by an older version logs in once and is
 * deleted. Network errors keep the last known state. */
export async function checkSession(): Promise<boolean> {
  const old = localStorage.getItem(OLD_PASSPHRASE_KEY);
  if (old) {
    localStorage.removeItem(OLD_PASSPHRASE_KEY);
    try {
      if (await login(old)) return true;
    } catch {
      localStorage.setItem(OLD_PASSPHRASE_KEY, old); // offline: try again next time
      return isLoggedIn();
    }
  }
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const { loggedIn } = (await res.json()) as { loggedIn: boolean };
    setFlag(loggedIn);
    return loggedIn;
  } catch {
    return isLoggedIn();
  }
}
