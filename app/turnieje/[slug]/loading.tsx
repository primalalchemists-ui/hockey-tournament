import { BrandLoader } from "@/components/brand-loader";

/**
 * Strona archiwalna korzysta z tego samego stanu ładowania co reszta
 * publicznej aplikacji — żadnego osobnego loadera dla historii.
 */
export default function Loading() {
  return <BrandLoader />;
}
