import { describe, it, expect } from 'vitest';
import {
    resolveStageKey,
    getAppliedDate,
    applyTableFilters,
    sortRows,
    buildExportRows,
    DEFAULT_FILTERS,
} from './candidateTable';

const mkTs = (iso) => ({ toMillis: () => new Date(iso).getTime() });

const CANDIDATES = [
    {
        id: '1', name: 'Ayşe Yılmaz', email: 'ayse@example.com', phone: '+90 555 111 1111',
        position: 'Frontend Developer', bestTitle: 'Frontend Developer', department: 'Yazılım',
        source: 'LinkedIn', sourceDetail: 'Sponsorlu', status: 'interview',
        bestScore: 85, interviewScore: 90, combinedScore: 88, experience: 5,
        location: 'İstanbul', education: 'Bilgisayar Müh.', skills: ['React', 'TypeScript'],
        appliedDate: '2026-07-01',
    },
    {
        id: '2', name: 'Mehmet Demir', email: 'mehmet@example.com', phone: '+90 555 222 2222',
        position: 'Backend Developer', bestTitle: 'Backend Developer', department: 'Yazılım',
        source: 'Kariyer.net', status: 'new', // legacy status → ai_analysis
        bestScore: 70, interviewScore: null, combinedScore: 70, experience: 3,
        location: 'Ankara', skills: ['Node.js'], createdAt: mkTs('2026-07-15T09:30:00Z'),
    },
    {
        id: '3', name: 'Zeynep Çelik', email: 'zeynep@example.com',
        position: 'İK Uzmanı', bestTitle: 'İK Uzmanı', department: 'İnsan Kaynakları',
        source: 'LinkedIn', status: 'hired',
        bestScore: 60, interviewScore: 75, combinedScore: 68, experience: 8,
        location: 'İzmir', skills: [], appliedDate: '2026-06-20',
    },
];

describe('resolveStageKey', () => {
    it('maps canonical keys to themselves', () => {
        expect(resolveStageKey('interview')).toBe('interview');
        expect(resolveStageKey('hired')).toBe('hired');
    });
    it('maps legacy statuses onto canonical stages', () => {
        expect(resolveStageKey('new')).toBe('ai_analysis');
        expect(resolveStageKey('Review')).toBe('review');
        expect(resolveStageKey('Mülakat')).toBe('interview');
    });
    it('falls back to ai_analysis for unknown/empty', () => {
        expect(resolveStageKey('')).toBe('ai_analysis');
        expect(resolveStageKey('garbage')).toBe('ai_analysis');
    });
});

describe('getAppliedDate', () => {
    it('prefers explicit appliedDate', () => {
        expect(getAppliedDate(CANDIDATES[0])).toBe('2026-07-01');
    });
    it('falls back to createdAt timestamp', () => {
        expect(getAppliedDate(CANDIDATES[1])).toBe('2026-07-15');
    });
    it('returns empty string when neither exists', () => {
        expect(getAppliedDate({})).toBe('');
    });
});

describe('applyTableFilters', () => {
    it('returns all rows with default filters', () => {
        expect(applyTableFilters(CANDIDATES, DEFAULT_FILTERS)).toHaveLength(3);
    });
    it('searches across name, email and skills', () => {
        expect(applyTableFilters(CANDIDATES, { search: 'ayşe' })).toHaveLength(1);
        expect(applyTableFilters(CANDIDATES, { search: 'mehmet@' })).toHaveLength(1);
        expect(applyTableFilters(CANDIDATES, { search: 'react' })).toHaveLength(1);
        expect(applyTableFilters(CANDIDATES, { search: 'bulunamaz' })).toHaveLength(0);
    });
    it('filters by stage including legacy statuses', () => {
        const rows = applyTableFilters(CANDIDATES, { stage: 'ai_analysis' });
        expect(rows.map((c) => c.id)).toEqual(['2']);
    });
    it('filters by position, department and source', () => {
        expect(applyTableFilters(CANDIDATES, { position: 'İK Uzmanı' })).toHaveLength(1);
        expect(applyTableFilters(CANDIDATES, { department: 'Yazılım' })).toHaveLength(2);
        expect(applyTableFilters(CANDIDATES, { source: 'LinkedIn' })).toHaveLength(2);
    });
    it('filters by minimum combined score', () => {
        const rows = applyTableFilters(CANDIDATES, { minScore: '70' });
        expect(rows.map((c) => c.id).sort()).toEqual(['1', '2']);
    });
    it('filters by applied date range', () => {
        const rows = applyTableFilters(CANDIDATES, { dateFrom: '2026-07-01', dateTo: '2026-07-10' });
        expect(rows.map((c) => c.id)).toEqual(['1']);
    });
    it('combines filters with AND', () => {
        const rows = applyTableFilters(CANDIDATES, { source: 'LinkedIn', department: 'Yazılım' });
        expect(rows.map((c) => c.id)).toEqual(['1']);
    });
    it('does not mutate the input array', () => {
        const input = [...CANDIDATES];
        applyTableFilters(input, { search: 'ayşe' });
        expect(input).toHaveLength(3);
    });
});

describe('sortRows', () => {
    it('sorts numerically descending by default', () => {
        expect(sortRows(CANDIDATES, 'combinedScore').map((c) => c.id)).toEqual(['1', '2', '3']);
    });
    it('sorts numerically ascending', () => {
        expect(sortRows(CANDIDATES, 'experience', 'asc').map((c) => c.id)).toEqual(['2', '1', '3']);
    });
    it('sorts strings with Turkish locale', () => {
        expect(sortRows(CANDIDATES, 'name', 'asc').map((c) => c.name)).toEqual([
            'Ayşe Yılmaz', 'Mehmet Demir', 'Zeynep Çelik',
        ]);
    });
    it('puts null values last in both directions', () => {
        expect(sortRows(CANDIDATES, 'interviewScore', 'desc').map((c) => c.id)).toEqual(['1', '3', '2']);
        expect(sortRows(CANDIDATES, 'interviewScore', 'asc').map((c) => c.id)).toEqual(['3', '1', '2']);
    });
    it('returns a new array without mutating input', () => {
        const input = [...CANDIDATES];
        const sorted = sortRows(input, 'name', 'asc');
        expect(sorted).not.toBe(input);
        expect(input.map((c) => c.id)).toEqual(['1', '2', '3']);
    });
    it('returns a copy for unknown sort keys', () => {
        expect(sortRows(CANDIDATES, 'nope').map((c) => c.id)).toEqual(['1', '2', '3']);
    });
});

describe('buildExportRows', () => {
    it('maps candidates to Turkish-labelled flat rows', () => {
        const [row] = buildExportRows([CANDIDATES[0]]);
        expect(row).toEqual({
            'Ad Soyad': 'Ayşe Yılmaz',
            'E-posta': 'ayse@example.com',
            'Telefon': '+90 555 111 1111',
            'Pozisyon': 'Frontend Developer',
            'Departman': 'Yazılım',
            'Aşama': 'Mülakat',
            'Kaynak': 'LinkedIn',
            'Kaynak Detayı': 'Sponsorlu',
            'AI Skoru': 85,
            'Mülakat Skoru': 90,
            'Genel Skor': 88,
            'Deneyim (Yıl)': 5,
            'Lokasyon': 'İstanbul',
            'Eğitim': 'Bilgisayar Müh.',
            'Yetenekler': 'React, TypeScript',
            'Başvuru Tarihi': '2026-07-01',
        });
    });
    it('renders empty strings for missing fields and blank for null scores', () => {
        const [row] = buildExportRows([{ id: 'x', status: 'new' }]);
        expect(row['Ad Soyad']).toBe('');
        expect(row['Aşama']).toBe('Ön Eleme');
        expect(row['Mülakat Skoru']).toBe('');
        expect(row['Yetenekler']).toBe('');
    });
});
