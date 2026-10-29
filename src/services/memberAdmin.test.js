// Departmandan çıkarma yalnız o departmanı siler (çok departmanlı üye).
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebase', () => ({ auth: null }));

const { withoutDepartment } = await import('./memberAdmin');

describe('withoutDepartment', () => {
    it('yalnız verilen departmanı çıkarır', () => {
        expect(withoutDepartment(['Eng', 'Sales', 'HR'], 'Sales')).toEqual(['Eng', 'HR']);
        expect(withoutDepartment(['Eng'], 'Sales')).toEqual(['Eng']);
        expect(withoutDepartment(undefined, 'Eng')).toEqual([]);
    });
});
