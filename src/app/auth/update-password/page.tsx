import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata = {
  title: "Update password — PaperPilot AI",
};

export default function Page() {
  return (
    <AuthShell>
      <UpdatePasswordForm />
    </AuthShell>
  );
}
