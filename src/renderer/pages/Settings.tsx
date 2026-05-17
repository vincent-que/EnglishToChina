import { useState, useEffect, useCallback } from 'react';
import { useTranslationStore } from '../stores/translation-store';
import { ENGINE_REGISTRY, STYLE_LABELS } from '../../shared/constants';
import type { AppSettings, TermTable } from '../../shared/types';

type ConnectionState = {
  status: 'idle' | 'testing' | 'success' | 'error';
  message: string;
};

type DiagnosticsState = {
  status: 'idle' | 'checking' | 'success' | 'error';
  data?: Record<string, unknown>;
  message?: string;
};

export function Settings() {
  const settings = useTranslationStore((s) => s.settings);
  const setSettings = useTranslationStore((s) => s.setSettings);
  const [localSettings, setLocal] = useState<AppSettings>({ ...settings });
  const [termTables, setTermTables] = useState<TermTable[]>([]);
  const [saved, setSaved] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>({ status: 'idle', message: '' });
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({ status: 'idle' });
  const [memoryStats, setMemoryStats] = useState<Record<string, unknown> | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setLocal({ ...settings });
  }, [settings]);

  useEffect(() => {
    window.electronAPI?.settings.get()
      .then((savedSettings) => {
        setSettings(savedSettings as Partial<AppSettings>);
      })
      .catch(console.error);
    window.electronAPI?.term.getList()
      .then((tables) => setTermTables(tables as unknown as TermTable[]))
      .catch(console.error);
    window.electronAPI?.memory.getStats()
      .then((stats) => setMemoryStats(stats))
      .catch(console.error);
  }, [setSettings]);

  const handleSave = useCallback(() => {
    setSettings(localSettings);
    window.electronAPI?.settings.save(localSettings as unknown as Record<string, unknown>);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [localSettings, setSettings]);

  const updateLocal = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    if (key === 'apiKey' || key === 'engine') {
      setConnection({ status: 'idle', message: '' });
    }
  };

  const handleTestConnection = async () => {
    if (!window.electronAPI) return;
    setConnection({ status: 'testing', message: '正在测试连接...' });
    const result = await window.electronAPI.settings.testConnection({
      engine: localSettings.engine,
      apiKey: localSettings.apiKey,
    });
    setConnection({
      status: result.success ? 'success' : 'error',
      message: result.message,
    });
  };

  const handleDiagnostics = async () => {
    if (!window.electronAPI) return;
    setDiagnostics({ status: 'checking', message: '正在检查运行环境...' });
    const result = await window.electronAPI.app.getDiagnostics();
    setDiagnostics({
      status: result.ok ? 'success' : 'error',
      data: result,
      message: result.ok ? '运行环境正常' : String(result.error || '运行环境异常'),
    });
  };

  const handleClearMemory = async () => {
    if (!window.electronAPI) return;
    const stats = await window.electronAPI.memory.clear();
    setMemoryStats(stats);
  };

  const toggleTermTable = (id: string) => {
    setLocal((prev) => {
      const current = prev.termTableIds || [];
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      return { ...prev, termTableIds: next };
    });
  };

  const handleImportTerms = async (file: File | null) => {
    if (!file || !window.electronAPI) return;
    const filePath = window.electronAPI.file.getPathForFile(file);
    const table = await window.electronAPI.term.import(filePath) as unknown as TermTable;
    setTermTables((prev) => [table, ...prev.filter((item) => item.id !== table.id)]);
    setLocal((prev) => ({
      ...prev,
      termTableIds: [...new Set([...(prev.termTableIds || []), table.id])],
    }));
  };

  const diagnosticSummary = diagnostics.data
    ? JSON.stringify(diagnostics.data, null, 2)
    : '';

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>翻译设置</h1>
        <p className="settings-subtitle">配置翻译引擎、翻译风格、术语表和输出格式</p>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">翻译引擎</h2>
        <div className="engine-grid">
          {Object.entries(ENGINE_REGISTRY).map(([key, engine]) => (
            <div
              key={key}
              className={`engine-card ${localSettings.engine === key ? 'engine-active' : ''}`}
              onClick={() => updateLocal('engine', key)}
            >
              <div className="engine-name">
                {engine.name}
                {engine.recommend && <span className="badge badge-primary badge-sm">推荐</span>}
              </div>
              <div className="engine-desc">{engine.description}</div>
              <div className="engine-price">
                ¥{engine.inputPrice}/百万输入 · ¥{engine.outputPrice}/百万输出
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">API Key</h2>
        <div className="settings-field">
          <label className="settings-label">API Key</label>
          <div className="api-key-row">
            <input
              type={showApiKey ? 'text' : 'password'}
              className="input"
              placeholder="请输入 API Key"
              value={localSettings.apiKey}
              onChange={(e) => updateLocal('apiKey', e.target.value)}
            />
            <button className="btn btn-secondary" onClick={() => setShowApiKey((value) => !value)}>
              {showApiKey ? '隐藏' : '显示'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleTestConnection}
              disabled={connection.status === 'testing'}
            >
              {connection.status === 'testing' ? '测试中...' : '测试连接'}
            </button>
          </div>
          {connection.message && (
            <p className={`settings-hint connection-${connection.status}`}>
              {connection.message}
            </p>
          )}
          <p className="settings-hint">支持系统安全存储时，API Key 会加密保存在本机。</p>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">翻译风格</h2>
        <div className="style-options">
          {Object.entries(STYLE_LABELS).map(([key, label]) => (
            <label
              key={key}
              className={`style-option ${localSettings.style === key ? 'style-active' : ''}`}
            >
              <input
                type="radio"
                name="style"
                value={key}
                checked={localSettings.style === key}
                onChange={() => updateLocal('style', key as AppSettings['style'])}
              />
              <span className="style-label">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">输出格式</h2>
        <div className="style-options">
          <label className={`style-option ${localSettings.outputFormat === 'docx' ? 'style-active' : ''}`}>
            <input
              type="radio"
              name="outputFormat"
              value="docx"
              checked={localSettings.outputFormat === 'docx'}
              onChange={() => updateLocal('outputFormat', 'docx')}
            />
            <span className="style-label">Word (.docx)</span>
          </label>
          <label className={`style-option ${localSettings.outputFormat === 'pdf' ? 'style-active' : ''}`}>
            <input
              type="radio"
              name="outputFormat"
              value="pdf"
              checked={localSettings.outputFormat === 'pdf'}
              onChange={() => updateLocal('outputFormat', 'pdf')}
            />
            <span className="style-label">PDF (.pdf)</span>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-row">
          <h2 className="settings-section-title no-border">永久记忆</h2>
          <button className="btn btn-ghost btn-sm" onClick={handleClearMemory}>
            清空记忆
          </button>
        </div>
        <label className={`style-option memory-toggle ${localSettings.memoryEnabled ? 'style-active' : ''}`}>
          <input
            type="checkbox"
            checked={localSettings.memoryEnabled}
            onChange={(e) => updateLocal('memoryEnabled', e.target.checked)}
          />
          <span className="style-label">启用翻译记忆，复用短文本缓存并按需注入术语</span>
        </label>
        <p className="settings-hint">
          当前缓存：{String(memoryStats?.cacheRecords ?? 0)} 条。记忆仅保存在本机，不保存长篇原文。
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-section-row">
          <h2 className="settings-section-title no-border">术语表</h2>
          <label className="btn btn-secondary btn-sm">
            导入
            <input
              type="file"
              accept=".csv,.tsv,.txt,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleImportTerms(e.target.files?.[0] || null).catch(console.error);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {termTables.length === 0 ? (
          <p className="settings-hint">支持 CSV、TSV、TXT、JSON。每行格式为英文,中文。</p>
        ) : (
          <div className="term-list">
            {termTables.map((table) => {
              const checked = (localSettings.termTableIds || []).includes(table.id);
              return (
                <label key={table.id} className={`term-item ${checked ? 'term-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTermTable(table.id)}
                  />
                  <span className="term-name">{table.name}</span>
                  <span className="term-count">{table.entries.length} 条</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-row">
          <h2 className="settings-section-title no-border">运行环境</h2>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleDiagnostics}
            disabled={diagnostics.status === 'checking'}
          >
            {diagnostics.status === 'checking' ? '检查中...' : '环境自检'}
          </button>
        </div>
        {diagnostics.message && (
          <p className={`settings-hint connection-${diagnostics.status === 'success' ? 'success' : 'error'}`}>
            {diagnostics.message}
          </p>
        )}
        {diagnosticSummary && <pre className="diagnostics-box">{diagnosticSummary}</pre>}
      </div>

      <div className="settings-footer">
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? '已保存' : '保存设置'}
        </button>
      </div>

      <style>{`
        .settings-page {
          padding: 32px;
          max-width: 800px;
          margin: 0 auto;
        }
        .settings-header {
          margin-bottom: 32px;
          padding-top: 8px;
        }
        .settings-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .settings-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
        }
        .settings-section {
          margin-bottom: 32px;
        }
        .settings-section-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .settings-section-title.no-border {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }
        .settings-section-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .engine-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 12px;
        }
        .engine-card {
          padding: 16px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .engine-card:hover {
          border-color: var(--border-hover);
        }
        .engine-card.engine-active {
          border-color: var(--primary);
          background: var(--primary-ghost);
        }
        .engine-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .engine-desc {
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .engine-price {
          font-size: 11px;
          font-family: var(--font-mono);
          color: var(--text-tertiary);
        }
        .badge-sm {
          font-size: 10px;
          padding: 1px 6px;
          line-height: 16px;
        }
        .settings-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 6px;
        }
        .api-key-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .api-key-row .input {
          flex: 1;
        }
        .settings-hint {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 6px;
        }
        .connection-success {
          color: var(--accent);
        }
        .connection-error {
          color: var(--error);
        }
        .style-options {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .style-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          font-size: 13px;
          color: var(--text-primary);
        }
        .style-option:hover {
          border-color: var(--border-hover);
        }
        .style-option.style-active {
          border-color: var(--primary);
          background: var(--primary-ghost);
        }
        .style-option input[type="radio"] {
          display: none;
        }
        .term-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .term-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          cursor: pointer;
        }
        .term-item.term-active {
          border-color: var(--primary);
          background: var(--primary-ghost);
        }
        .term-name {
          flex: 1;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }
        .term-count {
          font-size: 12px;
          color: var(--text-tertiary);
        }
        .diagnostics-box {
          max-height: 220px;
          overflow: auto;
          padding: 12px;
          margin-top: 8px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 11px;
          color: var(--text-secondary);
          white-space: pre-wrap;
        }
        .settings-footer {
          padding-top: 16px;
          border-top: 1px solid var(--border);
        }
      `}</style>
    </div>
  );
}
