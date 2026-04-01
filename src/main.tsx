import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unknown frontend error'
    };
  }

  componentDidCatch(error: Error) {
    console.error('[UI] Unhandled render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020617',
          color: '#f8fafc',
          padding: '24px',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: '720px',
            width: '100%',
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>DarkScan AI Frontend Error</h1>
            <p style={{ marginBottom: '8px', color: '#cbd5e1' }}>
              The app hit a client-side error instead of rendering normally.
            </p>
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginTop: '16px',
              padding: '16px',
              borderRadius: '12px',
              background: '#020617',
              color: '#fda4af'
            }}>
              {this.state.errorMessage}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
