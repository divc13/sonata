import { LoginForm } from "~/app/(auth)/_components/login-form";
import { configuredOAuthProviders } from "~/lib/auth-providers";
import { noindexMetadata } from "~/lib/metadata";

import { AuthModal } from "../auth-modal";

export const metadata = {
  ...noindexMetadata,
  title: "Login",
  description: "Login to your account",
};

export default function LoginModal() {
  return (
    <AuthModal
      title="Welcome back"
      description="Log in to sync your library across devices."
    >
      <LoginForm providers={configuredOAuthProviders()} />
    </AuthModal>
  );
}
