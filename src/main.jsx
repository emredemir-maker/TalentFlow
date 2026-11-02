import { createRoot } from 'react-dom/client';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { installTenantFetch } from './services/tenantFetch';
import { setActiveTenantId } from './config/tenantPaths';
import { publicPageTenant } from './context/AuthContext';

// Kendi API'mize giden isteklere etkin şirket başlığı (X-Tenant-Id).
installTenantFetch();

// Herkese açık iç sayfalar (/live-interview, /interview-report, /face-interview)
// şirketi adresteki ipucundan alır; ilk çizimden ÖNCE. Aday bağlantılarında
// (/apply, /join, /respond) şirketi PublicLinkGate sunucudan çözer.
const initialTenant = publicPageTenant();
if (initialTenant) setActiveTenantId(initialTenant);

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
