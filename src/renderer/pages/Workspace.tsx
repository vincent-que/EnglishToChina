import { useCallback, useState } from 'react';
import { useElectronApi } from '../hooks/use-electron-api';
import { useTranslationStore } from '../stores/translation-store';
import type { TranslationTask } from '../../shared/types';
import { STYLE_LABELS } from '../../shared/constants';

export function Workspace() {
  const {
    selectFiles,
    startTranslation,
    openFile,
    openOutputDir,
    deleteHistoryTask,
    clearHistory,
    isElectron,
  } = useElectronApi();
  const tasks = useTranslationStore((s) => s.tasks);
  const settings = useTranslationStore((s) => s.settings);
  const addTask = useTranslationStore((s) => s.addTask);
  const updateTask = useTranslationStore((s) => s.updateTask);
  const removeTask = useTranslationStore((s) => s.removeTask);
  const [dragOver, setDragOver] = useState(false);

  const enqueueFile = useCallback(async (filePath: string, fileName?: string) => {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const displayName = fileName || filePath.split(/[/\\]/).pop() || filePath;
    addTask({
      id: taskId,
      filePath,
      fileName: displayName,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
    });

    try {
      await startTranslation(filePath, settings.style, settings.outputFormat, settings.termTableIds, taskId);
    } catch (err) {
      updateTask(taskId, {
        status: 'error',
        error: {
          code: 'START_FAILED',
          message: err instanceof Error ? err.message : '翻译任务启动失败',
          recoverable: true,
        },
      });
    }
  }, [startTranslation, settings, addTask, updateTask]);

  const handleSelectFiles = useCallback(async () => {
    const result = await selectFiles();
    if (!result || result.canceled) return;
    for (const filePath of result.filePaths) {
      enqueueFile(filePath).catch(console.error);
    }
  }, [selectFiles, enqueueFile]);

  const handleRetry = useCallback((task: TranslationTask) => {
    enqueueFile(task.filePath, task.fileName).catch(console.error);
  }, [enqueueFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      let filePath = (file as File & { path?: string }).path;
      if (!filePath && window.electronAPI?.file?.getPathForFile) {
        try {
          filePath = window.electronAPI.file.getPathForFile(file);
        } catch {}
      }
      if (!filePath) filePath = file.name;
      if (/\.(pdf|docx?|PDF|DOCX?)$/.test(file.name)) {
        enqueueFile(filePath, file.name).catch(console.error);
      }
    }
  }, [enqueueFile]);

  const getStatusBadge = (task: TranslationTask) => {
    switch (task.status) {
      case 'parsing':
        return <span className="badge badge-warning badge-dot">解析中</span>;
      case 'translating':
        return <span className="badge badge-warning badge-dot">翻译中</span>;
      case 'rebuilding':
        return <span className="badge badge-warning badge-dot">生成中</span>;
      case 'complete':
        return <span className="badge badge-success badge-dot">已完成</span>;
      case 'error':
        return <span className="badge badge-error">错误</span>;
      default:
        return <span className="badge badge-default">排队中</span>;
    }
  };

  const getFileIcon = (fileName: string) => fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';

  return (
    <div className="workspace">
      <div className="workspace-header">
        <h1>工作台</h1>
        <p className="workspace-subtitle">
          {isElectron ? '上传英文 PDF 或 Word 文档，生成中文翻译文件' : '浏览器预览模式，请在桌面应用中使用完整功能'}
        </p>
      </div>

      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={handleSelectFiles}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)', marginBottom: 16 }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
        <div className="upload-title">拖拽文件到此处上传</div>
        <div className="upload-desc">或点击选择文件，支持批量上传</div>
        <div className="upload-formats">
          <span className="upload-format-tag">.PDF</span>
          <span className="upload-format-tag">.DOCX</span>
          <span className="upload-format-tag">.DOC</span>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="task-list">
          <div className="task-list-header">
            <h2>翻译任务</h2>
            <span className="task-count">{tasks.length}</span>
            <button className="btn btn-secondary btn-sm" onClick={openOutputDir}>打开输出目录</button>
            <button className="btn btn-ghost btn-sm" onClick={() => clearHistory().catch(console.error)}>清空历史</button>
          </div>
          {tasks.map((task) => (
            <div key={task.id} className={`task-item ${task.status === 'error' ? 'task-error' : ''}`}>
              <div className={`task-icon task-icon-${getFileIcon(task.fileName)}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="task-info">
                <div className="task-name">{task.fileName}</div>
                <div className="task-meta">
                  <span>{STYLE_LABELS[settings.style] || '商务通用'}</span>
                  {task.status === 'complete' && task.outputPath && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openFile(task.outputPath!)}>
                      打开文件
                    </button>
                  )}
                  {task.status === 'error' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleRetry(task)}>
                      重试
                    </button>
                  )}
                  {task.error && <span className="task-error-msg">{task.error.message}</span>}
                </div>
              </div>
              <div className="task-status">
                {getStatusBadge(task)}
                {(task.status === 'parsing' || task.status === 'translating' || task.status === 'rebuilding') && (
                  <div className="task-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                    </div>
                    <span className="task-progress-text">{task.progress}%</span>
                  </div>
                )}
              </div>
              <button
                className="task-delete"
                title="删除记录"
                onClick={() => {
                  removeTask(task.id);
                  deleteHistoryTask(task.id).catch(console.error);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .workspace { padding: 32px; max-width: 800px; margin: 0 auto; }
        .workspace-header { margin-bottom: 24px; padding-top: 8px; }
        .workspace-header h1 { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
        .workspace-subtitle { font-size: 14px; color: var(--text-secondary); }
        .upload-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
        .upload-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; }
        .upload-formats { display: flex; justify-content: center; gap: 8px; }
        .upload-format-tag { padding: 3px 10px; background: var(--bg-hover); border-radius: var(--radius-full); font-size: 11px; font-weight: 600; color: var(--text-secondary); font-family: var(--font-mono); }
        .task-list { margin-top: 24px; }
        .task-list-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .task-list-header h2 { font-size: 16px; font-weight: 600; color: var(--text-primary); }
        .task-count { padding: 1px 8px; background: var(--primary-ghost); color: var(--primary); border-radius: var(--radius-full); font-size: 12px; font-weight: 600; margin-right: auto; }
        .task-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 8px; transition: all var(--duration-fast) var(--ease-out); }
        .task-item:hover { border-color: var(--border-hover); }
        .task-error { border-color: var(--error); background: var(--error-ghost); }
        .task-icon { width: 36px; height: 36px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .task-icon-pdf { background: var(--error-ghost); color: var(--error); }
        .task-icon-docx { background: var(--primary-ghost); color: var(--primary); }
        .task-info { flex: 1; min-width: 0; }
        .task-name { font-size: 13px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .task-meta { font-size: 12px; color: var(--text-tertiary); display: flex; align-items: center; gap: 8px; margin-top: 2px; flex-wrap: wrap; }
        .task-error-msg { color: var(--error); font-size: 12px; }
        .task-status { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .task-progress { width: 80px; display: flex; align-items: center; gap: 8px; }
        .task-progress-text { font-size: 12px; font-family: var(--font-mono); color: var(--text-secondary); min-width: 32px; text-align: right; }
        .task-delete { background: none; border: none; padding: 4px; cursor: pointer; color: var(--text-tertiary); border-radius: var(--radius-sm); transition: all var(--duration-fast); }
        .task-delete:hover { color: var(--error); background: var(--error-ghost); }
      `}</style>
    </div>
  );
}
