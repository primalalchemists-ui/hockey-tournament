"use client";

import { useMemo, useRef, useState } from "react";
import { buildMessengerSendUrl } from "@/lib/share-preview";

type ShareTableButtonProps = {
  shareText?: string;
};

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51 15.42 17.49" />
      <path d="M15.41 6.51 8.59 10.49" />
    </svg>
  );
}

function isMobileDevice() {
  if (typeof window === "undefined") return false;

  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(
    window.navigator.userAgent
  );
}

export function ShareTableButton({
  shareText = "Sprawdź aktualne wyniki turnieju",
}: ShareTableButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const currentUrl =
    typeof window !== "undefined" ? window.location.href : "";

  const messengerAppId =
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "";

  const messengerSendUrl = useMemo(() => {
    if (!currentUrl || !messengerAppId) return "";

    return buildMessengerSendUrl({
      appId: messengerAppId,
      link: currentUrl,
      redirectUri: currentUrl,
    });
  }, [currentUrl, messengerAppId]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      alert("Nie udało się skopiować linku.");
    }
  }

  async function handleClick() {
    if (typeof window === "undefined") return;

    const canUseNativeShare =
      isMobileDevice() &&
      typeof navigator !== "undefined" &&
      "share" in navigator;

    if (canUseNativeShare) {
      try {
        setIsLoading(true);
        await navigator.share({
          title: document.title,
          text: shareText,
          url: window.location.href,
        });
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }

      return;
    }

    setMenuOpen((prev) => !prev);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ShareIcon />
        <span>{isLoading ? "Przygotowywanie..." : "Udostępnij"}</span>
      </button>

      {menuOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {messengerSendUrl ? (
            <a
              href={messengerSendUrl}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Wyślij w Messengerze
            </a>
          ) : (
            <div className="rounded-xl px-3 py-2 text-sm text-slate-400">
              Wyślij w Messengerze
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            {copied ? "Skopiowano link" : "Kopiuj link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}