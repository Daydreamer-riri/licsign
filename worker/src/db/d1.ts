export async function first<T>(statement: D1PreparedStatement): Promise<T | null> {
  return statement.first<T>();
}

export async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results ?? [];
}

export async function run(statement: D1PreparedStatement): Promise<D1Result> {
  return statement.run();
}

export function nowIso(): string {
  return new Date().toISOString();
}
