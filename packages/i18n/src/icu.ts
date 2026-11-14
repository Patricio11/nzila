// A small reader of ICU messages: just the parts the game's copy uses.
//
//   "Olá, {name}."
//   "{n, plural, one {# minuto} other {# minutos}}"
//   "{kind, select, van {O azul e branco} other {O carro}} chegou."
//
// Inside a plural, "#" is the number, written the Angolan way. No dependency:
// the full ICU libraries cost more bytes than the whole shell is allowed.

export type Params = Readonly<Record<string, string | number>>;

type Node =
  | string
  | { readonly arg: string; readonly kind: "value" }
  | { readonly arg: string; readonly kind: "plural" | "select"; readonly options: Readonly<Record<string, readonly Node[]>> }
  | { readonly kind: "hash" };

class Parser {
  private readonly src: string;
  private at = 0;

  constructor(src: string) {
    this.src = src;
  }

  private fail(what: string): never {
    throw new Error(`${what} at ${this.at} in "${this.src}"`);
  }

  private skipSpace(): void {
    while (this.src[this.at] === " " || this.src[this.at] === "\n") this.at++;
  }

  private word(): string {
    this.skipSpace();
    const start = this.at;
    while (this.at < this.src.length && /[\w=.-]/.test(this.src[this.at]!)) this.at++;
    if (this.at === start) this.fail("expected a name");
    const name = this.src.slice(start, this.at);
    this.skipSpace();
    return name;
  }

  /** Reads text and arguments up to the end, or up to the "}" that closes an option. */
  nodes(nested: boolean, inPlural: boolean): Node[] {
    const out: Node[] = [];
    let text = "";
    const flush = (): void => {
      if (text) out.push(text);
      text = "";
    };
    while (this.at < this.src.length) {
      const ch = this.src[this.at]!;
      if (ch === "}") {
        if (!nested) this.fail('unexpected "}"');
        flush();
        return out;
      }
      if (ch === "{") {
        flush();
        this.at++;
        out.push(this.argument());
      } else if (ch === "#" && inPlural) {
        flush();
        this.at++;
        out.push({ kind: "hash" });
      } else {
        text += ch;
        this.at++;
      }
    }
    if (nested) this.fail('missing "}"');
    flush();
    return out;
  }

  private argument(): Node {
    const arg = this.word();
    if (this.src[this.at] === "}") {
      this.at++;
      return { arg, kind: "value" };
    }
    if (this.src[this.at] !== ",") this.fail('expected "," or "}"');
    this.at++;
    const kind = this.word();
    if (kind !== "plural" && kind !== "select") this.fail(`"${kind}" is not plural or select`);
    if (this.src[this.at] !== ",") this.fail('expected ","');
    this.at++;
    const options: Record<string, readonly Node[]> = {};
    for (;;) {
      this.skipSpace();
      if (this.src[this.at] === "}") break;
      const name = this.word();
      if (this.src[this.at] !== "{") this.fail('expected "{"');
      this.at++;
      options[name] = this.nodes(true, kind === "plural");
      this.at++;
    }
    this.at++;
    if (!options.other) this.fail(`a ${kind} needs an "other" option`);
    return { arg, kind, options };
  }
}

const parsed = new Map<string, readonly Node[]>();

function parse(message: string): readonly Node[] {
  let nodes = parsed.get(message);
  if (!nodes) {
    nodes = new Parser(message).nodes(false, false);
    parsed.set(message, nodes);
  }
  return nodes;
}

/** The names a message expects to be given. Throws when the message is malformed. */
export function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  const visit = (nodes: readonly Node[]): void => {
    for (const node of nodes) {
      if (typeof node === "string" || node.kind === "hash") continue;
      names.add(node.arg);
      if (node.kind !== "value") Object.values(node.options).forEach(visit);
    }
  };
  visit(parse(message));
  return [...names];
}

export interface Formatters {
  readonly plural: (n: number) => string;
  readonly number: (n: number) => string;
}

/**
 * Fills a message in. An argument that was not supplied is left visible as
 * "{name}": a wrong label on screen is a bug someone will report, a crash in
 * the HUD is worse.
 */
export function formatMessage(message: string, params: Params, formatters: Formatters): string {
  const render = (nodes: readonly Node[], count: number | null): string => {
    let out = "";
    for (const node of nodes) {
      if (typeof node === "string") out += node;
      else if (node.kind === "hash") out += formatters.number(count!);
      else {
        const value = params[node.arg];
        if (value === undefined) out += `{${node.arg}}`;
        else if (node.kind === "value") out += typeof value === "number" ? formatters.number(value) : value;
        else if (node.kind === "select") out += render(node.options[String(value)] ?? node.options.other!, count);
        else {
          const n = Number(value);
          out += render(node.options[`=${n}`] ?? node.options[formatters.plural(n)] ?? node.options.other!, n);
        }
      }
    }
    return out;
  };
  return render(parse(message), null);
}
