import { createRoot } from 'react-dom/client';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

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
