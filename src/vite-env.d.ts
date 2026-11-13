/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** auth-service app account id for PortLess (account-management console). */
  readonly VITE_PORTLESS_ACCOUNT_ID?: string;
  /** Absolute backend URL for the approvals SSE stream (bypasses the gateway). */
  readonly VITE_SSE_BASE_URL?: string;
  readonly VITE_AUTOMATION_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
