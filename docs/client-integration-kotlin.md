# Client Integration — Kotlin / Android Reference

A concrete, copy-pasteable implementation of the
[Client Integration Guide](./client-integration.md) for Android clients
(Android TV is the primary target). **Read the platform-agnostic guide first** —
it defines the HTTP contract, the token format, the verification algorithm, and
the lifecycle. This document only shows *how* to implement those on Android.

The code below is **dependency-free**: it uses only the Android/Java standard
library (`HttpURLConnection`, `org.json`, `java.security`, `android.util.Base64`).
If your project already uses OkHttp/Retrofit + Moshi/kotlinx-serialization,
swap the HTTP and JSON layers — the verifier and the state machine are unchanged.

> **Why ES256 and not Ed25519.** Android API levels vary across TV devices, and
> `SHA256withECDSA` (P-256) is the safer, broadly-available native verification
> target. The catch is signature encoding: JWS carries a raw 64-byte `r || s`
> signature, while `java.security.Signature` expects DER. §4 handles the
> conversion.

Timestamp parsing below uses `SimpleDateFormat` rather than `java.time` so the
code runs on older API levels. If your `minSdk` is 26+, `java.time.Instant`
is cleaner — substitute freely.

---

## 1. `machine_hash` on Android

Per the contract, `machine_hash` is a lowercase SHA-256 hex digest (64 chars) of
a **stable, app-scoped** device identifier. A practical V1 recipe:

```kotlin
import android.content.Context
import android.provider.Settings
import java.security.MessageDigest

object MachineHash {
    /**
     * Derives a stable machine_hash for this device + app + product.
     *
     * ANDROID_ID is, since Android 8, scoped per (app signing key, user, device)
     * and survives app updates and restarts — it only resets on factory reset or
     * app uninstall+reinstall. That is an acceptable V1 device identity.
     *
     * Namespacing with package + productCode means the same device produces a
     * different hash per product, and raw ANDROID_ID never leaves the device.
     */
    fun derive(context: Context, productCode: String): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        ).orEmpty()

        val normalized = buildString {
            append("licsign:v1:")
            append(context.packageName)
            append(':')
            append(productCode)
            append(':')
            append(androidId.trim().lowercase())
        }

        val digest = MessageDigest.getInstance("SHA-256")
            .digest(normalized.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
```

Cache the result for the process lifetime. Do **not** hash identifiers that
change on app update, account switch, or reboot — an unstable hash burns a seat
on every launch and quickly triggers `DEVICE_LIMIT_REACHED`. Never transmit the
raw `ANDROID_ID`; only the hash leaves the device.

---

## 2. Embedding the verification public key(s)

Obtain the ES256 public key(s) as JWKs from the Licsign operator — one per
signing-key `kid`. Embed them in the client. **There is no JWKS endpoint**; a key
rotation requires an app update that adds the new key (keep the old ones until
their tokens expire — see the agnostic guide §3.4).

```kotlin
import android.util.Base64
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec

/** base64url decode, tolerant of missing padding. */
fun base64UrlDecode(input: String): ByteArray =
    Base64.decode(input, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

object TrustedKeys {
    // Paste the operator-provided JWK fields here. One entry per kid.
    // A P-256 public JWK looks like: { "kty":"EC","crv":"P-256","x":"...","y":"...","kid":"..." }
    private val jwks: Map<String, Pair<String, String>> = mapOf(
        // kid                to (x, y)
        "kid_REPLACE_ME" to ("REPLACE_X_BASE64URL" to "REPLACE_Y_BASE64URL"),
    )

    private val cache = HashMap<String, PublicKey>()

    /** Returns the public key for a kid, or null if the kid is not trusted. */
    fun publicKeyFor(kid: String): PublicKey? {
        cache[kid]?.let { return it }
        val (x, y) = jwks[kid] ?: return null
        val key = buildP256Key(x, y)
        cache[kid] = key
        return key
    }

    private fun buildP256Key(xB64Url: String, yB64Url: String): PublicKey {
        val params = AlgorithmParameters.getInstance("EC").apply {
            init(ECGenParameterSpec("secp256r1")) // secp256r1 == P-256
        }
        val ecSpec = params.getParameterSpec(ECParameterSpec::class.java)
        val point = ECPoint(
            BigInteger(1, base64UrlDecode(xB64Url)),
            BigInteger(1, base64UrlDecode(yB64Url)),
        )
        return KeyFactory.getInstance("EC")
            .generatePublic(ECPublicKeySpec(point, ecSpec))
    }
}
```

---

## 3. The token payload model

```kotlin
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class LicensePayload(
    val version: Int,
    val kind: String?,            // null/"license" = paid, "trial" = trial token
    val licenseId: String?,       // null for trial tokens
    val productCode: String,
    val machineHash: String,
    val features: List<String>,
    val issuedAt: String,
    val expiresAt: String?,       // null = never expires
    val maxDevices: Int,
    val issuer: String,
    val keyId: String,
) {
    val isTrial: Boolean get() = kind == "trial"

    /** Epoch millis of expires_at, or null when the token never expires. */
    fun expiresAtMillis(): Long? = expiresAt?.let { parseIso8601(it) }

    companion object {
        fun fromJson(json: JSONObject) = LicensePayload(
            version = json.getInt("version"),
            kind = json.optString("kind").ifEmpty { null },
            licenseId = if (json.isNull("license_id")) null else json.getString("license_id"),
            productCode = json.getString("product_code"),
            machineHash = json.getString("machine_hash"),
            features = json.optJSONArray("features")?.let { arr ->
                List(arr.length()) { arr.getString(it) }
            } ?: emptyList(),
            issuedAt = json.getString("issued_at"),
            expiresAt = if (json.isNull("expires_at")) null else json.optString("expires_at").ifEmpty { null },
            maxDevices = json.getInt("max_devices"),
            issuer = json.getString("issuer"),
            keyId = json.getString("key_id"),
        )
    }
}

/** Parses the server's ISO-8601 form, e.g. "2026-05-20T00:00:00.000Z". */
private fun parseIso8601(value: String): Long {
    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    return (fmt.parse(value) ?: Date(0)).time
}
```

---

## 4. The verifier

This implements the agnostic guide §6 end to end, including the raw → DER
signature conversion. It distinguishes three outcomes so the state machine can
react correctly:

- **`Valid`** — signature and all identity claims pass, not expired.
- **`Expired`** — signature and identity pass, but `expires_at` is in the past.
  The token is *authentic*; it just needs renewal.
- **`Invalid`** — structural failure, bad signature, untrusted `kid`, or an
  identity mismatch (`machine_hash`, `product_code`, `issuer`). **Discard it.**

```kotlin
import org.json.JSONObject
import java.security.PublicKey
import java.security.Signature

sealed interface VerifyResult {
    data class Valid(val payload: LicensePayload) : VerifyResult
    data class Expired(val payload: LicensePayload) : VerifyResult
    data class Invalid(val reason: String) : VerifyResult
}

class LicenseVerifier(
    private val expectedProductCode: String,
    private val expectedIssuer: String,
    private val expectedMachineHash: String,
    /** Allowance for device clock skew on the expiry check. */
    private val clockSkewMillis: Long = 5 * 60 * 1000L,
) {
    fun verify(token: String): VerifyResult {
        // (1) Split into exactly three segments.
        val parts = token.split(".")
        if (parts.size != 3) return VerifyResult.Invalid("malformed token")
        val (headerSeg, payloadSeg, signatureSeg) = parts

        // (2) Header: require ES256 and a trusted kid.
        val header = try {
            JSONObject(String(base64UrlDecode(headerSeg), Charsets.UTF_8))
        } catch (e: Exception) {
            return VerifyResult.Invalid("unparseable header")
        }
        if (header.optString("alg") != "ES256") return VerifyResult.Invalid("unexpected alg")
        val kid = header.optString("kid")
        val publicKey = TrustedKeys.publicKeyFor(kid)
            ?: return VerifyResult.Invalid("untrusted kid: $kid")

        // (3) Payload.
        val payload = try {
            LicensePayload.fromJson(
                JSONObject(String(base64UrlDecode(payloadSeg), Charsets.UTF_8)),
            )
        } catch (e: Exception) {
            return VerifyResult.Invalid("unparseable payload")
        }
        if (payload.version != 1) return VerifyResult.Invalid("unknown version ${payload.version}")

        // (4)(5)(6) Verify the signature over the RAW segments.
        val signingInput = "$headerSeg.$payloadSeg".toByteArray(Charsets.US_ASCII)
        val rawSig = base64UrlDecode(signatureSeg)
        val derSig = try {
            rawEcdsaSignatureToDer(rawSig)
        } catch (e: Exception) {
            return VerifyResult.Invalid("bad signature encoding")
        }
        val signatureOk = try {
            Signature.getInstance("SHA256withECDSA").run {
                initVerify(publicKey)
                update(signingInput)
                verify(derSig)
            }
        } catch (e: Exception) {
            false
        }
        if (!signatureOk) return VerifyResult.Invalid("signature verification failed")

        // (7) Identity claims. Any mismatch -> the token is foreign; discard.
        if (payload.productCode != expectedProductCode)
            return VerifyResult.Invalid("product_code mismatch")
        if (payload.machineHash != expectedMachineHash)
            return VerifyResult.Invalid("machine_hash mismatch")
        if (payload.issuer != expectedIssuer)
            return VerifyResult.Invalid("issuer mismatch")
        if (payload.keyId != kid)
            return VerifyResult.Invalid("key_id/kid mismatch")

        // (7) Expiry. A non-null expires_at in the past -> Expired (authentic).
        val expiresAt = payload.expiresAtMillis()
        if (expiresAt != null && expiresAt + clockSkewMillis <= System.currentTimeMillis())
            return VerifyResult.Expired(payload)

        // (8) All checks pass.
        return VerifyResult.Valid(payload)
    }
}

/**
 * Converts a raw JWS ECDSA signature (r || s, 32 bytes each) into a DER-encoded
 * SEQUENCE { INTEGER r, INTEGER s } as required by SHA256withECDSA.
 */
fun rawEcdsaSignatureToDer(raw: ByteArray): ByteArray {
    require(raw.size == 64) { "ES256 signature must be 64 bytes, got ${raw.size}" }
    val r = encodeDerInteger(raw.copyOfRange(0, 32))
    val s = encodeDerInteger(raw.copyOfRange(32, 64))
    val content = r + s
    return byteArrayOf(0x30) + derLength(content.size) + content
}

private fun encodeDerInteger(value: ByteArray): ByteArray {
    // Strip leading zero bytes, but keep at least one byte.
    var start = 0
    while (start < value.size - 1 && value[start].toInt() == 0) start++
    var magnitude = value.copyOfRange(start, value.size)
    // DER INTEGER is signed: prepend 0x00 if the high bit is set.
    if (magnitude[0].toInt() and 0x80 != 0) {
        magnitude = byteArrayOf(0x00) + magnitude
    }
    return byteArrayOf(0x02) + derLength(magnitude.size) + magnitude
}

private fun derLength(length: Int): ByteArray =
    if (length < 0x80) byteArrayOf(length.toByte())
    else byteArrayOf(0x81.toByte(), length.toByte()) // ES256 lengths never exceed one extra byte
```

---

## 5. The API client

A minimal `HttpURLConnection` client for the three client endpoints. The result
type separates a **definitive server rejection** (a stable `error` code) from an
**inconclusive network/5xx failure** — the state machine treats them very
differently (agnostic guide §8).

```kotlin
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

sealed interface ApiResult {
    /** 200 — the signed compact JWS to store. */
    data class Token(val token: String) : ApiResult
    /** Non-2xx with a stable error envelope. Definitive. */
    data class Rejected(val error: String, val message: String, val httpStatus: Int) : ApiResult
    /** Network failure, timeout, or 5xx. Inconclusive — keep any cached token. */
    data class Unavailable(val cause: Exception?) : ApiResult
}

class LicenseApi(
    private val baseUrl: String,        // e.g. "https://licsign.example.com"
    private val productCode: String,
    private val clientVersion: String,
    private val platform: String = "android-tv",
) {
    fun activate(activationCode: String, machineHash: String, deviceLabel: String?): ApiResult =
        post("/api/client/activate", JSONObject().apply {
            put("product_code", productCode)
            put("activation_code", activationCode)
            put("machine_hash", machineHash)
            put("device_label", deviceLabel)
            put("client_version", clientVersion)
            put("platform", platform)
        })

    fun trial(machineHash: String, deviceLabel: String?): ApiResult =
        post("/api/client/trial", JSONObject().apply {
            put("product_code", productCode)
            put("machine_hash", machineHash)
            put("device_label", deviceLabel)
            put("client_version", clientVersion)
            put("platform", platform)
        })

    /** Deactivate returns {"ok":true}; callers usually only care that it didn't reject. */
    fun deactivate(activationCode: String, machineHash: String): ApiResult =
        post("/api/client/deactivate", JSONObject().apply {
            put("product_code", productCode)
            put("activation_code", activationCode)
            put("machine_hash", machineHash)
        })

    private fun post(path: String, body: JSONObject): ApiResult {
        val conn = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 15_000
            readTimeout = 15_000
            setRequestProperty("Content-Type", "application/json")
            // No Authorization header — client endpoints are unauthenticated.
        }
        return try {
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = conn.responseCode
            val text = (if (status in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()

            when {
                status in 200..299 ->
                    ApiResult.Token(JSONObject(text).getString("token"))
                status >= 500 ->
                    ApiResult.Unavailable(null) // 5xx is inconclusive, not a rejection
                else -> {
                    val json = JSONObject(text)
                    ApiResult.Rejected(
                        error = json.optString("error", "BAD_REQUEST"),
                        message = json.optString("message", ""),
                        httpStatus = status,
                    )
                }
            }
        } catch (e: Exception) {
            ApiResult.Unavailable(e) // connectivity/timeout/parse — inconclusive
        } finally {
            conn.disconnect()
        }
    }
}
```

---

## 6. Token storage

Store the compact JWS, plus the `product_code` + `activation_code` used, so the
client can renew an expired token or re-validate without re-prompting (agnostic
guide §7). The Activation Code is a bearer credential, not the license, so
storing it is acceptable.

```kotlin
import android.content.Context

class LicenseStore(context: Context) {
    private val prefs = context.getSharedPreferences("licsign", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString("token", null)
        set(value) = prefs.edit().putString("token", value).apply()

    var activationCode: String?
        get() = prefs.getString("activation_code", null)
        set(value) = prefs.edit().putString("activation_code", value).apply()

    /** Epoch millis of the last successful online re-validation; 0 if never. */
    var lastRevalidatedAt: Long
        get() = prefs.getLong("revalidated_at", 0L)
        set(value) = prefs.edit().putLong("revalidated_at", value).apply()

    fun clearToken() = prefs.edit().remove("token").apply()
}
```

> The stored token is **user-editable** — it lives in app-private storage, but
> never assume that makes it tamper-proof. The token is trusted *only* after
> `LicenseVerifier.verify` returns `Valid`. That is the whole point of signing.
> For higher assurance, back the store with the Android Keystore / EncryptedSharedPreferences,
> but verification is what enforces integrity regardless.

---

## 7. Putting it together — `LicenseManager`

This realizes the launch state machine from the agnostic guide §7. The
networking calls are blocking — run them off the main thread (coroutine
`Dispatchers.IO`, a worker thread, etc.).

```kotlin
sealed interface LicenseState {
    /** A valid license is in force. */
    data class Licensed(val payload: LicensePayload) : LicenseState
    /** No usable license — prompt the user (activation code, or start a trial). */
    object NeedsActivation : LicenseState
    /** Token expired and the device is offline — cannot renew right now. */
    object ExpiredOffline : LicenseState
}

class LicenseManager(
    private val verifier: LicenseVerifier,
    private val api: LicenseApi,
    private val store: LicenseStore,
    private val machineHash: String,
    private val deviceLabel: String?,
    /** How often optional online re-validation runs. Set to Long.MAX_VALUE to disable. */
    private val revalidateIntervalMillis: Long = 7L * 24 * 60 * 60 * 1000, // 7 days
) {

    /** Call on every launch. */
    fun onLaunch(): LicenseState {
        val token = store.token ?: return LicenseState.NeedsActivation

        return when (val result = verifier.verify(token)) {
            is VerifyResult.Valid -> {
                maybeRevalidate(result.payload)
                LicenseState.Licensed(result.payload)
            }
            is VerifyResult.Expired -> {
                if (result.payload.isTrial) renewTrial()
                else renewPaid()
            }
            is VerifyResult.Invalid -> {
                // Foreign or tampered token — discard and start over.
                store.clearToken()
                LicenseState.NeedsActivation
            }
        }
    }

    /** User entered an Activation Code. */
    fun activateWithCode(activationCode: String): ActivationOutcome {
        return when (val result = api.activate(activationCode, machineHash, deviceLabel)) {
            is ApiResult.Token -> {
                if (acceptToken(result.token)) {
                    store.activationCode = activationCode
                    store.lastRevalidatedAt = System.currentTimeMillis()
                    ActivationOutcome.Activated
                } else {
                    ActivationOutcome.Failed("INVALID_TOKEN", "Issued token failed verification")
                }
            }
            is ApiResult.Rejected -> ActivationOutcome.Failed(result.error, result.message)
            is ApiResult.Unavailable -> ActivationOutcome.Offline
        }
    }

    /** Start a no-code trial. Returns false on TRIAL_INACTIVE / PRODUCT_NOT_FOUND. */
    fun startTrial(): Boolean {
        val result = api.trial(machineHash, deviceLabel)
        return result is ApiResult.Token && acceptToken(result.token)
    }

    /** Release this device's seat (e.g. "move my license to another TV"). */
    fun deactivate() {
        val code = store.activationCode ?: return
        api.deactivate(code, machineHash) // best-effort; ignore the result
        store.clearToken()
    }

    // --- internals -----------------------------------------------------------

    private fun renewTrial(): LicenseState {
        val result = api.trial(machineHash, deviceLabel)
        return when {
            result is ApiResult.Token && acceptToken(result.token) ->
                LicenseState.Licensed(verifier.verify(result.token).payloadOrThrow())
            result is ApiResult.Unavailable -> LicenseState.ExpiredOffline
            else -> {
                // TRIAL_INACTIVE — the trial window has closed.
                store.clearToken()
                LicenseState.NeedsActivation
            }
        }
    }

    private fun renewPaid(): LicenseState {
        val code = store.activationCode ?: return LicenseState.NeedsActivation
        return when (val result = api.activate(code, machineHash, deviceLabel)) {
            is ApiResult.Token ->
                if (acceptToken(result.token)) {
                    store.lastRevalidatedAt = System.currentTimeMillis()
                    LicenseState.Licensed(verifier.verify(result.token).payloadOrThrow())
                } else LicenseState.NeedsActivation
            is ApiResult.Unavailable -> LicenseState.ExpiredOffline
            is ApiResult.Rejected -> {
                // REVOKED / DISABLED / EXPIRED / INVALID_CODE — no longer licensed.
                store.clearToken()
                LicenseState.NeedsActivation
            }
        }
    }

    /**
     * Optional periodic re-validation for a still-valid token (agnostic guide §8).
     * Definitive rejection downgrades; an inconclusive result never does.
     */
    private fun maybeRevalidate(payload: LicensePayload) {
        if (payload.isTrial) return // trials renew on expiry, not on a schedule
        val code = store.activationCode ?: return
        val due = System.currentTimeMillis() - store.lastRevalidatedAt >= revalidateIntervalMillis
        if (!due) return

        when (val result = api.activate(code, machineHash, deviceLabel)) {
            is ApiResult.Token -> {
                if (acceptToken(result.token)) store.lastRevalidatedAt = System.currentTimeMillis()
            }
            is ApiResult.Rejected -> {
                // Only REVOKED/DISABLED/EXPIRED are reasons to drop a working token.
                if (result.error in setOf("LICENSE_REVOKED", "LICENSE_DISABLED", "LICENSE_EXPIRED")) {
                    store.clearToken()
                }
            }
            is ApiResult.Unavailable -> { /* inconclusive — keep the cached token */ }
        }
    }

    /** Verify a freshly issued token before trusting it, then persist it. */
    private fun acceptToken(token: String): Boolean {
        val ok = verifier.verify(token) is VerifyResult.Valid
        if (ok) store.token = token
        return ok
    }

    private fun VerifyResult.payloadOrThrow(): LicensePayload = when (this) {
        is VerifyResult.Valid -> payload
        is VerifyResult.Expired -> payload
        is VerifyResult.Invalid -> error("token expected to be valid: $reason")
    }
}

sealed interface ActivationOutcome {
    object Activated : ActivationOutcome
    object Offline : ActivationOutcome
    /** `error` is the stable code from the agnostic guide §5.2 table. */
    data class Failed(val error: String, val message: String) : ActivationOutcome
}
```

### Wiring it up

```kotlin
val productCode = "flow"
val machineHash = MachineHash.derive(context, productCode)

val manager = LicenseManager(
    verifier = LicenseVerifier(
        expectedProductCode = productCode,
        expectedIssuer = "licsign",                 // the operator-provided issuer string
        expectedMachineHash = machineHash,
    ),
    api = LicenseApi(
        baseUrl = "https://licsign.example.com",
        productCode = productCode,
        clientVersion = BuildConfig.VERSION_NAME,
    ),
    store = LicenseStore(context),
    machineHash = machineHash,
    deviceLabel = android.os.Build.MODEL,
)

// On every launch, off the main thread:
when (val state = manager.onLaunch()) {
    is LicenseState.Licensed     -> enterApp(state.payload)
    LicenseState.NeedsActivation -> showActivationScreen()   // offer code entry and/or trial
    LicenseState.ExpiredOffline  -> showReconnectScreen()    // "license expired, connect to internet"
}
```

---

## 8. Trial UX

When `LicenseState.Licensed` carries a payload with `isTrial == true`, drive
trial-specific UI from it:

```kotlin
fun trialBadge(payload: LicensePayload): String? {
    if (!payload.isTrial) return null
    val expiresAt = payload.expiresAtMillis() ?: return "Trial"
    val daysLeft = ((expiresAt - System.currentTimeMillis()) / (24 * 60 * 60 * 1000L))
        .coerceAtLeast(0)
    return "Trial — $daysLeft day(s) left"
}
```

As a trial token nears expiry, surface a purchase prompt. The trial renews
automatically via `renewTrial()` while the product's trial window stays open;
once it closes, `renewTrial()` lands on `NeedsActivation` and the user must enter
a paid Activation Code (agnostic guide §9).

---

## 9. Checklist (Android specifics)

- [ ] `INTERNET` permission is declared in the manifest.
- [ ] `machine_hash` is derived once and cached for the process.
- [ ] `TrustedKeys.jwks` contains every currently-valid `kid` from the operator.
- [ ] All `LicenseApi` / `LicenseManager` calls run off the main thread.
- [ ] Freshly issued tokens are verified (`acceptToken`) before being stored.
- [ ] The raw → DER signature conversion (§4) is unit-tested against a real token.
- [ ] The private signing key is **never** present anywhere in the app.

See the [platform-agnostic guide](./client-integration.md) for the full contract,
error tables, and the LicenseGate compatibility note.
