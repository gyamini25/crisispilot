import clsx from "clsx";
import type { Severity } from "@/lib/types";

const styles: Record<Severity, string> = {
  SEV1: "bg-severity-sev1/15 text-severity-sev1 border-severity-sev1/40",
  SEV2: "bg-severity-sev2/15 text-severity-sev2 border-severity-sev2/40",
  SEV3: "bg-severity-sev3/15 text-severity-sev3 border-severity-sev3/40",
  SEV4: "bg-severity-sev4/15 text-severity-sev4 border-severity-sev4/40",
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-widest",
        styles[severity],
      )}
    >
      {severity}
    </span>
  );
}
