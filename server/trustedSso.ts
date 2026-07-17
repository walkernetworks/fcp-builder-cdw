import { createHash } from "node:crypto";
import type { Request } from "express";
import type { User } from "../drizzle/schema";
import { getUserByOpenId, upsertUser } from "./db";

function normalizeHeaderName(value: string | undefined, fallback: string) {
  return (value || fallback).trim().toLowerCase();
}

export async function authenticateTrustedSso(req: Request): Promise<User | null> {
  if (process.env.FCP_AUTH_MODE !== "trusted-proxy") return null;

  const identityHeader = normalizeHeaderName(process.env.FCP_SSO_ID_HEADER, "x-auth-request-user");
  const emailHeader = normalizeHeaderName(process.env.FCP_SSO_EMAIL_HEADER, "x-auth-request-email");
  const nameHeader = normalizeHeaderName(process.env.FCP_SSO_NAME_HEADER, "x-auth-request-name");

  const identity = req.get(identityHeader)?.trim();
  const email = req.get(emailHeader)?.trim() || identity;
  const name = req.get(nameHeader)?.trim() || email || "CDW user";
  if (!identity) return null;

  const issuer = process.env.FCP_OIDC_ISSUER?.trim() || "trusted-corporate-oidc";
  const digest = createHash("sha256").update(`${issuer}:${identity}`).digest("hex").slice(0, 48);
  const openId = `corp:${digest}`;

  await upsertUser({
    openId,
    name,
    email: email || null,
    loginMethod: `trusted-proxy:${issuer}`.slice(0, 64),
    lastSignedIn: new Date(),
  });

  return (await getUserByOpenId(openId)) ?? null;
}
