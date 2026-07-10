// Ace provider configuration — the single boundary where the Edge Function
// resolves which LLM provider, API key, and model to use.
//
// Kept deliberately free of remote imports and Deno globals so it stays a pure,
// unit-testable module: the caller injects an environment getter. Phase one
// supports Anthropic only. No key value is ever logged or returned to the
// browser — the function reads the key here and uses it server-side only.

export type EnvGetter = (name: string) => string | undefined;

export type AceProvider = "anthropic";

export interface AceProviderConfig {
  provider: AceProvider;
  apiKey: string;
  model: string;
}

// Safe existing fallback: the model the Ace Edge Function has always used.
// Override per-environment with ACE_MODEL.
export const DEFAULT_ACE_MODEL = "claude-opus-4-8";
export const DEFAULT_ACE_PROVIDER: AceProvider = "anthropic";

// Server-side key names, in resolution order. ACE_API_KEY is the forward-looking
// name; ANTHROPIC_API_KEY matches the function source's historical expectation;
// ANTHROPIC is the legacy secret name already present in the live project.
export const ACE_KEY_ENV_ORDER = ["ACE_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC"] as const;

// Thrown when configuration is missing or unsupported. The message is safe to
// surface server-side (and to a signed-in caller) — it names env *variables*,
// never their values.
export class AceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AceConfigError";
  }
}

function firstNonEmpty(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return undefined;
}

// Resolve Ace's provider configuration, failing closed with a useful,
// value-free error when it is missing or unsupported.
export function resolveAceProviderConfig(env: EnvGetter): AceProviderConfig {
  const provider = (firstNonEmpty(env("ACE_PROVIDER")) ?? DEFAULT_ACE_PROVIDER).toLowerCase();
  if (provider !== "anthropic") {
    throw new AceConfigError(
      `Ace provider "${provider}" is not supported. Phase one supports "anthropic" only — ` +
        "set ACE_PROVIDER=anthropic or leave it unset.",
    );
  }

  const apiKey = firstNonEmpty(...ACE_KEY_ENV_ORDER.map((name) => env(name)));
  if (!apiKey) {
    throw new AceConfigError(
      "Ace is not configured: set one of " +
        ACE_KEY_ENV_ORDER.join(", ") +
        " in the ace-chat function secrets.",
    );
  }

  const model = firstNonEmpty(env("ACE_MODEL")) ?? DEFAULT_ACE_MODEL;

  return { provider: "anthropic", apiKey, model };
}
