// config/app.ts
// Single source of truth for all environment-driven config.
// Import this anywhere instead of reading process.env directly.

export type AppEnv = "local" | "sit" | "production";
export type StorageBackend = "local" | "supabase";

// Static references — Next.js inlines NEXT_PUBLIC_* at build time for client bundles.
// Dynamic process.env[key] is NOT inlined and causes server/client hydration mismatches.

export const appConfig = {
  env: (process.env.NEXT_PUBLIC_APP_ENV ?? "local") as AppEnv,
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "AYT Ops",
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",

  isLocal: (process.env.NEXT_PUBLIC_APP_ENV ?? "local") === "local",
  isSit: process.env.NEXT_PUBLIC_APP_ENV === "sit",
  isProduction: process.env.NEXT_PUBLIC_APP_ENV === "production",

  storageBackend: (process.env.NEXT_PUBLIC_STORAGE_BACKEND ?? "local") as StorageBackend,

  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
} as const;

// Server-only config (never sent to browser)
export const serverConfig = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  googleDrive: {
    clientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL ?? "",
    privateKey: (process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "",
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
} as const;
