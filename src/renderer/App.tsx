import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './pages/Workspace';
import { Settings } from './pages/Settings';
import { Activation } from './pages/Activation';
import { useThemeStore } from './stores/theme-store';

type Page = 'workspace' | 'settings' | 'activation';

export default function App() {
  const [page, setPage] = useState<Page>('workspace');
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const renderPage = () => {
    switch (page) {
      case 'workspace':
        return <Workspace />;
      case 'settings':
        return <Settings />;
      case 'activation':
        return <Activation />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="app-main">{renderPage()}</main>
    </div>
  );
}
