/**
 * BLOKADA PRZEWIJANIA STRONY — jedno miejsce dla okien i dla kadru podium.
 *
 * Samo `overflow: hidden` na <body> zabiera pasek przewijania i cała strona
 * przeskakuje w bok o jego szerokość. Rekompensujemy tę szerokość paddingiem,
 * więc tło pod rozmyciem stoi nieruchomo.
 *
 * Zwraca funkcję przywracającą poprzedni stan — nigdy nie zakładamy, że
 * przed blokadą było „nic".
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  const { body } = document;
  const previousOverflow = body.style.overflow;
  const previousPadding = body.style.paddingRight;
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;

  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

  return () => {
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPadding;
  };
}
