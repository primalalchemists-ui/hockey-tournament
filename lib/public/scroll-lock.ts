/**
 * BLOKADA PRZEWIJANIA STRONY — jedno miejsce dla okien, kadru podium
 * i przełącznika kategorii.
 *
 * Trzy rzeczy muszą się zgadzać naraz:
 *
 * 1. TŁO NIE PRZESKAKUJE W BOK.
 *    Zabranie paska przewijania zwęża widoczny obszar, więc strona pod
 *    rozmyciem przeskakiwałaby o jego szerokość. Rekompensujemy paddingiem.
 *
 * 2. iOS NAPRAWDĘ SIĘ ZATRZYMUJE.
 *    Samo `overflow: hidden` na <body> Safari na telefonie ignoruje —
 *    strona pod oknem dalej się przewija palcem, a po zamknięciu kibic ląduje
 *    w zupełnie innym miejscu. Jedyne, co działa, to wyjęcie <body> z układu
 *    (`position: fixed`) i przesunięcie go o aktualny scroll, żeby wizualnie
 *    nic nie drgnęło. Przy zdejmowaniu blokady wracamy dokładnie tam.
 *
 * 3. OKNO W OKNIE NIE ODBLOKOWUJE TŁA.
 *    Picker mediów otwiera się nad panelem, kadr podium nad stroną. Gdyby
 *    każde zamknięcie po prostu przywracało styl, zamknięcie WIERZCHNIEGO
 *    okna odblokowałoby przewijanie, choć spodnie wciąż jest otwarte.
 *    Dlatego blokady się liczą, a zdejmuje ją dopiero ostatnia.
 */

type LockState = {
  scrollY: number;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
  paddingRight: string;
};

let activeLocks = 0;
let saved: LockState | null = null;

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  activeLocks += 1;

  if (activeLocks === 1) {
    const { body } = document;
    const scrollY = window.scrollY;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    saved = {
      scrollY,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }

  /*
    Każdy właściciel blokady dostaje własny, jednorazowy klucz. React w trybie
    ścisłym potrafi wywołać sprzątanie dwa razy — drugie wywołanie nie może
    zabrać blokady komuś innemu.
  */
  let released = false;

  return () => {
    if (released) return;
    released = true;

    activeLocks -= 1;
    if (activeLocks > 0 || !saved) return;

    const { body } = document;
    const state = saved;
    saved = null;

    body.style.position = state.position;
    body.style.top = state.top;
    body.style.left = state.left;
    body.style.right = state.right;
    body.style.width = state.width;
    body.style.overflow = state.overflow;
    body.style.paddingRight = state.paddingRight;

    // Powrót DOKŁADNIE tam, gdzie kibic był przed otwarciem okna.
    window.scrollTo(0, state.scrollY);
  };
}
