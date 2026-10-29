import { createRoot } from 'react-dom/client';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { installTenantFetch } from './services/tenantFetch';
import { setActiveTenantId, tenantFromLocation } from './config/tenantPaths';
import { isPublicPath } from './context/AuthContext';

// Kendi API'mize giden isteklere etkin şirket başlığı (X-Tenant-Id).
installTenantFetch();

// Aday sayfaları şirketi bağlantıdan alır (?tenantId=…, PR 5'e kadar). İlk
// çizimden ÖNCE: sayfanın ilk okuması şirket yolunu kullanıyor.
if (isPublicPath()) setActiveTenantId(tenantFromLocation());

const container = document.getElementById('root');
if (!container) {
    console.error('Root container (#root) not found!');
} else {
    createRoot(container).render(
        // EN DIŞ HATA SINIRI.
        // İçerideki sınırlar sağlayıcıların ALTINDA duruyor; bir context
        // sağlayıcısının kendi render'ı çökerse onlara hiç sıra gelmez.
        // Bu sınır o durumda da ekranın beyaz kalmasını engeller.
        <ErrorBoundary scope="Uygulama başlangıcı">
            <BrowserRouter>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </BrowserRouter>
        </ErrorBoundary>
    );
}
