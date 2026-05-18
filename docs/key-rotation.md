# Key Rotation

V1 license tokens include `key_id` in the payload and `kid` in the JWS header.

Production rules:

- Keep `SIGNING_PRIVATE_JWK` only in Cloudflare secrets.
- Keep old public keys in Android clients for as long as licenses signed with them
  should remain valid.
- Rotate by adding a new key pair, changing `SIGNING_KEY_ID`, and deploying the new
  private JWK secret.
- Do not delete old public keys from clients until old licenses expire or are no
  longer supported.

If the private key is lost:

- Existing licenses remain verifiable by clients that have the old public key.
- The service cannot issue new licenses that verify under that old public key.
- Generate a new key pair and ship clients with both old and new public keys.
