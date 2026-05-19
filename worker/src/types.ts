export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  LICENSE_ISSUER: string;
  CORS_ORIGIN?: string;
  SIGNING_PRIVATE_JWK: string;
  SIGNING_KEY_ID: string;
}

export type AdminActor =
  | { type: "api_key"; apiKeyId: string }
  | { type: "admin"; adminId: string; email: string };

export interface AdminContext {
  issuerId: string;
  issuerName: string;
  publicUserId: string;
  apiKeyId: string;
  actor: AdminActor;
}

