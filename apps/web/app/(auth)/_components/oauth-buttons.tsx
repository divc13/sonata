"use client";

import { authClient } from "@infinitunes/auth/client";
import { Button } from "@infinitunes/ui/components/button";
import { Loader2 } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { GitHub, Google } from "~/components/icons";
import type { OAuthProvider } from "~/lib/auth-providers";

import { authSquareButtonStyles } from "./field-styles";

type OAuthButtonProps = {
  isFormDisabled: boolean;
  /** Already passed through `safeRedirectPath`. */
  callbackUrl: string;
  /**
   * The providers `createAuth` registered. A provider without credentials is
   * not offered: Better Auth would answer "Provider not found".
   */
  providers?: OAuthProvider[];
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
};

/** Starts a provider sign-in. Outside the component: the React Compiler bails out on try/finally. */
async function signInWithProvider(
  provider: OAuthProvider,
  callbackUrl: string,
  setOauthLoading: React.Dispatch<
    React.SetStateAction<OAuthProvider | undefined>
  >,
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>,
) {
  setOauthLoading(provider);
  setIsSubmitting(true);

  try {
    // On success the browser navigates to the provider, so there is nothing to announce.
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: callbackUrl,
    });

    if (error) toast.error(error.message ?? "Something went wrong.");
  } catch (error) {
    console.error(error);
    toast.error("Something went wrong.");
  } finally {
    setIsSubmitting(false);
    setOauthLoading(undefined);
  }
}

/** Visual order, so the pair keeps its place when only one is configured. */
const PROVIDERS: { id: OAuthProvider; label: string; Icon: typeof Google }[] = [
  { id: "github", label: "GitHub", Icon: GitHub },
  { id: "google", label: "Google", Icon: Google },
];

export function OAuthButtons(props: OAuthButtonProps) {
  const {
    isFormDisabled,
    callbackUrl,
    providers = [],
    setIsSubmitting,
  } = props;

  const [oauthLoading, setOauthLoading] = React.useState<OAuthProvider>();
  const shown = PROVIDERS.filter(({ id }) => providers.includes(id));

  async function startProviderSignIn(provider: OAuthProvider) {
    await signInWithProvider(
      provider,
      callbackUrl,
      setOauthLoading,
      setIsSubmitting,
    );
  }

  if (shown.length === 0) return null;

  return (
    <div className="space-y-4">
      <div
        className={shown.length > 1 ? "grid grid-cols-2 gap-2" : "grid gap-2"}
      >
        {shown.map(({ id, label, Icon }) => (
          <Button
            key={id}
            type="button"
            variant="secondary"
            onClick={() => startProviderSignIn(id)}
            disabled={isFormDisabled}
            className={authSquareButtonStyles}
          >
            {oauthLoading === id ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Icon className="mr-2 size-4" />
            )}
            {label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        or
      </div>
    </div>
  );
}
