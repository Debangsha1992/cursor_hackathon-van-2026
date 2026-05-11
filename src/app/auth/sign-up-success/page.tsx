import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Check your email — PaperPilot AI",
};

export default function Page() {
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Thanks for signing up</CardTitle>
          <CardDescription>Check your email to confirm</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You&apos;ve successfully signed up. Please check your email to
            confirm your account before signing in.
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
