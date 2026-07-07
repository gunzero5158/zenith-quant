import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { ensureDbReady, schema } from "@/lib/db";
import { hashCode, isValidEmail, CODE_MAX_ATTEMPTS } from "@/lib/auth/verification";
import { createSessionToken, attachSessionCookie, isAdminEmail } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/ratelimit";

export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`verify:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "邮箱或验证码格式不正确" }, { status: 400 });
    }

    const db = await ensureDbReady();
    const now = Date.now();

    const codeRow = (
      await db.select().from(schema.verificationCodes)
        .where(eq(schema.verificationCodes.email, email)).limit(1)
    )[0];
    if (!codeRow || codeRow.expiresAt < now) {
      return NextResponse.json({ error: "验证码已过期，请重新获取" }, { status: 400 });
    }
    if (codeRow.attempts >= CODE_MAX_ATTEMPTS) {
      return NextResponse.json({ error: "尝试次数过多，请重新获取验证码" }, { status: 400 });
    }
    if (codeRow.codeHash !== hashCode(email, code)) {
      await db.update(schema.verificationCodes)
        .set({ attempts: codeRow.attempts + 1 })
        .where(eq(schema.verificationCodes.email, email));
      return NextResponse.json({ error: "验证码不正确" }, { status: 400 });
    }

    const user = (
      await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
    )[0];
    if (!user) {
      return NextResponse.json({ error: "账号不存在，请重新注册" }, { status: 400 });
    }

    await db.update(schema.users)
      .set({ emailVerifiedAt: user.emailVerifiedAt ?? now, isAdmin: isAdminEmail(email) })
      .where(eq(schema.users.id, user.id));
    await db.delete(schema.verificationCodes).where(eq(schema.verificationCodes.email, email));

    const res = NextResponse.json({ ok: true });
    attachSessionCookie(res, await createSessionToken(user.id));
    return res;
  } catch (err) {
    console.error("Verify error:", err);
    return NextResponse.json({ error: "验证失败，请稍后再试" }, { status: 500 });
  }
}
