import { useEffect, useState } from 'react';
import type { LicenseInfo } from '../../shared/types';

export function Activation() {
  const [code, setCode] = useState('');
  const [license, setLicense] = useState<LicenseInfo>({
    status: 'trial',
    plan: 'trial',
    features: ['basic'],
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.electronAPI?.license.validate()
      .then((info) => setLicense(info as unknown as LicenseInfo))
      .catch(console.error);
  }, []);

  const handleActivate = async () => {
    if (!code.trim()) return;
    setStatus('loading');
    try {
      if (!window.electronAPI) {
        setStatus('error');
        setMessage('浏览器预览模式不支持激活，请在桌面应用中使用');
        return;
      }
      const result = await window.electronAPI.license.activate(code);
      const nextLicense = (result as unknown as { license?: LicenseInfo }).license;
      if (nextLicense) setLicense(nextLicense);
      setStatus(result.success ? 'success' : 'error');
      setMessage(result.message);
    } catch {
      setStatus('error');
      setMessage('激活失败，请检查网络连接或稍后重试');
    }
  };

  const statusLabel = {
    active: '专业版',
    expired: '已过期',
    trial: '试用版',
    invalid: '无效授权',
  }[license.status];

  const expiresAtLabel = license.expiresAt
    ? new Date(license.expiresAt).toLocaleDateString('zh-CN')
    : '未激活';

  return (
    <div className="activation-page">
      <div className="activation-header">
        <h1>账户信息</h1>
        <p className="activation-subtitle">输入当月授权码后即可使用服务端翻译</p>
      </div>

      <div className="activation-card">
        <div className="activation-status">
          <div className={`activation-status-icon ${license.status}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className="activation-status-label">{statusLabel}</div>
            <div className="activation-status-desc">
              当前方案：{license.plan || 'trial'} · 到期时间：{expiresAtLabel}
            </div>
            {license.status === 'active' && (
              <div className="activation-status-desc">
                剩余 {license.daysRemaining ?? 0} 天 · 可用功能：{license.features.join(', ')}
              </div>
            )}
          </div>
        </div>

        <div className="activation-field">
          <label className="activation-label">授权码</label>
          <input
            type="text"
            className="input activation-input"
            placeholder="例如 ETC-202605-ABCD-1234-A1B2C3"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <button
          className="btn btn-primary activation-btn"
          onClick={handleActivate}
          disabled={!code.trim() || status === 'loading'}
        >
          {status === 'loading' ? '验证中...' : '激活授权'}
        </button>

        {message && (
          <div className={`activation-msg ${status === 'success' ? 'success' : 'error'}`}>
            <span>{message}</span>
          </div>
        )}
      </div>

      <div className="activation-card">
        <h3 className="activation-card-title">授权说明</h3>
        <p className="activation-card-desc">
          当前版本使用月度授权码。授权码每月月初更新，到期后输入新码即可继续使用。
          授权流程不采集硬件标识，也不做本机绑定。
        </p>
        <div className="activation-features">
          <div className="activation-feature"><span className="feature-check">✓</span><span>月度授权码本地校验有效期</span></div>
          <div className="activation-feature"><span className="feature-check">✓</span><span>翻译请求会携带授权码进行服务端二次校验</span></div>
          <div className="activation-feature"><span className="feature-check">✓</span><span>无需客户配置 Kimi 或其它模型 Key</span></div>
        </div>
      </div>

      <style>{`
        .activation-page {
          padding: 32px;
          max-width: 600px;
          margin: 0 auto;
        }
        .activation-header {
          margin-bottom: 24px;
          padding-top: 8px;
        }
        .activation-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .activation-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
        }
        .activation-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 24px;
          margin-bottom: 16px;
        }
        .activation-status {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }
        .activation-status-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .activation-status-icon.active {
          background: var(--accent-ghost);
          color: var(--accent);
        }
        .activation-status-icon.trial,
        .activation-status-icon.expired,
        .activation-status-icon.invalid {
          background: var(--warning-ghost);
          color: var(--warning);
        }
        .activation-status-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .activation-status-desc {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 2px;
        }
        .activation-field {
          margin-bottom: 16px;
        }
        .activation-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 6px;
        }
        .activation-input {
          font-family: var(--font-mono);
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .activation-btn {
          width: 100%;
        }
        .activation-msg {
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: var(--radius-md);
          font-size: 13px;
        }
        .activation-msg.success {
          background: var(--accent-ghost);
          color: var(--accent-hover);
        }
        .activation-msg.error {
          background: var(--error-ghost);
          color: var(--error);
        }
        .activation-card-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .activation-card-desc {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 16px;
          line-height: 1.7;
        }
        .activation-features {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .activation-feature {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-primary);
        }
        .feature-check {
          width: 20px;
          height: 20px;
          background: var(--accent-ghost);
          color: var(--accent);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
