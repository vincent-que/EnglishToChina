import { useThemeStore } from '../stores/theme-store';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: 'workspace' | 'settings' | 'activation') => void;
}

const navItems = [
  { id: 'workspace' as const, label: '工作台' },
  { id: 'settings' as const, label: '翻译设置' },
  { id: 'activation' as const, label: '账户信息' },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">译</div>
        <span className="sidebar-logo-text">英文转中文</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">主要功能</div>
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {item.id === 'workspace' && (
                <>
                  <rect width="7" height="9" x="3" y="3" rx="1" />
                  <rect width="7" height="5" x="14" y="3" rx="1" />
                  <rect width="7" height="9" x="14" y="12" rx="1" />
                  <rect width="7" height="5" x="3" y="16" rx="1" />
                </>
              )}
              {item.id === 'settings' && (
                <>
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
              {item.id === 'activation' && (
                <>
                  <circle cx="12" cy="8" r="5" />
                  <path d="M20 21a8 8 0 0 0-16 0" />
                </>
              )}
            </svg>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="nav-item" onClick={toggleTheme}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {theme === 'light' ? (
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" x2="12" y1="1" y2="3" />
                <line x1="12" x2="12" y1="21" y2="23" />
                <line x1="4.22" x2="5.64" y1="4.22" y2="5.64" />
                <line x1="18.36" x2="19.78" y1="18.36" y2="19.78" />
                <line x1="1" x2="3" y1="12" y2="12" />
                <line x1="21" x2="23" y1="12" y2="12" />
                <line x1="4.22" x2="5.64" y1="19.78" y2="18.36" />
                <line x1="18.36" x2="19.78" y1="5.64" y2="4.22" />
              </>
            )}
          </svg>
          <span>{theme === 'light' ? '深色模式' : '浅色模式'}</span>
        </div>
      </div>

      <style>{`
        .sidebar {
          width: 220px;
          background: var(--bg-sidebar);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 16px 8px;
          flex-shrink: 0;
          -webkit-app-region: drag;
          height: 100vh;
        }
        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px 20px;
          -webkit-app-region: no-drag;
        }
        .sidebar-logo-icon {
          width: 32px;
          height: 32px;
          background: var(--primary);
          color: var(--text-on-primary);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .sidebar-logo-text {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .sidebar-nav {
          flex: 1;
          -webkit-app-region: no-drag;
        }
        .sidebar-section-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-tertiary);
          padding: 8px 12px 6px;
          margin-top: 8px;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 450;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          user-select: none;
          position: relative;
          -webkit-app-region: no-drag;
        }
        .nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .nav-item.active {
          background: var(--primary-ghost);
          color: var(--primary);
          font-weight: 500;
        }
        .nav-item.active::before {
          content: "";
          position: absolute;
          left: 0;
          top: 6px;
          bottom: 6px;
          width: 3px;
          background: var(--primary);
          border-radius: 0 2px 2px 0;
        }
        .sidebar-footer {
          padding-top: 8px;
          border-top: 1px solid var(--border);
          -webkit-app-region: no-drag;
        }
      `}</style>
    </aside>
  );
}
