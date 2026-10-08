export type PaymentInit = {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
};
export interface PaymentAdapter {
  initialize(input: PaymentInit): Promise<{
    reference: string;
    authorizationUrl: string;
    accessCode: string;
  }>;
  verify(reference: string): Promise<{
    reference: string;
    status: "succeeded" | "pending" | "failed";
    amountKobo: number;
    currency: "NGN";
    environment: "test" | "live";
  }>;
}
export class MockPaymentAdapter implements PaymentAdapter {
  async initialize(input: PaymentInit) {
    return {
      reference: input.reference,
      authorizationUrl: `/checkout/status?reference=${encodeURIComponent(input.reference)}`,
      accessCode: `mock_${input.reference}`,
    };
  }
  async verify(reference: string) {
    return {
      reference,
      status: "pending" as const,
      amountKobo: 0,
      currency: "NGN" as const,
      environment: "test" as const,
    };
  }
}
export class PaystackTestAdapter implements PaymentAdapter {
  constructor(private secretKey: string) {
    if (!secretKey.startsWith("sk_test_"))
      throw new Error(
        "Only Paystack test keys are accepted outside production launch setup",
      );
  }
  async initialize(input: PaymentInit) {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        currency: "NGN",
        callback_url: input.callbackUrl,
      }),
    });
    if (!res.ok) throw new Error("paystack_initialization_failed");
    const body = (await res.json()) as {
      data: {
        reference: string;
        authorization_url: string;
        access_code: string;
      };
    };
    return {
      reference: body.data.reference,
      authorizationUrl: body.data.authorization_url,
      accessCode: body.data.access_code,
    };
  }
  async verify(reference: string) {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    if (!res.ok) throw new Error("paystack_verification_failed");
    const body = (await res.json()) as {
      data: {
        reference: string;
        status: string;
        amount: number;
        currency: string;
        domain: string;
      };
    };
    return {
      reference: body.data.reference || reference,
      status:
        body.data.status === "success"
          ? "succeeded"
          : body.data.status === "failed" ||
              body.data.status === "abandoned" ||
              body.data.status === "reversed"
            ? "failed"
            : "pending",
      amountKobo: body.data.amount,
      currency: body.data.currency as "NGN",
      environment: body.data.domain === "live" ? "live" : "test",
    };
  }
}
