import { describe, expect, it } from "vitest";
import { buildManusLoginUrl, getOAuthHandoffUrl, MANUS_SIGN_IN_LABEL } from "../client/src/lib/auth";
import { decodeOAuthState, sanitizeOAuthReturnPath } from "../shared/const";

describe("hosted preview Manus sign-in", () => {
  it("exposes the explicit sign-in action used by the protected entry screen", () => {
    expect(MANUS_SIGN_IN_LABEL).toBe("Sign in with Manus");
  });

  it("builds the hosted OAuth request and preserves the intended local return path", () => {
    const request = buildManusLoginUrl({
      oauthPortalUrl: "https://manus.example",
      appId: "fcp-app",
      origin: "https://preview.example",
      currentPath: "/?tab=timelines#two-year",
      nonce: "nonce-123",
    });

    const url = new URL(request.url);
    const state = decodeOAuthState(url.searchParams.get("state") ?? "");

    expect(url.origin).toBe("https://manus.example");
    expect(url.pathname).toBe("/app-auth");
    expect(url.searchParams.get("appId")).toBe("fcp-app");
    expect(url.searchParams.get("redirectUri")).toBe("https://preview.example/api/oauth/callback");
    expect(url.searchParams.get("type")).toBe("signIn");
    expect(state).toEqual({
      redirectUri: "https://preview.example/api/oauth/callback",
      nonce: "nonce-123",
      returnTo: "/?tab=timelines#two-year",
    });
  });

  it("hands temporary previews off to the configured published origin before OAuth begins", () => {
    const configuredAppOrigin = process.env.VITE_APP_ORIGIN;
    expect(configuredAppOrigin).toMatch(/^https:\/\/.+/);
    expect(getOAuthHandoffUrl({
      currentOrigin: "https://3000-preview.manus.computer",
      configuredAppOrigin,
      currentPath: "/?tab=timelines#two-year",
    })).toBe(`${configuredAppOrigin}/?tab=timelines#two-year`);
    expect(getOAuthHandoffUrl({
      currentOrigin: "https://fcpbuilder-mwqw3amr.manus.space",
      configuredAppOrigin,
      currentPath: "/",
    })).toBeNull();
    expect(getOAuthHandoffUrl({
      currentOrigin: "https://3000-preview.manus.computer",
      configuredAppOrigin: "http://insecure.example",
      currentPath: "/",
    })).toBeNull();
  });

  it("rejects external or protocol-relative post-login redirect targets", () => {
    expect(sanitizeOAuthReturnPath("https://evil.example/path")).toBe("/");
    expect(sanitizeOAuthReturnPath("//evil.example/path")).toBe("/");
    expect(sanitizeOAuthReturnPath("/?tab=timelines")).toBe("/?tab=timelines");
  });
});
