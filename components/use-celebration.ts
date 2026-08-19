"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildPodiumStorageKey,
  hasSeenReveal,
} from "@/lib/public/podium-reveal";
import { describeCelebrationCta, type CelebrationCta } from "@/lib/public/celebration";

/** Zdarzenie emitowane przez podium po zakończeniu ceremonii. */
export const CELEBRATION_SEEN_EVENT = "celebration-seen";

type Options = {
  tournamentId: string | null;
  scopeKey: string | null;
  completionToken: string | null;
  isCompleted: boolean;
  classificationComplete: boolean;
};

/**
 * Stan przycisku celebracji.
 *
 * „Obejrzane" trzyma ta sama pamięć co ceremonia podium, więc obie
 * warstwy zawsze mówią to samo. Podium ogłasza koniec ceremonii
 * zdarzeniem, dzięki czemu przycisk gaśnie bez przeładowania strony.
 */
export function useCelebration(options: Options): CelebrationCta {
  const { tournamentId, scopeKey, completionToken } = options;

  const [seen, setSeen] = useState(false);

  const canCelebrate = Boolean(tournamentId && scopeKey && completionToken);

  useEffect(() => {
    if (!tournamentId || !scopeKey || !completionToken) return;

    const key = buildPodiumStorageKey({
      tournamentId,
      scopeKey,
      completionToken,
    });

    function sync() {
      setSeen(hasSeenReveal(key));
    }

    sync();

    window.addEventListener(CELEBRATION_SEEN_EVENT, sync);
    return () => window.removeEventListener(CELEBRATION_SEEN_EVENT, sync);
  }, [tournamentId, scopeKey, completionToken]);

  /*
    Stabilna tożsamość obiektu: nowy CTA powstaje TYLKO wtedy, gdy zmieni
    się któraś z jego przesłanek. Dzięki temu konsumenci mogą go trzymać
    w zależnościach memo bez psucia optymalizacji.
  */
  return useMemo(
    () =>
      describeCelebrationCta({
        isCompleted: options.isCompleted,
        classificationComplete: options.classificationComplete,
        // Bez tokenu finalizacji nie ma czego pamiętać ani czego świętować.
        seen: canCelebrate ? seen : false,
        scopeKey,
      }),
    [
      options.isCompleted,
      options.classificationComplete,
      canCelebrate,
      seen,
      scopeKey,
    ]
  );
}
