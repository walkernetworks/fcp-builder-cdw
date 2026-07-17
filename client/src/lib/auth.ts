import { encodeOAuthState, sanitizeOAuthReturnPath } from "@shared/const";

export const MANUS_SIGN_IN_LABEL = "Sign in with Manus";

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
