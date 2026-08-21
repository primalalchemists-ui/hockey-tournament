"use client";

import { useActionState } from "react";

import { loginAdminAction, type AdminLoginState } from "@/app/admin/actions";

const initialState: AdminLoginState = {
  error: null,
};

/**
 * WEJŚCIE DO PANELU.
 *
 * Ekran wyglądał jak formularz doklejony z innego projektu: karta przyklejona
 * do górnej krawędzi, płaskie szare tło, własny styl przycisku i dwa zdania
 * tłumaczące, po co jest pole na hasło. Teraz korzysta z tego samego języka
 * co reszta aplikacji — tła lodowego, `ice-surface`, `.btn btn-primary` —
 * i mieści się w jednym spojrzeniu.
 *
 * DWA MIEJSCA, KTÓRE MUSZĄ STAĆ NIERUCHOMO:
 *
 * 1. KOMUNIKAT O BŁĘDZIE ma własny, stały wiersz. Bez tego karta rosła przy
 *    pierwszej pomyłce i przycisk uciekał spod kursora.
 * 2. PRZYCISK ma minimalną szerokość, więc „Zaloguj się" i stan oczekiwania
 *    zajmują tyle samo miejsca.
 *
 * Błąd nie znika sam po chwili: gaśnie dopiero przy kolejnej próbie. Wcześniej
 * kasował go licznik czasu w efekcie, co znaczyło zarówno kaskadę renderów,
 * jak i komunikat gasnący w trakcie czytania.
 */
export function AdminLogin() {
  const [state, formAction, isPending] = useActionState(
    loginAdminAction,
    initialState
  );

  const hasError = Boolean(state.error);

  /*
    Tło jest już na <body> — tafla lodowa wspólna dla całej aplikacji.
    Poprzednia wersja przykrywała je własnym `bg-slate-100` i dlatego ekran
    logowania wyglądał jak osobny produkt.
  */
  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-4 sm:p-6">
      <section className="dialog-card ice-surface w-full max-w-sm rounded-3xl p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/festiwal-logo.png"
            alt=""
            aria-hidden="true"
            className="h-14 w-auto"
          />

          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Panel administratora
          </h1>
        </div>

        <form action={formAction} className="mt-6 space-y-3">
          <label className="block">
            <span className="sr-only">Hasło</span>

            <input
              type="password"
              name="password"
              placeholder="Hasło"
              autoFocus
              required
              aria-invalid={hasError}
              data-testid="admin-password"
              className={[
                "w-full rounded-2xl border px-4 py-3 text-sm outline-none",
                "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
                hasError
                  ? "border-rose-500 ring-2 ring-rose-500/25"
                  : "border-slate-300 focus:border-slate-900",
              ].join(" ")}
            />
          </label>

          {/* Wiersz istnieje zawsze — zmienia się tekst, nie wysokość karty. */}
          <p
            role="status"
            data-testid="admin-login-error"
            className="h-5 text-sm font-semibold text-rose-700"
          >
            {state.error}
          </p>

          <button
            type="submit"
            disabled={isPending}
            data-testid="admin-login-submit"
            className="btn btn-primary w-full justify-center"
          >
            {isPending ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>Sprawdzanie</span>
              </>
            ) : (
              "Zaloguj się"
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
