// config/app.ts
// Single source of truth for all environment-driven config.
// Import this anywhere instead of reading process.env directly.

export type AppEnv = "local" | "sit" | "production";
export type StorageBackend = "local" | "supabase";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const appConfig = {
  env: (optional("NEXT_PUBLIC_APP_ENV", "local")) as AppEnv,
  appName: optional("NEXT_PUBLIC_APP_NAME", "AYT Ops"),
  version: optional("NEXT_PUBLIC_APP_VERSION", "0.1.0"),

  isLocal: optional("NEXT_PUBLIC_APP_ENV", "local") === "local",
  isSit: optional("NEXT_PUBLIC_APP_ENV", "local") === "sit",
  isProduction: optional("NEXT_PUBLIC_APP_ENV", "local") === "production",

  storageBackend: (optional("NEXT_PUBLIC_STORAGE_BACKEND", "local")) as StorageBackend,

  supabase: {
    url: optional("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: optional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  },
} as const;

// Server-only config (never sent to browser)
export const serverConfig = {
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
  googleDrive: {
    clientEmail: optional("GOOGLE_DRIVE_CLIENT_EMAIL"),
    privateKey: optional("GOOGLE_DRIVE_PRIVATE_KEY", "").replace(/\\n/g, "\n"),
    rootFolderId: optional("GOOGLE_DRIVE_ROOT_FOLDER_ID"),
  },
  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
} as const;
