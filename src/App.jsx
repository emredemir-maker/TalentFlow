// src/App.jsx
// Main application with collapsible sidebar and view routing

import { useState, useEffect } from 'react';
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
import CandidateProcessPage from './pages/CandidateProcessPage';
import PositionsPage from './pages/PositionsPage';
import SuperAdminPage from './pages/SuperAdminPage';
import LoginPage from './pages/LoginPage';

function AppContent() {
  const { loading, error, isAuthenticated, loginWithGoogle } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const handleNav = (e) => setActiveView(e.detail);
    window.addEventListener('changeView', handleNav);
    return () => window.removeEventListener('changeView', handleNav);
  }, []);

  // Auth loading
  if (loading) {
    return (
      <LoadingScreen
        message="TalentFlow Başlatılıyor..."
        subtext="Firebase kimlik doğrulaması bekleniyor"
      />
    );
  }

  // Not authenticated? Show Login
  if (!isAuthenticated) {
    // If there's an error (like "unauthorized"), LoginPage will display it from context
    return <LoginPage />;
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
      case 'super-admin':
        return <SuperAdminPage />;
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
