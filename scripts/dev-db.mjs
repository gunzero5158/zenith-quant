// Local-only helper for manual testing: node scripts/dev-db.mjs <sql> [args...]
import { createClient } from "@libsql/client";
const db = createClient({ url: "file:./dev.db" });
const [sql, ...args] = process.argv.slice(2);
const r = await db.execute({ sql, args });
console.log(JSON.stringify(r.rows ?? r, null, 0));
