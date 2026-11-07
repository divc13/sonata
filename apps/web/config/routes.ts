export const appRoutes = [
  "/",
  "/album",
  "/artist",
  "/chart",
  "/episode",
  "/label",
  "/mix",
  "/playlist",
  "/radio",
  "/search",
  "/show",
  "/song",
];

/**
 * Two-segment paths that are real routes of their parent section. The proxy's
 * legacy `/album/<slug>` -> `/album` collapse must not swallow them.
 */
export const nestedAppRoutes = ["/artist/dashboard"];

export const userRoutes = ["/me"];
