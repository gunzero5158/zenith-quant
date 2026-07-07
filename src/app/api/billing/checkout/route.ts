import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getStripe, isStripeConfigured, MIN_TOPUP_CENTS, MAX_TOPUP_CENTS } from "@/lib/billing/stripe";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "支付功能暂未开通，请联系管理员" }, { status: 503 });
    }

    const body = await req.json().catch(() => null);
    const amountCents = body?.amountCents;
    if (
      typeof amountCents !== "number" || !Number.isInteger(amountCents) ||
      amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS
    ) {
      return NextResponse.json(
        { error: `充值金额需为 ¥${MIN_TOPUP_CENTS / 100}–¥${MAX_TOPUP_CENTS / 100} 之间` },
        { status: 400 },
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || "http://localhost:3000";
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "cny",
          product_data: { name: "Zenith Quant 余额充值" },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      metadata: { userId: user.id },
      customer_email: user.email,
      success_url: `${origin}/recharge/success`,
      cancel_url: `${origin}/recharge/cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "创建支付会话失败，请稍后再试" }, { status: 500 });
  }
}
