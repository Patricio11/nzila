// The Banco app. Fetched when it is first opened, not before (the megabytes rule: finding F-188).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Button, Choice, Receipt } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import { account, bankMove, walletNow, type WalletLine } from "../world/account.ts";
import { type WorldProvider } from "../world/provider.ts";

/** What a movement is called. One the game does not have a word for yet is a "Movimento". */
const REASONS = ["grant", "bank_in", "bank_out", "purchase", "p2p"] as const;
const reasonOf = (reason: string): string => tr.t(`bank.reason.${REASONS.find((one) => one === reason) ?? "other"}`);
const day = (iso: string): string => new Date(iso).toLocaleString("pt-AO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The Banco (UX_UI_SPEC.md §4.3): what is in the Carteira, on the player and at risk, and what is in the Banco,
 * safe. Money goes in and comes out only at a caixa: the zone decides whether the player is at one, and this
 * offers the buttons only when the phone thinks so too.
 */
export function Banco({ world }: { world: WorldProvider }) {
  const [wallet, setWallet] = useState(account()?.wallet ?? { cash: 0, bank: 0 });
  const [both, setBoth] = useState<{ cash: WalletLine[]; bank: WalletLine[] } | null>(null);
  // Whose movements are shown: the Carteira's or the Banco's own.
  const [which, setWhich] = useState<"cash" | "bank">("cash");
  const lines = both ? both[which] : null;
  const [amount, setAmount] = useState("");
  const [said, setSaid] = useState<"done" | "far" | "short" | "offline" | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<WalletLine | null>(null);
  const [near, setNear] = useState(world.atCaixa());
  const read = async (): Promise<void> => {
    const now = await walletNow();
    if (!now) return setBoth((had) => had ?? { cash: [], bank: [] });
    setWallet({ cash: now.cash, bank: now.bank });
    setBoth({ cash: now.cashLines, bank: now.bankLines });
  };
  useEffect(() => {
    void read();
    const timer = window.setInterval(() => setNear(world.atCaixa()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const sum = Number(amount);
  const move = async (way: "deposit" | "withdraw"): Promise<void> => {
    setBusy(true);
    setSaid(null);
    const answer = await bankMove(way, sum);
    setBusy(false);
    setSaid(answer === "ok" ? "done" : answer);
    if (answer !== "ok") return;
    setAmount("");
    await read();
  };
  if (shown) {
    return (
      <div class="tm-bank">
        <Receipt title={reasonOf(shown.reason)} lines={[{ label: tr.t(shown.amount > 0 ? "bank.in" : "bank.out"), amount: Math.abs(shown.amount) }]} total={Math.abs(shown.amount)} at={day(shown.at)} place={tr.t("app.banco")} reference={shown.id.slice(0, 6).toUpperCase()} />
        <Button kind="quiet" onPress={() => setShown(null)}>
          {tr.t("player.close")}
        </Button>
      </div>
    );
  }
  return (
    <div class="tm-bank">
      <dl class="tm-bank-held">
        <div class="tm-bank-risk">
          <dt>{tr.t("bank.cash")}</dt>
          <dd class="n-num">{tr.makuta(wallet.cash)}</dd>
          <small>{tr.t("bank.cash.note")}</small>
        </div>
        <div class="tm-bank-safe">
          <dt>{tr.t("bank.bank")}</dt>
          <dd class="n-num">{tr.makuta(wallet.bank)}</dd>
          <small>{tr.t("bank.bank.note")}</small>
        </div>
      </dl>
      {near ? (
        <form class="tm-bank-move" onSubmit={(event) => event.preventDefault()}>
          <label class="tm-name-label" for="tm-amount">
            {tr.t("bank.amount")}
          </label>
          <input id="tm-amount" class="tm-name-input" type="text" inputMode="numeric" autocomplete="off" value={amount} maxLength={12} onInput={(event) => setAmount(event.currentTarget.value.replace(/\D/g, "").replace(/^0+/, ""))} />
          <div class="tm-keys">
            <Button onPress={() => void move("deposit")} disabled={!(sum > 0) || sum > wallet.cash} busy={busy}>
              {tr.t("bank.deposit")}
            </Button>
            <Button kind="quiet" onPress={() => void move("withdraw")} disabled={!(sum > 0) || sum > wallet.bank} busy={busy}>
              {tr.t("bank.withdraw")}
            </Button>
          </div>
          <div class="tm-keys">
            <button type="button" class="tm-data-end" onClick={() => setAmount(String(wallet.cash || ""))}>
              {tr.t("bank.all.cash")}
            </button>
            <button type="button" class="tm-data-end" onClick={() => setAmount(String(wallet.bank || ""))}>
              {tr.t("bank.all.bank")}
            </button>
          </div>
        </form>
      ) : (
        <p class="tm-note">{tr.t("bank.far")}</p>
      )}
      <p class="tm-save-said" role="status">
        {said ? tr.t(`bank.said.${said}`) : ""}
      </p>
      <Choice
        label={tr.t("bank.lines")}
        options={[
          { id: "cash", label: tr.t("bank.which.cash") },
          { id: "bank", label: tr.t("bank.which.bank") },
        ]}
        value={which}
        onChange={setWhich}
      />
      {lines === null ? (
        <p class="tm-note">{tr.t("bank.reading")}</p>
      ) : lines.length === 0 ? (
        <p class="tm-note">{tr.t("bank.none")}</p>
      ) : (
        <ul class="tm-bank-lines">
          {lines.map((line) => (
            <li>
              <button type="button" onClick={() => setShown(line)}>
                <span>{reasonOf(line.reason)}</span>
                <time>{day(line.at)}</time>
                <b class={line.amount > 0 ? "tm-bank-in n-num" : "tm-bank-out n-num"}>{tr.makuta(line.amount)}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
