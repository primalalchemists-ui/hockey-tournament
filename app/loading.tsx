import { BrandLoader } from "@/components/brand-loader";

/**
 * GRANICA ŁADOWANIA TRASY PUBLICZNEJ.
 *
 * Wcześniej stał tu skeleton: szare paski, biały prostokąt i trzy skaczące
 * kropki z napisem o wczytywaniu turnieju. Był to JEDYNY ekran w aplikacji
 * mówiący innym językiem niż reszta — i pokazywał się dokładnie tam, gdzie
 * rzucał się w oczy najbardziej: przy powrocie ze strony archiwalnej
 * na stronę główną oraz przy chłodnym starcie na Vercelu.
 *
 * Teraz publiczne ładowanie ma jeden wizual: logo Festiwalu Hokeja.
 */
export default function Loading() {
  return <BrandLoader />;
}
