// src/App.jsx
// Main application with collapsible sidebar and view routing

import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { CandidatesProvider } from './context/CandidatesContext';
import { PositionsProvider } from './context/PositionsContext';
import { UserSettingsProvider } from './context/UserSettingsContext';
import { MessageQueueProvider } from './context/MessageQueueContext';
import Sidebar from './components/Sidebar';
import LoadingScreen from './components/LoadingScreen';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/SettingsPage';
import MessagesPage from './pages/MessagesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ScraperPage from './pages/ScraperPage';
import AIMatchPage from './pages/AIMatchPage';
import PositionsPage from './pages/PositionsPage';
import CandidateProcessPage from './pages/CandidateProcessPage';
import PlaceholderPage from './pages/PlaceholderPage';

function AppContent() {
  const { loading, error, isAuthenticated } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auth loading
  if (loading) {
    return (
      <LoadingScreen
        message="TalentFlow Başlatılıyor..."
        subtext="Firebase kimlik doğrulaması bekleniyor"
      />
    );
  }

  // Auth error
  if (error && !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-navy-900">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-lg font-bold text-navy-200">Kimlik Doğrulama Hatası</h2>
        <p className="text-sm text-navy-400 max-w-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-electric to-blue-500 text-white text-sm font-semibold shadow-[0_4px_16px_rgba(59,130,246,0.25)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.35)] transition-all cursor-pointer"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  const renderPage = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'settings':
        return <SettingsPage />;
      case 'messages':
        return <MessagesPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'scraper':
        return <ScraperPage />;
      case 'ai-match':
        return <AIMatchPage />;
      case 'candidate-process':
        return <CandidateProcessPage />;
      case 'positions':
        return <PositionsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <PositionsProvider>
      <CandidatesProvider>
        <UserSettingsProvider>
          <MessageQueueProvider>
            <div className="flex min-h-screen">
              <Sidebar
                activeView={activeView}
                onNavigate={setActiveView}
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
              />
              <main
                className={`flex-1 min-h-screen transition-all duration-300 pb-16 md:pb-0
                  ${sidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[220px]'}`}
              >
                {renderPage()}
              </main>
            </div>
          </MessageQueueProvider>
        </UserSettingsProvider>
      </CandidatesProvider>
    </PositionsProvider>
  );
}

export default function App() {
  return <AppContent />;
}
