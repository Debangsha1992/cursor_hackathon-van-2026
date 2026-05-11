import { AuthShell } from "@/components/auth/auth-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Auth error — PaperPilot AI",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            Sorry, something went wrong.
          </CardTitle>
        </CardHeader>
        <CardContent>
          {params?.error ? (
            <p className="text-sm text-muted-foreground">
              Code error: <span className="font-mono">{params.error}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              An unspecified error occurred.
            </p>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
