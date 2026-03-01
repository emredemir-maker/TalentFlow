// src/App.jsx
// Main application with collapsible sidebar and view routing

import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { CandidatesProvider } from './context/CandidatesContext';
import { PositionsProvider } from './context/PositionsContext';
import { UserSettingsProvider, useUserSettings } from './context/UserSettingsContext';
import { MessageQueueProvider } from './context/MessageQueueContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import Sidebar from './components/Sidebar';
import LoadingScreen from './components/LoadingScreen';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/SettingsPage';
import MessagesPage from './pages/MessagesPage';
import CandidateProcessPage from './pages/CandidateProcessPage';
import PositionsPage from './pages/PositionsPage';
import SuperAdminPage from './pages/SuperAdminPage';
import LoginPage from './pages/LoginPage';
import AnalyticsPage from './pages/AnalyticsPage';
import GuidePage from './pages/GuidePage';
import DepartmentManagementPage from './pages/DepartmentManagementPage';
import SourceManagementPage from './pages/SourceManagementPage';

export default function App() {
  return (
    <PositionsProvider>
      <CandidatesProvider>
        <UserSettingsProvider>
          <NotificationProvider>
            <MessageQueueProvider>
              <AppContent />
            </MessageQueueProvider>
          </NotificationProvider>
        </UserSettingsProvider>
      </CandidatesProvider>
    </PositionsProvider>
  );
}

function AppContent() {
  const { loading, error, isAuthenticated } = useAuth();
  const { settings } = useUserSettings();
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const handleNav = (e) => setActiveView(e.detail);
    window.addEventListener('changeView', handleNav);
    return () => window.removeEventListener('changeView', handleNav);
  }, []);

  useEffect(() => {
    if (settings?.theme) {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
  }, [settings?.theme]);

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
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard />;
      case 'settings': return <SettingsPage />;
      case 'messages': return <MessagesPage />;
      case 'analytics': return <AnalyticsPage />;
      case 'candidate-process': return <CandidateProcessPage />;
      case 'positions': return <PositionsPage />;
      case 'guide': return <GuidePage />;
      case 'super-admin': return <SuperAdminPage />;
      case 'departments': return <DepartmentManagementPage />;
      case 'sources': return <SourceManagementPage />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-bg-primary transition-colors duration-500">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main
        className={`flex-1 min-h-screen transition-all duration-300 pb-12 md:pb-0 min-w-0
          ${sidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[240px]'}`}
      >
        {renderPage()}
      </main>
    </div>
  );
}
