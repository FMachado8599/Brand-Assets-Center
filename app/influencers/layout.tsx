import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/ui/confirm";

export default function InfluencersLayout({ children }: { children: ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
