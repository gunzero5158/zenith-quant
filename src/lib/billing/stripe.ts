import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

// Webhook signature verification is pure HMAC against STRIPE_WEBHOOK_SECRET;
// it must not require the API key to be configured.
export function getStripeForWebhooks(): Stripe {
  if (process.env.STRIPE_SECRET_KEY) return getStripe();
  return new Stripe("sk_webhook_verify_only");
}

// Stripe rejects charges below the CNY equivalent of ~$0.50 with
// amount_too_small, so the floor must stay comfortably above that.
export const MIN_TOPUP_CENTS = 500;    // ¥5
export const MAX_TOPUP_CENTS = 50_000; // ¥500
