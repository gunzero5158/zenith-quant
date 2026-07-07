import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { ensureDbReady, schema } from "@/lib/db";

const COOKIE_NAME = "zenith_session";
const SESSION_DAYS = 7;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Only true local development/tests may run keyless — staging, preview or
    // any misconfigured deployment must fail fast, or sessions become
    // forgeable with this publicly visible string.
    const env = process.env.NODE_ENV;
    if (env === "development" || env === "test") {
      return new TextEncoder().encode("zenith-dev-secret-do-not-use-in-prod");
    }
    throw new Error("AUTH_SECRET must be set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export function attachSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, maxAge: 0, path: "/" });
}

export async function getSessionUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export type SessionUser = typeof schema.users.$inferSelect;

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const userId = await getSessionUserId(req);
  if (!userId) return null;
  const db = await ensureDbReady();
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const user = rows[0];
  if (!user || !user.emailVerifiedAt) return null;
  return user;
}

export function isAdminEmail(email: string): boolean {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
