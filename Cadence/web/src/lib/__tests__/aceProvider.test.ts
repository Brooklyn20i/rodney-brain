/**
 * Ace provider config — the Edge Function's server-side boundary for resolving
 * which provider/key/model to use. Pure and Deno-free, so it is exercised here
 * with the web unit tooling. These tests pin the phase-one contract: Anthropic
 * only, key resolution order ACE_API_KEY → ANTHROPIC_API_KEY → ANTHROPIC, a
 * configurable model with a safe default, and value-free failures.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveAceProviderConfig,
  AceConfigError,
  DEFAULT_ACE_MODEL,
} from '../../../../backend/functions/ace-chat/provider';

const envOf = (vars: Record<string, string>) => (name: string) => vars[name];

describe('resolveAceProviderConfig', () => {
  it('resolves Anthropic by default with the safe fallback model', () => {
    const cfg = resolveAceProviderConfig(envOf({ ANTHROPIC_API_KEY: 'sk-live' }));
    expect(cfg).toEqual({ provider: 'anthropic', apiKey: 'sk-live', model: DEFAULT_ACE_MODEL });
  });

  it('prefers ACE_API_KEY, then ANTHROPIC_API_KEY, then legacy ANTHROPIC', () => {
    expect(resolveAceProviderConfig(envOf({ ACE_API_KEY: 'a', ANTHROPIC_API_KEY: 'b', ANTHROPIC: 'c' })).apiKey).toBe('a');
    expect(resolveAceProviderConfig(envOf({ ANTHROPIC_API_KEY: 'b', ANTHROPIC: 'c' })).apiKey).toBe('b');
    expect(resolveAceProviderConfig(envOf({ ANTHROPIC: 'c' })).apiKey).toBe('c');
  });

  it('treats empty/whitespace keys as unset and falls through the order', () => {
    const cfg = resolveAceProviderConfig(envOf({ ACE_API_KEY: '  ', ANTHROPIC_API_KEY: 'real' }));
    expect(cfg.apiKey).toBe('real');
  });

  it('honours ACE_MODEL when set', () => {
    const cfg = resolveAceProviderConfig(envOf({ ANTHROPIC: 'k', ACE_MODEL: 'claude-sonnet-5' }));
    expect(cfg.model).toBe('claude-sonnet-5');
  });

  it('defaults ACE_PROVIDER to anthropic', () => {
    expect(resolveAceProviderConfig(envOf({ ANTHROPIC: 'k' })).provider).toBe('anthropic');
    expect(resolveAceProviderConfig(envOf({ ACE_PROVIDER: 'Anthropic', ANTHROPIC: 'k' })).provider).toBe('anthropic');
  });

  it('fails closed with a value-free error when no key is configured', () => {
    try {
      resolveAceProviderConfig(envOf({}));
      throw new Error('expected AceConfigError');
    } catch (err) {
      expect(err).toBeInstanceOf(AceConfigError);
      expect((err as Error).message).toContain('ACE_API_KEY');
      expect((err as Error).message).toContain('ANTHROPIC');
    }
  });

  it('rejects an unsupported configured provider clearly', () => {
    try {
      resolveAceProviderConfig(envOf({ ACE_PROVIDER: 'openai', ACE_API_KEY: 'sk' }));
      throw new Error('expected AceConfigError');
    } catch (err) {
      expect(err).toBeInstanceOf(AceConfigError);
      expect((err as Error).message).toContain('openai');
      expect((err as Error).message).toContain('anthropic');
    }
  });

  it('never includes the key value in a config error', () => {
    try {
      resolveAceProviderConfig(envOf({ ACE_PROVIDER: 'openai', ACE_API_KEY: 'sk-secret-value' }));
    } catch (err) {
      expect((err as Error).message).not.toContain('sk-secret-value');
    }
  });
});
