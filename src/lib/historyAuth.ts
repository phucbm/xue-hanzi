export function verifyHistoryPassphrase(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  const expected = process.env.HISTORY_PASSPHRASE;
  return !!expected && token === expected;
}
