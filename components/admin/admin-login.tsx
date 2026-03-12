// components/admin/admin-login.tsx
import { loginAdminAction } from "@/app/admin/actions";

export function AdminLogin() {
  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
      <div className="mx-auto max-w-md">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Admin login</h1>
          <p className="mt-2 text-sm text-slate-600">
            Wpisz hasło, aby przejść do panelu edycji wyników.
          </p>

          <form action={loginAdminAction} className="mt-6 space-y-4">
            <input
              type="password"
              name="password"
              placeholder="Hasło"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              required
            />

            <button
              type="submit"
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Wejdź do admina
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}