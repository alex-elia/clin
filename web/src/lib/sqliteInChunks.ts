/** SQLite default max bound variables is 999; stay under that for IN lists. */
export const SQLITE_IN_CHUNK = 400;

export function chunkIds<T>(ids: readonly T[], size = SQLITE_IN_CHUNK): T[][] {
  if (ids.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size) as T[]);
  }
  return out;
}
