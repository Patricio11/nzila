// Sample content for the styleguide. Nothing here is the game's content: the
// names, places and amounts exist only to fill the components on this page.
// (Files named *.fixtures.ts or fixtures.ts are where the house rules allow
// sample Makuta amounts and sample words.)

export const receipt = {
  title: "Cantina da Tia Rosa",
  lines: [
    { label: "Mufete", qty: 2, amount: 1200 },
    { label: "Gasosa", qty: 1, amount: 300 },
  ],
  total: 1500,
  at: "17:42",
  place: "Marginal",
  reference: "7K2-MN4",
};

export const player = { name: "Kiesse Domingos", number: "000 482 117", bairro: "Marginal e Baixa", arrived: "14.11.2026" };

export const route = { line: "Mutamba · Marginal", stops: ["Mutamba", "Marginal", "Fortaleza", "Baixa"] };

export const wallet = { amount: 25_000, fare: 200 };

export const balloon = "Bora à Ilha comer mufete?";

export const empty = { title: "Ainda sem mensagens", body: "Quando um kamba te escrever, aparece aqui." };

export const typeSamples = {
  place: "Marginal e Baixa",
  number: "1.500 Mk",
  title: "Cantina da Tia Rosa",
  body: "A Marginal chama-se Avenida 4 de Fevereiro.",
  label: "Apanhar",
  small: "17:42 · ref. 7K2-MN4",
};
