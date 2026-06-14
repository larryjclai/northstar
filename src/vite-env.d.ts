/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NORTHSTAR_SYNC_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
