import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { ensureDbReady, schema } from "@/lib/db";
import {
  generateCode, hashCode, isValidEmail, isValidPassword,
  CODE_TTL_MS, CODE_RESEND_COOLDOWN_MS,
} from "@/lib/auth/verification";
import { sendVerificationEmail, isSmtpConfigured } from "@/lib/auth/email";
import { rateLimit, clientIp } from "@/lib/auth/ratelimit";

export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = body?.password;
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }
    if (!isValidPassword(password)) {
      return NextResponse.json({ error: "密码长度需为 8–100 个字符" }, { status: 400 });
    }

    const db = await ensureDbReady();
    const now = Date.now();

    const existing = (
      await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
    )[0];
    if (existing?.emailVerifiedAt) {
      return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    }

    const codeRow = (
      await db.select().from(schema.verificationCodes)
        .where(eq(schema.verificationCodes.email, email)).limit(1)
    )[0];
    if (codeRow && now - codeRow.lastSentAt < CODE_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((CODE_RESEND_COOLDOWN_MS - (now - codeRow.lastSentAt)) / 1000);
      return NextResponse.json({ error: `发送太频繁，请 ${wait} 秒后再试` }, { status: 429 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    if (existing) {
      await db.update(schema.users)
        .set({ passwordHash })
        .where(eq(schema.users.id, existing.id));
    } else {
      await db.insert(schema.users).values({
        id: crypto.randomUUID(),
        email,
        passwordHash,
        createdAt: now,
      });
    }

    const code = generateCode();
    await db.insert(schema.verificationCodes)
      .values({
        email,
        codeHash: hashCode(email, code),
        expiresAt: now + CODE_TTL_MS,
        attempts: 0,
        lastSentAt: now,
      })
      .onConflictDoUpdate({
        target: schema.verificationCodes.email,
        set: {
          codeHash: hashCode(email, code),
          expiresAt: now + CODE_TTL_MS,
          attempts: 0,
          lastSentAt: now,
        },
      });

    await sendVerificationEmail(email, code);

    return NextResponse.json({
      ok: true,
      message: "验证码已发送，请查收邮件",
      // Surface the code in dev when no SMTP is configured, for local testing.
      ...(!isSmtpConfigured() && process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
    });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "注册失败，请稍后再试" }, { status: 500 });
  }
}
