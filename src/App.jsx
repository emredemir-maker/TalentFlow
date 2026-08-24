// src/App.jsx
import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CandidatesProvider } from './context/CandidatesContext';
import { PositionsProvider } from './context/PositionsContext';
import { UserSettingsProvider } from './context/UserSettingsContext';
import { MessageQueueProvider } from './context/MessageQueueContext';
import { NotificationProvider } from './context/NotificationContext';

import Sidebar from './components/Sidebar';
import HrAssistantPanel from './components/HrAssistantPanel';
import LoadingScreen from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
// LoginPage stays eager — it's the first paint before auth resolves so
// shipping a separate chunk just to wait for it on cold start hurts TTI.
import LoginPage from './pages/LoginPage';

/**
 * Deploy sırasında AÇIK kalan sekmeler için sayfa yükleyici.
 *
 * Yeni deploy eski parça dosyalarını siler. Açık sekme hâlâ eski
 * index.html'i çalıştırdığı için artık var olmayan bir dosya ister;
 * Hosting de SPA kuralı gereği index.html döndürür ve tarayıcı patlar:
 *   "Failed to load module script ... MIME type of text/html"
 * Kullanıcı bunu "sayfaya girilemiyor" olarak görür — canlıda yaşandı.
 *
 * Böyle bir hatada BİR KEZ yenileriz: yeni index.html gelir, doğru
 * parçalar yüklenir. Tek seferlik, çünkü yenileme de çözmüyorsa sorun
 * başka yerdedir ve sonsuz döngüye girmek en kötüsü olurdu.
 *
 * Kalıcı çözüm firebase.json'daki cache başlıkları; bu, o başlıklar
 * doğruyken bile açık kalan sekmeler için ikinci savunma hattı.
 */
const RELOAD_KEY = 'tf-chunk-reload';

const readFlag = () => { try { return sessionStorage.getItem(RELOAD_KEY); } catch { return null; } };
const writeFlag = (v) => { try { v ? sessionStorage.setItem(RELOAD_KEY, v) : sessionStorage.removeItem(RELOAD_KEY); } catch { /* özel mod */ } };

function lazyPage(factory) {
    return lazy(() => factory().then(
        (mod) => { writeFlag(null); return mod; },
        (err) => {
            if (readFlag()) throw err;
            writeFlag('1');
            window.location.reload();
            // Yenileme başlarken Suspense beklemede kalsın; hata ekranı
            // görünüp hemen kaybolmasın.
            return new Promise(() => {});
        }
    ));
}

// Every other page is route-level code-split via React.lazy. The page
// chunks are produced as separate JS files by Vite/Rollup, so the
// initial bundle no longer includes ~700KB of inactive screen code
// (LiveInterviewPage 2782 LOC, InterviewManagementPage 2731,
// CandidateProcessPage 2484, etc.). Each page now only loads when its
// route is hit. Suspense fallback below renders LoadingScreen while
// the chunk is in flight.
const Dashboard               = lazyPage(() => import('./pages/Dashboard'));
const SettingsPage            = lazyPage(() => import('./pages/SettingsPage'));
const MessagesPage            = lazyPage(() => import('./pages/MessagesPage'));
const CandidateProcessPage    = lazyPage(() => import('./pages/CandidateProcessPage'));
const CandidatesTablePage     = lazyPage(() => import('./pages/CandidatesTablePage'));
const PositionsPage           = lazyPage(() => import('./pages/PositionsPage'));
const AnalyticsPage           = lazyPage(() => import('./pages/AnalyticsPage'));
const InterviewManagementPage = lazyPage(() => import('./pages/InterviewManagementPage'));
const LiveInterviewPage       = lazyPage(() => import('./pages/LiveInterviewPage'));
const FaceToFacePage          = lazyPage(() => import('./pages/FaceToFacePage'));
const InterviewReportPage     = lazyPage(() => import('./pages/InterviewReportPage'));
const CandidateExitPage       = lazyPage(() => import('./pages/CandidateExitPage'));
const ApplyPage               = lazyPage(() => import('./pages/ApplyPage'));
const TechDocsPage            = lazyPage(() => import('./pages/TechDocsPage'));
const PipelinePage            = lazyPage(() => import('./pages/PipelinePage'));
const CandidateRespondPage    = lazyPage(() => import('./pages/CandidateRespondPage'));
const IntegrationsPage        = lazyPage(() => import('./pages/IntegrationsPage'));
const MicrosoftCallbackPage   = lazyPage(() => import('./pages/MicrosoftCallbackPage'));
const GoogleCallbackPage      = lazyPage(() => import('./pages/GoogleCallbackPage'));

// Tiny inline fallback for in-app route transitions — a full LoadingScreen
// flashes too aggressively for sub-second chunk fetches. Used only for
// authenticated route changes; public routes use the full LoadingScreen.
function PageFallback() {
    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
    );
}

export default function App() {
  return (
    <PositionsProvider>
      <CandidatesProvider>
        <UserSettingsProvider>
          <NotificationProvider>
            <MessageQueueProvider>
              {/* Public routes use the full LoadingScreen because the URL maps
                  one-to-one to a single screen — there's no shell to fall back
                  to while the chunk loads. */}
              <ErrorBoundary scope="Uygulama">
              <Suspense fallback={<LoadingScreen message="Yükleniyor..." />}>
                <Routes>
                  <Route path="/live-interview/:sessionId" element={<LiveInterviewPage />} />
                  <Route path="/face-interview/:sessionId" element={<FaceToFacePage />} />
                  <Route path="/join/:sessionId" element={<LiveInterviewPage />} />
                  <Route path="/interview-report/:sessionId" element={<InterviewReportPage />} />
                  <Route path="/exit" element={<CandidateExitPage />} />
                  <Route path="/apply/:positionId" element={<ApplyPage />} />
                  <Route path="/respond/:id" element={<CandidateRespondPage />} />
                  <Route path="/auth/microsoft/callback" element={<MicrosoftCallbackPage />} />
                  <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
                  <Route path="/*" element={<AuthenticatedApp />} />
                </Routes>
              </Suspense>
              </ErrorBoundary>
            </MessageQueueProvider>
          </NotificationProvider>
        </UserSettingsProvider>
      </CandidatesProvider>
    </PositionsProvider>
  );
}

function AuthenticatedApp() {
  const { loading, error, isAuthenticated, user, userProfile } = useAuth();
  // Derin-link: ?aday=<id> ile gelindiyse girişten sonra aday detayında
  // başla (CandidatesContext aynı parametreden viewCandidateId'yi kurar).
  const [activeView, setActiveView] = useState(
    () => (new URLSearchParams(window.location.search).get('aday') ? 'candidate-process' : 'dashboard')
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Mobile drawer (<lg). Desktop layout (≥lg) uses sidebarCollapsed instead.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleNav = (e) => {
      if (typeof e.detail === 'string') {
        setActiveView(e.detail);
      } else if (e.detail?.view) {
        setActiveView(e.detail.view);
      }
      // Closing nav also closes the mobile drawer if open.
      setMobileSidebarOpen(false);
    };
    const handleOpenMobile = () => setMobileSidebarOpen(true);
    window.addEventListener('changeView', handleNav);
    window.addEventListener('openMobileSidebar', handleOpenMobile);
    return () => {
      window.removeEventListener('changeView', handleNav);
      window.removeEventListener('openMobileSidebar', handleOpenMobile);
    };
  }, []);

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
      case 'candidates-table': return <CandidatesTablePage />;
      case 'positions': return <PositionsPage />;
      case 'interviews': return <InterviewManagementPage />;
      case 'pipeline': return <PipelinePage />;
      case 'sources': return <SettingsPage initialTab="sources" />;
      case 'departments': return <SettingsPage initialTab="departments" />;
      case 'guide': return <SettingsPage initialTab="guide" />;
      case 'super-admin': return <SettingsPage initialTab="system" />;
      case 'tech-docs': return userProfile?.role === 'super_admin' ? <TechDocsPage /> : <Dashboard />;
      case 'integrations': return userProfile?.role === 'super_admin' ? <IntegrationsPage /> : <Dashboard />;
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
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <main
        className={`flex-1 min-h-screen transition-all duration-300 min-w-0
          ${sidebarCollapsed ? 'lg:ml-[80px]' : 'lg:ml-[196px]'}`}
      >
        {/* In-app route changes — sidebar/header are already painted, so
            the inline spinner is enough until the page chunk arrives. */}
        {/* HER EKRAN KENDİ HATA SINIRI İÇİNDE.
            Bir sayfanın render'ı çökerse yalnızca o sayfanın yerine hata
            kartı gelir; kenar menü, başlık ve diğer ekranlar ayakta kalır.
            `resetKey` görünüm adı: kullanıcı başka bir ekrana geçtiğinde
            sınır kendini sıfırlar. */}
        <ErrorBoundary scope={`Ekran: ${activeView}`} resetKey={activeView}>
          <Suspense fallback={<PageFallback />}>
            {renderPage()}
          </Suspense>
        </ErrorBoundary>
      </main>
      {/* Her ekranda erişilebilir; yalnızca okur, hiçbir şeyi değiştirmez. */}
      <HrAssistantPanel />
    </div>
  );
}
