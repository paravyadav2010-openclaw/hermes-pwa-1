import { useEffect } from 'react';
import {
  useConnectionStore,
  makeHttp,
  makeRestClient,
  makeWsConnection,
  makeRpcClient,
} from '@hermes-pwa/core';
import { Login } from '../screens/Login';
import { AppShell } from './AppShell';
import { AppPreview } from './AppPreview';
import { useNativeViewportLock } from './useNativeViewportLock';
import './App.css';
import '../styles/prototype.css';

const isPreview = import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has('preview');
const FOREGROUND_WAKE_DEBOUNCE_MS = 100;

const http = makeHttp();
const rest = makeRestClient(http);
const ws = makeWsConnection('');
const rpc = makeRpcClient((msg: string) => {
  ws.send(msg);
});

export function App() {
  useNativeViewportLock();
  const connection = useConnectionStore();

  useEffect(() => {
    if (isPreview) return;
    connection.bindTransport(rest, ws, rpc);
    void connection.init();

    let wakeTimer: ReturnType<typeof setTimeout> | null = null;
    let forceForegroundReconnect = false;
    const scheduleWake = (forceReconnect = false) => {
      // focus + visibilitychange + pageshow often fire together on iOS resume.
      forceForegroundReconnect ||= forceReconnect;
      if (wakeTimer) clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => {
        wakeTimer = null;
        const forceReconnectNow = forceForegroundReconnect;
        forceForegroundReconnect = false;
        connection.wakeFromBackground({ forceReconnect: forceReconnectNow });
      }, FOREGROUND_WAKE_DEBOUNCE_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleWake(true);
    };
    const onOnline = () => connection.setOnline();
    const onOffline = () => connection.setOffline();

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const onPageShow = () => scheduleWake(true);
    const onFocus = () => scheduleWake();
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (wakeTimer) clearTimeout(wakeTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isPreview) return <AppPreview />;

  if (connection.state === 'login') {
    return <Login store={connection} error={connection.error} />;
  }

  if (connection.state === 'init' || connection.state === 'ticketing') {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, background: 'var(--hm-color-bg, #0a0a0f)', fontFamily: 'var(--hm-font-sans, system-ui)' }}>
        {/* Logo mark */}
        <div style={{
          width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 20, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          boxShadow: '0 0 40px rgba(99,102,241,0.35), 0 0 80px rgba(139,92,246,0.15)',
          fontSize: 32, fontWeight: 700, color: '#fff',
          animation: 'hm-boot-logo 2s ease-in-out infinite',
          marginBottom: 28,
        }}>
          H
        </div>
        {/* Wordmark */}
        <h1 style={{
          margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#f1f5f9',
          letterSpacing: '0.04em', fontFamily: 'var(--hm-font-sans, system-ui)',
          animation: 'hm-boot-fadein 0.6s ease-out',
        }}>
          Hermes
        </h1>
        <p style={{
          margin: '0 0 32px', fontSize: 13, fontWeight: 500, color: '#6366f1',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          animation: 'hm-boot-fadein 0.6s ease-out 0.15s both',
        }}>
          Mobile
        </p>
        {/* Loading dots */}
        <div style={{ display: 'flex', gap: 6, animation: 'hm-boot-fadein 0.6s ease-out 0.3s both' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%', background: '#6366f1',
              animation: `hm-boot-dot 1.2s ease-in-out ${i * 0.15}s infinite`,
            }} />
          ))}
        </div>
        <p style={{
          margin: '20px 0 0', fontSize: 12, color: '#475569',
          fontFamily: 'monospace', animation: 'hm-boot-fadein 0.6s ease-out 0.45s both',
        }}>
          Connecting to gateway…
        </p>
        <style>{`
          @keyframes hm-boot-logo {
            0%, 100% { transform: scale(1); box-shadow: 0 0 40px rgba(99,102,241,0.35), 0 0 80px rgba(139,92,246,0.15); }
            50% { transform: scale(1.04); box-shadow: 0 0 56px rgba(99,102,241,0.5), 0 0 100px rgba(139,92,246,0.25); }
          }
          @keyframes hm-boot-dot {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
          @keyframes hm-boot-fadein {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  if (connection.state === 'offline' || connection.state === 'unsupported' || connection.state === 'incompatible-transport') {
    const canRetry = connection.state === 'offline';
    const fallback = connection.state === 'unsupported'
      ? 'Unsupported Hermes server'
      : connection.state === 'incompatible-transport'
        ? 'WebSocket transport unsupported'
        : 'Offline';
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, background: 'var(--hm-color-bg, #0a0a0f)', fontFamily: 'var(--hm-font-sans, system-ui)' }}>
        <div style={{
          width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 20, background: '#dc4b46',
          boxShadow: '0 0 40px rgba(220,75,70,0.3)',
          fontSize: 32, fontWeight: 700, color: '#fff',
          marginBottom: 28,
        }}>
          H
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.04em' }}>Hermes</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, fontWeight: 500, color: '#dc4b46', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Mobile</p>
        <p style={{ margin: '0 0 0', fontSize: 14, color: '#dc4b46', fontFamily: 'monospace', textAlign: 'center', maxWidth: '280px', lineHeight: 1.5 }}>{connection.error ?? fallback}</p>
        {canRetry ? (
          <button
            style={{
              marginTop: 24, padding: '10px 28px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(99,102,241,0.3)',
            }}
            onClick={() => {
              connection.bindTransport(rest, ws, rpc);
              void connection.init();
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <AppShell
      connectionState={connection.state}
      rpc={rpc}
      rest={rest}
      onRetry={() => {
        connection.bindTransport(rest, ws, rpc);
        void connection.init();
      }}
    />
  );
}
