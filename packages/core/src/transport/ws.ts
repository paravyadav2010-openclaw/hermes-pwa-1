/**
 * WebSocket lifecycle — plain wrapper, no reconnect logic.
 * Reconnect lives in the connection store (single source of truth).
 */

export type WsMessageHandler = (line: string) => void;
export type WsOpenHandler = () => void;
export type WsCloseHandler = (event: CloseEvent) => void;

export interface WsConnection {
  connect(ticket: string, onOpen: WsOpenHandler, onMessage: WsMessageHandler, onClose: WsCloseHandler): void;
  send(data: string): void;
  close(): void;
}

const WS_TICKET_PROTOCOL = 'hermes.ws-ticket';

export function makeWsConnection(baseWsUrl: string): WsConnection {
  let ws: WebSocket | null = null;
  let onCloseRef: WsCloseHandler | null = null;

  function connect(ticket: string, onOpen: WsOpenHandler, onMessage: WsMessageHandler, onClose: WsCloseHandler): void {
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }

    const url = `${baseWsUrl}/api/ws`;
    const socket = new WebSocket(url, [WS_TICKET_PROTOCOL, ticket]);
    ws = socket;
    onCloseRef = onClose;

    socket.onopen = () => {
      if (ws !== socket) return;
      onOpen();
    };

    socket.onmessage = (event) => {
      if (ws !== socket) return;
      const lines = String(event.data).split('\n').filter(Boolean);
      for (const line of lines) {
        onMessage(line);
      }
    };

    socket.onclose = (event) => {
      if (ws !== socket) return;
      ws = null;
      onCloseRef?.(event);
    };

    socket.onerror = () => {
      // Let onclose handle cleanup
    };
  }

  function send(data: string): void {
    const openState = typeof WebSocket.OPEN === 'number' ? WebSocket.OPEN : 1;
    if (!ws || ws.readyState !== openState) {
      throw new Error('WebSocket is not open');
    }
    ws.send(data);
  }

  function close(): void {
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    onCloseRef = null;
  }

  return { connect, send, close };
}
