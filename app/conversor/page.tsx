import type { Metadata } from "next";
import { ConverterShell } from "@/components/converter/ConverterShell";
import { hasFreeConvertKey } from "@/lib/converter/freeconvert";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversor",
  description: "Convertí y comprimí archivos con FreeConvert.",
};

export default function ConversorPage() {
  return <ConverterShell configured={hasFreeConvertKey()} />;
}
