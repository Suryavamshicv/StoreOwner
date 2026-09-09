/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QR_BASE_URL?: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
