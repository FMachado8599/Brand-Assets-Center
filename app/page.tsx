import { AppShell } from "@/components/board/AppShell";
import { DataProvider } from "@/components/data/DataProvider";
import { ConfirmProvider } from "@/components/ui/confirm";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <DataProvider>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </DataProvider>
  );
}
