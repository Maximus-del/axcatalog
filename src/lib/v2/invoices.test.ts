import { describe, expect, it } from "vitest";
import { invoiceEmail, mailtoHref } from "./invoices";

describe("invoice email", () => {
  const input = {
    orderNumber: "BR-2026-12345",
    clientName: "Darnell Mooney",
    createdAt: "2026-10-18T03:00:00Z",
    lines: [
      { title: "Mooney World Football Tour #11 Tee", color: "Black", size: "L", quantity: 30, unitPrice: 16.2, lineTotal: 486 },
      { title: "Mooney World WRLD #11 Hoodie", color: null, size: "M", quantity: 25, unitPrice: 31.5, lineTotal: 787.5 },
    ],
    subtotal: 1273.5,
    creditApplied: 100,
    amountDue: 1173.5,
    paymentInstructions: "Zelle to payments@athletexclusive.com",
  };

  it("lists every line, the credit and what is due", () => {
    const { subject, body } = invoiceEmail(input);
    expect(subject).toBe("AX invoice · Order BR-2026-12345 · $1,173.50 due");
    expect(body).toContain("Hi Darnell,");
    expect(body).toContain("• 30 × Mooney World Football Tour #11 Tee (Black / L) @ $16.20 = $486.00");
    expect(body).toContain("• 25 × Mooney World WRLD #11 Hoodie (M) @ $31.50 = $787.50");
    expect(body).toContain("AX credit applied: −$100.00");
    expect(body).toContain("How to pay: Zelle to payments@athletexclusive.com");
  });

  it("falls back to Zelle wording and omits a zero credit", () => {
    const { body } = invoiceEmail({ ...input, creditApplied: 0, paymentInstructions: null });
    expect(body).not.toContain("AX credit applied");
    expect(body).toContain("How to pay: Zelle");
  });

  it("builds a mailto with the address and encoded text", () => {
    const href = mailtoHref("teamclaypool+mooney@gmail.com", { subject: "A & B", body: "x\ny" });
    expect(href).toBe("mailto:teamclaypool+mooney@gmail.com?subject=A%20%26%20B&body=x%0Ay");
  });
});
