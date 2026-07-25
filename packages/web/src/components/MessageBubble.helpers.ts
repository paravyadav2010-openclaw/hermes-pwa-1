import { createElement, useState, type AnchorHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import type { Approval, Message, RpcClient } from '@hermes-pwa/core';

export interface MessageBubbleProps {
  message: Message;
  rpc: RpcClient;
  isLast?: boolean;
  streaming?: boolean;
  liveStatus?: string;
  liveFace?: string | undefined;
  pendingApprovals?: Approval[] | undefined;
  activeSessionIds?: string[] | undefined;
}

export function areMessageBubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  return (
    prev.message === next.message &&
    prev.rpc === next.rpc &&
    prev.isLast === next.isLast &&
    prev.streaming === next.streaming &&
    prev.liveStatus === next.liveStatus &&
    prev.liveFace === next.liveFace &&
    prev.pendingApprovals === next.pendingApprovals &&
    prev.activeSessionIds === next.activeSessionIds
  );
}

function CodeBlock({ language, children }: { language?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = typeof children === 'string' ? children : '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return createElement('div', { className: 'hm-code-block' },
    createElement('div', { className: 'hm-code-block__header' },
      createElement('span', { className: 'hm-code-block__lang' }, language || 'code'),
      createElement('button', {
        type: 'button',
        className: 'hm-code-block__copy',
        onClick: handleCopy,
        'aria-label': copied ? 'Copied' : 'Copy code',
      }, copied ? 'Copied' : 'Copy'),
    ),
    createElement('pre', { className: 'hm-code-block__pre' },
      createElement('code', null, children),
    ),
  );
}

export const MARKDOWN_COMPONENTS = {
  a: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement(
      'a',
      { ...props, href, target: '_blank', rel: 'noopener noreferrer' },
      children,
    ),
  code: ({ className, children, ...props }: HTMLAttributes<HTMLElement>) => {
    if (!className) {
      return createElement('code', { ...props, className: 'hm-inline-code' }, children);
    }
    return createElement('code', { ...props, className }, children);
  },
  pre: ({ children, ...props }: HTMLAttributes<HTMLPreElement>) => {
    const codeEl = children as ReactNode & { props?: { className?: string; children?: ReactNode } };
    const lang = codeEl?.props?.className?.replace('language-', '') ?? '';
    const code = codeEl?.props?.children ?? children;
    return createElement(CodeBlock, { language: lang }, code);
  },
};
