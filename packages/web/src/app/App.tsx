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
    const scheduleWake = () => {
      // focus + visibilitychange + pageshow often fire together on iOS resume.
      if (wakeTimer) clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => {
        wakeTimer = null;
        connection.wakeFromBackground();
      }, 350);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleWake();
    };
    const onOnline = () => connection.setOnline();
    const onOffline = () => connection.setOffline();

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pageshow', scheduleWake);
    window.addEventListener('focus', scheduleWake);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (wakeTimer) clearTimeout(wakeTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pageshow', scheduleWake);
      window.removeEventListener('focus', scheduleWake);
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
      <div className="hm-app-shell">
        <div className="hm-terminal-boot">
          <h1 className="hm-terminal-title">Hermes Mobile</h1>
          <p className="hm-terminal-sub">Connecting<span className="hm-terminal-dots">...</span></p>
        </div>
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
      <div className="hm-app-shell">
        <div className="hm-terminal-boot">
          <h1 className="hm-terminal-title">Hermes Mobile</h1>
          <p className="hm-terminal-sub hm-terminal-sub--err">{connection.error ?? fallback}</p>
          {canRetry ? (
            <button
              className="hm-primary"
              onClick={() => {
                connection.bindTransport(rest, ws, rpc);
                void connection.init();
              }}
            >
              Retry
            </button>
          ) : null}
        </div>
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
