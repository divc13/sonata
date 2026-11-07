// Kept free of zod and @infinitunes/env on purpose: this module is in every
// client bundle. The fallback mirrors NEXT_PUBLIC_APP_URL's default in
// packages/env/src/schema.ts, and lib/env.ts still validates the value at build.
const DEFAULT_APP_URL = "https://sonata.music";

export const siteConfig = {
  name: "Sonata",
  url: process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
  description:
    "Every song is an account. A premium player where each master is 1 of 1.",

  author: {
    x: "@sonata",
  },

  links: {
    github: "https://github.com/sonata/sonata",
    x: "https://twitter.com/sonata",
  },
};
