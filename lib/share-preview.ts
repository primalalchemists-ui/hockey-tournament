export type SharePreviewRow = {
  position: string | number;
  label: string;
  secondary?: string;
  logoUrl?: string;
  logoText?: string;

  wins?: string | number;
  losses?: string | number;
  points?: string | number;
  goals?: string | number;

  value?: string | number;
  extra?: string | number;
};

export function normalizeLogoUrlForServer(
  logoUrl: string | undefined,
  baseUrl: string
) {
  if (!logoUrl) return undefined;

  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return logoUrl;
  }

  return `${baseUrl}${logoUrl.startsWith("/") ? logoUrl : `/${logoUrl}`}`;
}

export function normalizeLogoUrlForClient(logoUrl?: string) {
  if (!logoUrl) return undefined;

  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return logoUrl;
  }

  if (typeof window === "undefined") return logoUrl;

  return `${window.location.origin}${logoUrl.startsWith("/") ? logoUrl : `/${logoUrl}`}`;
}

export function getClientShareUrl() {
  if (typeof window === "undefined") return "";
  return window.location.href;
}

export function buildMessengerSendUrl(args: {
  appId: string;
  link: string;
  redirectUri: string;
}) {
  const params = new URLSearchParams({
    app_id: args.appId,
    link: args.link,
    redirect_uri: args.redirectUri,
    display: "popup",
  });

  return `https://www.facebook.com/dialog/send?${params.toString()}`;
}