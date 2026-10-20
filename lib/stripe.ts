import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe() {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export const PLANS = {
  monthly: { label: "Monthly", price: "$4.99", per: "/month", envKey: "STRIPE_PRICE_MONTHLY" },
  yearly: { label: "Yearly", price: "$29.99", per: "/year", envKey: "STRIPE_PRICE_YEARLY" },
} as const;

export type PlanKey = keyof typeof PLANS;

export function priceIdFor(plan: PlanKey) {
  return process.env[PLANS[plan].envKey]!;
}
