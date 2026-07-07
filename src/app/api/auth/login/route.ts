import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { ensureDbReady, schema } from "@/lib/db";
import { isValidEmail } from "@/lib/auth/verification";
import { createSessionToken, attachSessionCookie } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/ratelimit";

export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`login:${clientIp(req)}`, 20, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "尝试过于频繁，请稍后再试" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
    }

    const db = await ensureDbReady();
    const user = (
      await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
    )[0];
    // Hash a dummy value on miss so response time doesn't reveal registered emails.
    const passwordOk = user
      ? await bcrypt.compare(password, user.passwordHash)
      : (await bcrypt.hash(password, 10), false);
    if (!user || !passwordOk) {
      return NextResponse.json({ error: "邮箱或密码不正确" }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        { error: "邮箱尚未验证，请先完成邮箱验证", needVerify: true },
        { status: 403 },
      );
    }

    const res = NextResponse.json({ ok: true });
    attachSessionCookie(res, await createSessionToken(user.id));
    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "登录失败，请稍后再试" }, { status: 500 });
  }
}
