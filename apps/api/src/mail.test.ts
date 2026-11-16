import { describe, expect, test } from "vitest";
import { codeLetter, resendMailer } from "./mail.ts";

describe("a letter with a code", () => {
  test("says the code in its subject and in its words, and how long it lasts, in the game's own Portuguese", () => {
    const verify = codeLetter("verify", "dona.xepa@exemplo.ao", "246810", 10);
    expect(verify).toEqual({ to: "dona.xepa@exemplo.ao", subject: "246810 é o teu código do Nzila", text: expect.stringContaining("246810") });
    expect(verify.text).toContain("10 minutos");
    const reset = codeLetter("reset", "dona.xepa@exemplo.ao", "135790", 10);
    expect(reset.subject).toContain("palavra-passe");
    expect(reset.text).toContain("135790");
    // Whoever did not ask is told that nothing has changed.
    expect(reset.text).toContain("continua a mesma");
  });
});

describe("Resend", () => {
  test("is sent one request a letter, with the key in a header and nowhere else", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const post = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await resendMailer("re_secret_key", "Nzila <ola@exemplo.ao>", post).send({ to: "kota@exemplo.ao", subject: "Olá", text: "Bom dia." });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer re_secret_key");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ from: "Nzila <ola@exemplo.ao>", to: ["kota@exemplo.ao"], subject: "Olá", text: "Bom dia." });
    expect(calls[0]!.init.body as string).not.toContain("re_secret_key");
  });

  test("a letter Resend refuses throws, and the error does not carry the key", async () => {
    const post = (async () => new Response("no", { status: 422 })) as typeof fetch;
    await expect(resendMailer("re_secret_key", "Nzila <ola@exemplo.ao>", post).send({ to: "kota@exemplo.ao", subject: "Olá", text: "Bom dia." })).rejects.toThrow(/^mail was not sent: 422$/);
  });
});
