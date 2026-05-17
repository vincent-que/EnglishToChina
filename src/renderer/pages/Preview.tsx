import { useTranslationStore } from '../stores/translation-store';

export function Preview() {
  const tasks = useTranslationStore((s) => s.tasks);
  const completedTasks = tasks.filter((task) => task.status === 'complete');

  return (
    <div className="preview-page">
      <div className="preview-header">
        <h1>翻译预览</h1>
        <p className="preview-subtitle">查看已经完成的翻译文档</p>
      </div>

      {completedTasks.length === 0 ? (
        <div className="preview-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)', marginBottom: 16 }}>
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p>暂无已完成的翻译文档</p>
          <p className="preview-empty-hint">在工作台上传文档并完成翻译后，结果会显示在这里。</p>
        </div>
      ) : (
        <div className="preview-list">
          {completedTasks.map((task) => (
            <div key={task.id} className="preview-card">
              <div className="preview-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="m9 15 2 2 4-4" />
                </svg>
              </div>
              <div className="preview-card-info">
                <div className="preview-card-name">{task.fileName}</div>
                <div className="preview-card-meta">
                  翻译完成 · {task.completedAt ? new Date(task.completedAt).toLocaleString() : ''}
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => task.outputPath && window.electronAPI?.file.open(task.outputPath)}
              >
                打开文件
              </button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .preview-page {
          padding: 32px;
          max-width: 800px;
          margin: 0 auto;
        }
        .preview-header {
          margin-bottom: 24px;
          padding-top: 8px;
        }
        .preview-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .preview-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
        }
        .preview-empty {
          text-align: center;
          padding: 80px 20px;
          color: var(--text-secondary);
          font-size: 15px;
        }
        .preview-empty-hint {
          font-size: 13px;
          color: var(--text-tertiary);
          margin-top: 8px;
        }
        .preview-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .preview-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          transition: all var(--duration-fast) var(--ease-out);
        }
        .preview-card:hover {
          border-color: var(--border-hover);
        }
        .preview-card-icon {
          width: 40px;
          height: 40px;
          background: var(--accent-ghost);
          color: var(--accent);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .preview-card-info {
          flex: 1;
          min-width: 0;
        }
        .preview-card-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .preview-card-meta {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
