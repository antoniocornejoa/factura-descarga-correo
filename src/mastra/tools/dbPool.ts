import pg from "pg";

export function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  return new pg.Pool({
    connectionString,
    ssl: connectionString?.includes("localhost") || connectionString?.includes("127.0.0.1")
      ? undefined
      : { rejectUnauthorized: false },
  });
}
