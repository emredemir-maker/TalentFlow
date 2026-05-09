// Tests for the Gemini access layer — Phase 4c.
//
// Targets:
//   1. Cache behavior — same prompt + modelId returns cached result; useCache:false bypasses
//   2. Retry on transient errors with exponential backoff
//   3. Non-transient errors fail immediately
//   4. parseProfile success path (markdown stripping, JSON parsing)
//   5. parseProfile failure path (returns null, doesn't throw)
//
// Strategy: mock the @google/generative-ai SDK at the module level so we
// control what generateContent() resolves/rejects with. Keep firebase-admin
// behind a stub so requiring db doesn't actually hit Firebase.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @google/generative-ai BEFORE the module under test imports it.
// vi.hoisted ensures the factory runs before any imports.
const mockGenerateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/generative-ai', () => {
    // Using a real class declaration so `new GoogleGenerativeAI(key)` works
    // — vi.fn().mockImplementation can be invoked as a constructor in newer
    // vitest, but the class form is unambiguous and easier to debug.
    class GoogleGenerativeAI {
        getGenerativeModel() {
            return { generateContent: mockGenerateContent };
        }
    }
    return { GoogleGenerativeAI };
});

// Mock firebase-admin path that the gemini module imports indirectly.
// We don't want firebase-admin trying to initialize during tests.
vi.mock('../config/firebaseAdmin.js', () => ({
    db: {
        doc: () => ({
            get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        }),
    },
    admin: {},
}));

// Now safe to import the module.
const { generateText, parseProfile } = await import('./gemini.js');

beforeEach(() => {
    mockGenerateContent.mockReset();
    // Force env-key path so getApiKey() succeeds without firestore lookup
    process.env.GEMINI_API_KEY = 'test-key-for-vitest';
});

afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.useRealTimers();
});

describe('generateText', () => {
    it('returns the model output text on success', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'hello world' },
        });

        const result = await generateText('say hi');
        expect(result).toBe('hello world');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('caches identical prompts (second call does not hit the model)', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'cached-result' },
        });

        // Use a prompt unique to this test so other tests don't poison cache
        const uniquePrompt = `cache-test-${Date.now()}-${Math.random()}`;
        const a = await generateText(uniquePrompt);
        const b = await generateText(uniquePrompt);
        expect(a).toBe('cached-result');
        expect(b).toBe('cached-result');
        // Crucial: the model was only called once
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('treats different modelIds as cache-distinct', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'r' },
        });

        const prompt = `model-distinct-${Date.now()}-${Math.random()}`;
        await generateText(prompt, { modelId: 'gemini-2.5-flash' });
        await generateText(prompt, { modelId: 'gemini-2.5-pro' });
        // Different model = different cache key = both calls hit the model
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('useCache:false bypasses cache (audio/STT pattern)', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'r' },
        });

        const prompt = `nocache-${Date.now()}-${Math.random()}`;
        await generateText(prompt, { useCache: false });
        await generateText(prompt, { useCache: false });
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('retries on 429 (rate limit) and eventually succeeds', async () => {
        // First two calls: transient. Third: success.
        mockGenerateContent
            .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED quota'))
            .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED'))
            .mockResolvedValueOnce({ response: { text: () => 'eventually' } });

        // Fake timers so we don't actually wait for the backoff sleeps.
        vi.useFakeTimers();
        const promise = generateText(`retry-${Math.random()}`);
        // The implementation does N rounds of `await new Promise(setTimeout)`;
        // step the clock forward enough to clear all backoffs (max ~16s each).
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe('eventually');
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('does not retry on non-transient errors (e.g., 400 invalid argument)', async () => {
        mockGenerateContent.mockRejectedValue(new Error('400 INVALID_ARGUMENT'));

        await expect(generateText(`nonretry-${Math.random()}`)).rejects.toThrow(
            /INVALID_ARGUMENT/
        );
        // Single attempt — no retry on a non-matching error
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('throws after MAX_RETRIES (5 total attempts) of persistent transient errors', async () => {
        mockGenerateContent.mockRejectedValue(new Error('503 UNAVAILABLE'));

        vi.useFakeTimers();
        const promise = generateText(`exhausted-${Math.random()}`);
        // Attach the rejection assertion BEFORE stepping timers. `expect(...).rejects`
        // returns a thenable, so wrapping it in a local promise pre-handles the
        // rejection and avoids vitest's unhandled-rejection warning while the
        // backoff loop is still mid-flight.
        const assertion = expect(promise).rejects.toThrow(/UNAVAILABLE/);
        await vi.runAllTimersAsync();
        await assertion;
        // MAX_RETRIES = 4, so 5 total attempts (initial + 4 retries)
        expect(mockGenerateContent).toHaveBeenCalledTimes(5);
    });
});

describe('parseProfile', () => {
    // Each test uses a unique input text so the in-memory cache (keyed on
    // prompt content) doesn't return a stale entry across tests.
    const uniq = () => `profile-${Date.now()}-${Math.random()}`;

    it('parses well-formed JSON output and returns the object', async () => {
        const fakeProfile = {
            name: 'Ada Lovelace',
            position: 'Mathematician',
            company: 'Royal Society',
            location: 'London, UK',
            skills: ['math', 'analytical engine'],
            experience: 5,
            education: 'University of London',
            summary: 'İlk programcı.',
            source: 'Auto Scraper',
        };
        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(fakeProfile) },
        });

        const result = await parseProfile(uniq());
        expect(result).toEqual(fakeProfile);
    });

    it('strips ```json fences before parsing', async () => {
        const fakeProfile = { name: 'Test', position: 'X' };
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => '```json\n' + JSON.stringify(fakeProfile) + '\n```',
            },
        });

        const result = await parseProfile(uniq());
        expect(result.name).toBe('Test');
    });

    it('returns null on malformed JSON instead of throwing', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'this is not json {' },
        });

        // parseProfile must NEVER throw — calling code (CV import, scraper)
        // proceeds with null and skips that candidate. A throw would crash
        // the whole bulk job.
        const result = await parseProfile(uniq());
        expect(result).toBeNull();
    });

    it('returns null when the model itself errors', async () => {
        mockGenerateContent.mockRejectedValue(new Error('some model failure'));

        const result = await parseProfile(uniq());
        expect(result).toBeNull();
    });
});
