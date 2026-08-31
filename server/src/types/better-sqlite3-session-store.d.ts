declare module "better-sqlite3-session-store" {
  import type { Store } from "express-session";
  import type Database from "better-sqlite3";

  interface SqliteStoreOptions {
    client: Database.Database;
    expired?: {
      clear?: boolean;
      intervalMs?: number;
    };
  }

  function createSqliteStoreFactory(
    session: typeof import("express-session"),
  ): new (options: SqliteStoreOptions) => Store;

  export default createSqliteStoreFactory;
}
