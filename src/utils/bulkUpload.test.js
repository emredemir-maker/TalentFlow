import { describe, it, expect } from 'vitest';
import { batchFilesBySize, formatBytes, totalBytes, MAX_REQUEST_BYTES } from './bulkUpload';

const MB = 1024 * 1024;
const mkFile = (name, size) => ({ name, size });

describe('batchFilesBySize', () => {
    it('keeps small file sets in a single batch', () => {
        const files = [mkFile('a.zip', 5 * MB), mkFile('b.zip', 5 * MB)];
        const { batches, oversized } = batchFilesBySize(files);
        expect(batches).toHaveLength(1);
        expect(batches[0]).toHaveLength(2);
        expect(oversized).toHaveLength(0);
    });

    it('splits when total size would exceed the limit', () => {
        // 5 x 10MB with a 28MB limit → [10+10] is fine, adding third exceeds → [2,1] wrong?
        // 10+10=20, +10=30 > 28 → new batch. Result: [a,b], [c,d], [e]
        const files = Array.from({ length: 5 }, (_, i) => mkFile(`f${i}.zip`, 10 * MB));
        const { batches } = batchFilesBySize(files);
        expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    });

    it('respects the per-request file-count cap', () => {
        const files = Array.from({ length: 45 }, (_, i) => mkFile(`f${i}.pdf`, 1024));
        const { batches } = batchFilesBySize(files, MAX_REQUEST_BYTES, 20);
        expect(batches.map((b) => b.length)).toEqual([20, 20, 5]);
    });

    it('separates files that alone exceed the limit', () => {
        const files = [mkFile('ok.zip', 3 * MB), mkFile('huge.zip', 40 * MB), mkFile('ok2.zip', 2 * MB)];
        const { batches, oversized } = batchFilesBySize(files);
        expect(oversized.map((f) => f.name)).toEqual(['huge.zip']);
        expect(batches).toHaveLength(1);
        expect(batches[0].map((f) => f.name)).toEqual(['ok.zip', 'ok2.zip']);
    });

    it('preserves file order across batches', () => {
        const files = [mkFile('a', 15 * MB), mkFile('b', 15 * MB), mkFile('c', 15 * MB)];
        const { batches } = batchFilesBySize(files);
        expect(batches.map((b) => b.map((f) => f.name))).toEqual([['a'], ['b'], ['c']]);
    });

    it('returns empty results for empty input', () => {
        const { batches, oversized } = batchFilesBySize([]);
        expect(batches).toEqual([]);
        expect(oversized).toEqual([]);
    });

    it('does not mutate the input array', () => {
        const files = [mkFile('a', MB), mkFile('b', MB)];
        batchFilesBySize(files);
        expect(files).toHaveLength(2);
    });
});

describe('formatBytes', () => {
    it('formats MB, KB and bytes', () => {
        expect(formatBytes(3.2 * MB)).toBe('3.2 MB');
        expect(formatBytes(512 * 1024)).toBe('512 KB');
        expect(formatBytes(42)).toBe('42 B');
        expect(formatBytes(undefined)).toBe('0 B');
    });
});

describe('totalBytes', () => {
    it('sums file sizes safely', () => {
        expect(totalBytes([mkFile('a', 100), mkFile('b', 200), { name: 'c' }])).toBe(300);
        expect(totalBytes([])).toBe(0);
    });
});
