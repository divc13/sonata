import { pageMetadata } from "~/lib/metadata";
import { demoEpochs, formatUsd, RATE_PER_HOUR } from "~/lib/sonata-demo";
import { cn } from "~/lib/utils";

export const metadata = pageMetadata({
  title: "How the money works",
  description:
    "Every epoch, verified listening hours are settled against the platform reserve and paid to song accounts.",
  url: "/audit",
});

const PLATFORM_BALANCE = 3842.6;
const MONTH_FLOOR = 1380;
const THREE_MONTH_TARGET = 4140;
const TOTAL_PAID = 2081.8;
const COVERAGE_MONTHS = 2.8;

const stats = [
  { label: "Platform balance", value: formatUsd(PLATFORM_BALANCE) },
  { label: "Reserve target", value: formatUsd(THREE_MONTH_TARGET) },
  {
    label: "Coverage",
    value: `${COVERAGE_MONTHS.toFixed(1)} months`,
    hint: "At the current run rate",
  },
  { label: "Fixed rate", value: `${formatUsd(RATE_PER_HOUR)} / hr` },
  { label: "Total paid", value: formatUsd(TOTAL_PAID) },
  { label: "Next epoch", value: "Nov 9, 2026", hint: "Epoch 8 closes" },
];

const effectiveRate = (hours: number, total: number) =>
  `$${(total / hours).toFixed(3)}`;

export default function AuditPage() {
  const currentPct = Math.min(
    (PLATFORM_BALANCE / THREE_MONTH_TARGET) * 100,
    100,
  );
  const floorPct = (MONTH_FLOOR / THREE_MONTH_TARGET) * 100;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex max-w-2xl min-w-0 flex-col gap-2">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Audit
          </p>
          <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            How the money works
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Listening is measured in verified hours. Each epoch, the platform
            pays a fixed {formatUsd(RATE_PER_HOUR)} per hour from its reserve,
            and every song account is paid once. Nothing is hidden behind a
            dashboard.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            disabled
            className="inline-flex h-(--ctl) cursor-not-allowed items-center rounded-(--r-ctl) border border-border/60 bg-transparent px-3.5 text-sm font-semibold text-muted-foreground opacity-70"
          >
            Settle epoch
          </button>
          <p className="text-xs text-muted-foreground">
            Operator only. Settles with the computed rate and total.
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-border/60 py-6 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              {stat.label}
            </dt>
            <dd className="font-heading text-xl leading-7 font-semibold tracking-[-0.015em] tabular-nums">
              {stat.value}
            </dd>
            {stat.hint ? (
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            ) : null}
          </div>
        ))}
      </dl>

      <section className="flex max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
            Reserve
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatUsd(PLATFORM_BALANCE)} of {formatUsd(THREE_MONTH_TARGET)}
          </p>
        </div>

        <div
          aria-hidden="true"
          className="relative h-3 overflow-hidden rounded-full bg-fill"
        >
          <div
            className="h-full rounded-full bg-primary/80"
            style={{ width: `${currentPct}%` }}
          />
          <span
            className="absolute inset-y-0 w-px bg-foreground/60"
            style={{ left: `${floorPct}%` }}
          />
        </div>
        <p className="sr-only">
          Reserve at {formatUsd(PLATFORM_BALANCE)}, {COVERAGE_MONTHS.toFixed(1)}{" "}
          months of payouts. One month floor {formatUsd(MONTH_FLOOR)}, three
          month target {formatUsd(THREE_MONTH_TARGET)}.
        </p>

        <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Current</span>
            <span className="font-medium tabular-nums">
              {formatUsd(PLATFORM_BALANCE)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">1-month floor</span>
            <span className="font-medium tabular-nums">
              {formatUsd(MONTH_FLOOR)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">3-month target</span>
            <span className="font-medium tabular-nums">
              {formatUsd(THREE_MONTH_TARGET)}
            </span>
          </div>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          The floor is one month of payouts. The target is three months, so a
          quiet week never delays a settlement.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
            Epochs
          </h2>
          <p className="text-xs text-muted-foreground">
            Testnet · settled in USDC
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">
                  Epoch
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Dates
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Hours
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Effective rate
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Total paid
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Mode
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Proof
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {demoEpochs.map((epoch) => (
                <tr key={epoch.id}>
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    <span className="tabular-nums">{epoch.id}</span>
                    {epoch.status === "open" ? (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-primary uppercase">
                        Open
                      </span>
                    ) : null}
                  </th>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                    {epoch.starts} – {epoch.ends}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {epoch.hours.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {effectiveRate(epoch.hours, epoch.total)}
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">
                    {formatUsd(epoch.total)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border border-border/60 px-2 py-0.5 text-[0.6875rem]",
                        epoch.mode === "constant"
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {epoch.mode}
                    </span>
                  </td>
                  <td
                    aria-label={`Root ${epoch.root}, transaction ${epoch.tx}`}
                    className="px-4 py-3"
                  >
                    <div className="flex flex-col gap-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                      <span>root {epoch.root}</span>
                      <span>tx {epoch.tx}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/60 text-xs text-muted-foreground">
                <td colSpan={2} className="px-4 py-3">
                  Six epochs shown
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {demoEpochs
                    .reduce((sum, epoch) => sum + epoch.hours, 0)
                    .toLocaleString("en-US")}
                </td>
                <td className="px-3 py-3 text-right text-muted-foreground">
                  —
                </td>
                <td className="px-3 py-3 text-right font-medium text-foreground tabular-nums">
                  {formatUsd(
                    demoEpochs.reduce((sum, epoch) => sum + epoch.total, 0),
                  )}
                </td>
                <td colSpan={2} className="px-4 py-3 text-muted-foreground">
                  Epoch 8 settles next
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          A constant epoch pays the fixed rate. A pro-rata epoch splits a
          smaller reserve across the hours listened, and the effective rate is
          shown rather than hidden. Proofs are published with every settlement.
        </p>
        <p className="text-xs text-muted-foreground">
          Hours are aggregate. Sonata never publishes who listened.
        </p>
      </section>
    </div>
  );
}
