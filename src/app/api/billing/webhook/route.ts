import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeForWebhooks } from "@/lib/billing/stripe";
import { creditTopupIdempotent } from "@/lib/billing/charge";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature") || "";
    event = await getStripeForWebhooks().webhooks.constructEventAsync(payload, signature, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const amount = session.amount_total;

      if (session.payment_status === "paid" && userId && typeof amount === "number" && amount > 0) {
        const credited = await creditTopupIdempotent(userId, amount, session.id, event.id);
        if (credited) {
          console.log(`Topup credited: user=${userId} amount=${amount} session=${session.id}`);
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // Non-2xx makes Stripe retry later — correct for transient DB failures.
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
