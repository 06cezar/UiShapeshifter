// Se importă primul în index.ts: importurile ES se evaluează în ordine, deci variabilele din .env
// există înainte de orice modul care le citește.

// .env e opțional: fără el, serverul pornește (agentul fals nu are nevoie de cheie).
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // lipsește apps/server/.env
}
