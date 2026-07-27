import { encodeOAuthState, sanitizeOAuthReturnPath } from "@shared/const";

export const MANUS_SIGN_IN_LABEL = "Sign in with Manus";

function normalizeHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function isTemporaryPreviewOrigin(origin: string): boolean {
  try {
    return new URL(origin).hostname.endsWith(".manus.computer");
  } catch {
    return false;
  }
}

export function getOAuthHandoffUrl(input: { currentOrigin: string; configuredAppOrigin?: string; currentPath: string }): string | null {
  const currentOrigin = normalizeHttpsOrigin(input.currentOrigin);
  if (!currentOrigin || !isTemporaryPreviewOrigin(currentOrigin)) return null;
  const configuredAppOrigin = normalizeHttpsOrigin(input.configuredAppOrigin);
  if (!configuredAppOrigin || configuredAppOrigin === currentOrigin) return null;
  return new URL(input.currentPath, configuredAppOrigin).toString();
}

export function buildManusLoginUrl(input: {
  oauthPortalUrl: string;
  appId: string;
  origin: string;
  currentPath: string;
  nonce: string;
}) {
  const redirectUri = `${input.origin}/api/oauth/callback`;
  const returnTo = sanitizeOAuthReturnPath(input.currentPath);
  const state = encodeOAuthState({ redirectUri, nonce: input.nonce, returnTo });
  const url = new URL(`${input.oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", input.appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return { url: url.toString(), redirectUri, returnTo, state };
}
