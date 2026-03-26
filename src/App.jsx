// src/App.jsx
import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CandidatesProvider } from './context/CandidatesContext';
import { PositionsProvider } from './context/PositionsContext';
import { UserSettingsProvider, useUserSettings } from './context/UserSettingsContext';
import { MessageQueueProvider } from './context/MessageQueueContext';
import { NotificationProvider } from './context/NotificationContext';

import Sidebar from './components/Sidebar';
import LoadingScreen from './components/LoadingScreen';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/SettingsPage';
import MessagesPage from './pages/MessagesPage';
import CandidateProcessPage from './pages/CandidateProcessPage';
import PositionsPage from './pages/PositionsPage';
import LoginPage from './pages/LoginPage';
import AnalyticsPage from './pages/AnalyticsPage';
import InterviewManagementPage from './pages/InterviewManagementPage';
import LiveInterviewPage from './pages/LiveInterviewPage';
import InterviewReportPage from './pages/InterviewReportPage';
import CandidateExitPage from './pages/CandidateExitPage';
import ApplyPage from './pages/ApplyPage';
import TechDocsPage from './pages/TechDocsPage';
import PipelinePage from './pages/PipelinePage';

export default function App() {
  return (
    <PositionsProvider>
      <CandidatesProvider>
        <UserSettingsProvider>
          <NotificationProvider>
            <MessageQueueProvider>
              <Routes>
                <Route path="/live-interview/:sessionId" element={<LiveInterviewPage />} />
                <Route path="/join/:sessionId" element={<LiveInterviewPage />} />
                <Route path="/interview-report/:sessionId" element={<InterviewReportPage />} />
                <Route path="/exit" element={<CandidateExitPage />} />
                <Route path="/apply/:positionId" element={<ApplyPage />} />
                <Route path="/*" element={<AuthenticatedApp />} />
              </Routes>
            </MessageQueueProvider>
          </NotificationProvider>
        </UserSettingsProvider>
      </CandidatesProvider>
    </PositionsProvider>
  );
}

function AuthenticatedApp() {
  const { loading, error, isAuthenticated, user, userProfile } = useAuth();
  const { settings } = useUserSettings();
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleNav = (e) => {
      if (typeof e.detail === 'string') {
        setActiveView(e.detail);
      } else if (e.detail?.view) {
        setActiveView(e.detail.view);
      }
    };
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
        message="Talent-Inn Başlatılıyor..."
        subtext="Firebase kimlik doğrulaması bekleniyor"
      />
    );
  }

  // Not authenticated? Show Login
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // If user is anonymous (candidate), they should not see the dashboard
  if (user?.isAnonymous) {
    return <Navigate to="/exit" replace />;
  }

  const renderPage = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard />;
      case 'settings': return <SettingsPage />;
      case 'messages': return <MessagesPage />;
      case 'analytics': return <AnalyticsPage />;
      case 'candidate-process': return <CandidateProcessPage />;
      case 'positions': return <PositionsPage />;
      case 'interviews': return <InterviewManagementPage />;
      case 'pipeline': return <PipelinePage />;
      case 'sources': return <SettingsPage initialTab="sources" />;
      case 'departments': return <SettingsPage initialTab="departments" />;
      case 'guide': return <SettingsPage initialTab="guide" />;
      case 'super-admin': return <SettingsPage initialTab="system" />;
      case 'tech-docs': return userProfile?.role === 'super_admin' ? <TechDocsPage /> : <Dashboard />;
      case 'live-interview': return <LiveInterviewPage />;
      case 'interview-report': return <InterviewReportPage />;
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
        className={`flex-1 min-h-screen transition-all duration-300 min-w-0
          ${sidebarCollapsed ? 'md:ml-[80px]' : 'md:ml-[240px]'}`}
      >
        {renderPage()}
      </main>
    </div>
  );
}
