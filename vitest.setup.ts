// Load .env into process.env for DB-backed integration tests (Node 22+).
// In CI the variables are provided via the job environment, so a missing
// .env file here is fine.
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the ambient environment
}

// Integration tests opt in explicitly; unit tests need nothing here.
process.env.SKIP_ENV_VALIDATION ??= "1";
