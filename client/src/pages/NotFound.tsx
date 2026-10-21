import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/vsa/elements";
import { SearchX } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <EmptyState icon={SearchX} title="Page not found" sub="This address doesn't match a screen in the tracker. It may have moved." action={<Button asChild size="sm"><Link href="/">Go to Overview</Link></Button>} />
    </main>
  );
}
