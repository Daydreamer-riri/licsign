export interface Env {
  DB: D1Database;
  LICENSE_ISSUER: string;
  CORS_ORIGIN?: string;
  SIGNING_PRIVATE_JWK: string;
  SIGNING_KEY_ID: string;
}

export interface AdminContext {
  issuerId: string;
  issuerName: string;
  publicUserId: string;
  apiKeyId: string;
}
