import { createRoot } from 'react-dom/client';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './index.css';

console.log("[TalentFlow] main.jsx hit - Starting Mount Process");

const container = document.getElementById('root');
if (!container) {
    console.error("[TalentFlow] Root container (#root) not found!");
} else {
    try {
        const root = createRoot(container);
        console.log("[TalentFlow] root created, rendering...");
        root.render(
            <BrowserRouter>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </BrowserRouter>
        );
        console.log("[TalentFlow] initial render call emitted");
    } catch (err) {
        console.error("[TalentFlow] FAILED TO RENDER:", err);
    }
}
