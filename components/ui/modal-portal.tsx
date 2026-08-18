"use client";

import { createPortal } from "react-dom";

/**
 * Przenosi zawartość na koniec <body>.
 *
 * DLACZEGO TO JEST KONIECZNE:
 * `position: fixed` liczy się względem viewportu tylko wtedy, gdy żaden
 * przodek nie tworzy własnego kontenera pozycjonowania. Robi to każdy
 * `transform`, `filter`, `will-change` i — u nas — `backdrop-filter`
 * z klasy .ice-surface. Bez portalu okno modalne zostawało uwięzione
 * w karcie, z której je otwarto: przycięte do jej rozmiaru, z rozmyciem
 * tła obejmującym samą kartę zamiast całego ekranu.
 *
 * Portal wypina okno z tego drzewa układu, zachowując drzewo Reacta —
 * stan i zdarzenia działają dokładnie tak samo.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  /*
    Okno modalne otwiera się WYŁĄCZNIE po akcji użytkownika, więc podczas
    renderu serwerowego i hydracji jest zamknięte — prosty warunek na
    document nie grozi rozjazdem hydracji, a nie wymaga stanu ani efektu.
  */
  if (typeof document === "undefined") return null;

  return createPortal(children, document.body);
}
