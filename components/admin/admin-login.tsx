"use client";

import { useActionState, useEffect, useState } from "react";
import {
  loginAdminAction,
  type AdminLoginState,
} from "@/app/admin/actions";

const initialState: AdminLoginState = {
  error: null,
};

export function AdminLogin() {
  const [state, formAction, isPending] = useActionState(
    loginAdminAction,
    initialState
  );
  const [visibleError, setVisibleError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.error) {
      setVisibleError(null);
      return;
    }

    setVisibleError(state.error);

    const timeout = window.setTimeout(() => {
      setVisibleError(null);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [state.error]);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
      <div className="mx-auto max-w-md">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Admin login</h1>
          <p className="mt-2 text-sm text-slate-600">
            Wpisz hasło, aby przejść do panelu edycji wyników.
          </p>

          <form action={formAction} className="mt-6 space-y-4">
            <input
              type="password"
              name="password"
              placeholder="Hasło"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              required
            />

            <div className="h-5 text-sm font-medium">
              {visibleError ? (
                <span className="text-rose-700">{visibleError}</span>
              ) : (
                <span className="invisible">placeholder</span>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "Sprawdzanie..." : "Wejdź do admina"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}