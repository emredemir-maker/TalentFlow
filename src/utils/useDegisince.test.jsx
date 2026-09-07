// @vitest-environment happy-dom
//
// Yeniden render ÖLÇÜLMEK ZORUNDA: kancanın bütün iddiası "ara kare ekrana
// basılmıyor". Depodaki diğer bileşen testleri `renderToStaticMarkup`
// kullanıyor ama o tek seferlik bir çizim — girdi değişimini gösteremez.
// `@testing-library/react` bağımlılık listesinde yok; onu eklemek yerine
// React'in kendi `act`'i ve `react-dom/client` yeterli.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState, useEffect, act } from 'react';
import { createRoot } from 'react-dom/client';
import { useDegisince } from './useDegisince';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let kap;
let kok;

beforeEach(() => {
    kap = document.createElement('div');
    document.body.appendChild(kap);
    kok = createRoot(kap);
});

afterEach(() => {
    act(() => kok.unmount());
    kap.remove();
});

function ciz(element) {
    act(() => kok.render(element));
}

/**
 * `boyananlar` COMMIT EDİLEN değerleri biriktiriyor — render gövdesinde
 * değil, efektte. Ayrım önemli: render sırasında state ayarlandığında React
 * bileşen fonksiyonunu eski değerle bir kez daha ÇALIŞTIRIR ama o sonucu
 * ekrana BASMAZ. Ölçümü render gövdesine koymak, kancanın engellediği şeyi
 * "olmuş" gibi gösterirdi. Efekt yalnızca commit'ten sonra koşuyor.
 */
function Panel({ secili, boyananlar }) {
    const [gosterilen, setGosterilen] = useState(secili);
    useDegisince(secili, (yeni) => setGosterilen(yeni));
    useEffect(() => { boyananlar.push(gosterilen); });
    return <span id="deger">{gosterilen}</span>;
}

const metin = () => kap.querySelector('#deger')?.textContent;

describe('useDegisince', () => {
    it('ilk render girdiyi olduğu gibi gösteriyor', () => {
        const boyananlar = [];
        ciz(<Panel secili="a" boyananlar={boyananlar} />);
        expect(metin()).toBe('a');
        expect(boyananlar).toEqual(['a']);
    });

    // Bu testin bütün mesele olduğu yer: girdi 'a' → 'b' olduğunda 'a' ile
    // ikinci bir kare COMMIT EDİLMİYOR. Efektli sürümde edilirdi.
    it('girdi değişince eski değer ekrana basılmıyor', () => {
        const boyananlar = [];
        ciz(<Panel secili="a" boyananlar={boyananlar} />);
        ciz(<Panel secili="b" boyananlar={boyananlar} />);
        expect(metin()).toBe('b');
        // 'a' yalnızca ilk commit'ten gelmeli; ikinci girdide tekrarlamamalı.
        expect(boyananlar.filter((x) => x === 'a')).toHaveLength(1);
        expect(boyananlar).toEqual(['a', 'b']);
    });

    it('girdi aynı kalırsa geri çağrı çalışmıyor', () => {
        const uygula = vi.fn();
        function Sabit({ girdi }) {
            useDegisince(girdi, uygula);
            return null;
        }
        ciz(<Sabit girdi="x" />);
        ciz(<Sabit girdi="x" />);
        ciz(<Sabit girdi="x" />);
        expect(uygula).not.toHaveBeenCalled();
    });

    it('eski ve yeni değeri geri çağrıya veriyor', () => {
        const uygula = vi.fn();
        function Izleyen({ girdi }) {
            useDegisince(girdi, uygula);
            return null;
        }
        ciz(<Izleyen girdi={1} />);
        ciz(<Izleyen girdi={2} />);
        expect(uygula).toHaveBeenCalledWith(2, 1);
    });

    // `!==` kullanılsaydı NaN kendine eşit olmadığı için her render'da
    // yeniden tetiklenir ve sonsuz döngü kurulurdu. Object.is bunu çözüyor.
    it('NaN değişmemiş sayılıyor — sonsuz döngü kurmuyor', () => {
        const uygula = vi.fn();
        function Sayi({ girdi }) {
            useDegisince(girdi, uygula);
            return null;
        }
        ciz(<Sayi girdi={NaN} />);
        ciz(<Sayi girdi={NaN} />);
        expect(uygula).not.toHaveBeenCalled();
    });

    it('null ve undefined ayrı değerler', () => {
        const uygula = vi.fn();
        function Bos({ girdi }) {
            useDegisince(girdi, uygula);
            return null;
        }
        ciz(<Bos girdi={null} />);
        ciz(<Bos girdi={undefined} />);
        expect(uygula).toHaveBeenCalledWith(undefined, null);
    });

    it('art arda değişimlerde her seferinde çalışıyor', () => {
        const boyananlar = [];
        ciz(<Panel secili="a" boyananlar={boyananlar} />);
        ciz(<Panel secili="b" boyananlar={boyananlar} />);
        ciz(<Panel secili="c" boyananlar={boyananlar} />);
        expect(metin()).toBe('c');
        expect(boyananlar[boyananlar.length - 1]).toBe('c');
    });

    // Nesne girdilerinde kimlik karşılaştırılıyor: aynı içerikli YENİ bir
    // nesne değişim sayılır. Çağıran taraf bunu bilerek kullanıyor —
    // `useMemo` ile üretilen listeler tam da bu yüzden tetikliyor.
    it('aynı içerikli yeni nesne değişim sayılıyor', () => {
        const uygula = vi.fn();
        function Nesne({ girdi }) {
            useDegisince(girdi, uygula);
            return null;
        }
        ciz(<Nesne girdi={{ a: 1 }} />);
        ciz(<Nesne girdi={{ a: 1 }} />);
        expect(uygula).toHaveBeenCalledTimes(1);
    });
});
