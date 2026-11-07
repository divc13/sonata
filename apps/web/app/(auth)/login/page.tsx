import Link from "next/link";
import { Suspense } from "react";

import { configuredOAuthProviders } from "~/lib/auth-providers";

import { AuthIntro } from "../_components/auth-intro";
import { AuthFormSkeleton } from "../_components/auth-skeleton";
import { authLinkStyles } from "../_components/field-styles";
import { LocalDevHint } from "../_components/local-dev-hint";
import { LoginForm } from "../_components/login-form";
import { SignedInRedirect } from "../_components/signed-in-redirect";

export const metadata = {
  title: "Login",
  description: "Login to your account",
};

export default function LoginPage() {
  // Only the providers with credentials: an unconfigured one would fail with
  // "Provider not found" the moment it is clicked.
  const providers = configuredOAuthProviders();

  return (
    <div className="grid gap-4">
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>

      <AuthIntro
        title="Welcome back"
        description="Log in to sync your library across devices."
      />

      <Suspense
        fallback={
          <AuthFormSkeleton fields={2} passkey social={providers.length > 0} />
        }
      >
        <LoginForm providers={providers} />
      </Suspense>

      <LocalDevHint />

      <p className="text-center text-xs text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className={authLinkStyles}>
          Sign up
        </Link>
      </p>
    </div>
  );
}
