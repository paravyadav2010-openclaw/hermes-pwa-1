import { useState } from 'react';
import type { Clarify, RpcClient } from '@hermes-pwa/core';
import { useActivityStore } from '@hermes-pwa/core';

function ClarifyDockCard({ clarify, rpc }: { clarify: Clarify; rpc: RpcClient }) {
  const respondClarify = useActivityStore((state) => state.respondClarify);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAnswer, setCustomAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const choices = clarify.choices ?? [];

  async function respond(answer: string) {
    if (submitting || !answer.trim()) return;
    setSubmitting(true);
    try {
      await respondClarify(rpc, clarify.id, answer.trim());
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <section className="hm-clarify-dock__card" data-slot="clarify-dock-card" aria-label="Response required">
      <div className="hm-clarify-dock__title">{clarify.title || 'Your decision'}</div>
      {clarify.question ? <p className="hm-clarify-dock__question">{clarify.question}</p> : null}
      {choices.length > 0 ? (
        <div className="hm-clarify-dock__choices">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              className="hm-clarify-dock__choice"
              disabled={submitting}
              onClick={() => void respond(choice)}
            >
              {submitting ? 'Sending…' : choice}
            </button>
          ))}
          <button
            type="button"
            className="hm-clarify-dock__other"
            disabled={submitting}
            onClick={() => setCustomOpen((open) => !open)}
            aria-expanded={customOpen}
          >
            Other…
          </button>
        </div>
      ) : null}
      {(customOpen || choices.length === 0) && (
        <form
          className="hm-clarify-dock__custom"
          onSubmit={(event) => {
            event.preventDefault();
            void respond(customAnswer);
          }}
        >
          <input
            value={customAnswer}
            onChange={(event) => setCustomAnswer(event.target.value)}
            placeholder="Type a response…"
            aria-label="Custom response"
            disabled={submitting}
          />
          <button type="submit" disabled={submitting || !customAnswer.trim()}>
            Send
          </button>
        </form>
      )}
    </section>
  );
}

/** Sticky decision dock above Composer for gateway clarify prompts. */
export function ClarifyDock({ clarifies, rpc }: { clarifies: Clarify[]; rpc: RpcClient }) {
  if (clarifies.length === 0) return null;

  return (
    <div className="hm-chat__clarify-dock" role="region" aria-label="Questions requiring a response">
      {clarifies.map((clarify) => <ClarifyDockCard key={clarify.id} clarify={clarify} rpc={rpc} />)}
    </div>
  );
}
