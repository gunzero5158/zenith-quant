import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getPricePerUseCents } from "@/lib/billing/settings";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    return NextResponse.json({
      user: {
        email: user.email,
        balanceCents: user.balanceCents,
        freeUsesRemaining: user.freeUsesRemaining,
        isAdmin: user.isAdmin,
      },
      pricePerUseCents: await getPricePerUseCents(),
    });
  } catch (err) {
    console.error("Me error:", err);
    return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
  }
}
