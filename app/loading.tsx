// app/loading.tsx
"use client";

import { motion } from "framer-motion";

export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        <div className="h-8 w-40 animate-pulse rounded-full bg-slate-200" />
        <div className="h-10 w-64 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-5 w-72 animate-pulse rounded-xl bg-slate-200" />

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <motion.div
              className="h-3 w-3 rounded-full bg-slate-900"
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1 }}
            />
            <motion.div
              className="h-3 w-3 rounded-full bg-slate-700"
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0.15 }}
            />
            <motion.div
              className="h-3 w-3 rounded-full bg-slate-500"
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0.3 }}
            />
            <span className="text-sm font-medium text-slate-600">
              Ładowanie turnieju...
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}