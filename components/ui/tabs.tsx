// components/ui/tabs.tsx
"use client";

import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("inline-flex gap-2 rounded-2xl border border-slate-200 bg-white p-2", className)}
      {...props}
    />
  );
}

type TabsTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function TabsTrigger({ className, active, ...props }: TabsTriggerProps) {
  return (
    <button
      className={cn(
        "rounded-xl px-4 py-2 text-sm font-medium transition",
        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
        className
      )}
      {...props}
    />
  );
}