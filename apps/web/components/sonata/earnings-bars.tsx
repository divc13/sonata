import { cn } from "~/lib/utils";

type EarningsBarsProps = {
  data: number[];
  /** Axis labels, spread from the first bar to the last. */
  labels?: string[];
  summary: string;
  className?: string;
};

/**
 * A compact bar chart of daily earnings. Amber bars, no gridlines except the
 * baseline, and an accessible text and table fallback.
 */
export function EarningsBars({
  data,
  labels = [],
  summary,
  className,
}: EarningsBarsProps) {
  const max = Math.max(...data, 1);

  return (
    <figure className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        aria-hidden="true"
        className="flex h-32 items-end gap-px border-b border-border/60 pb-px"
      >
        {data.map((value, index) => (
          <span
            key={index}
            className="min-h-0.5 flex-1 rounded-t-[2px] bg-primary/75 transition-[height] duration-slow ease-out"
            style={{ height: `${Math.max((value / max) * 100, 2)}%` }}
          />
        ))}
      </div>

      {labels.length > 0 ? (
        <div
          aria-hidden="true"
          className="flex justify-between text-[0.6875rem] leading-4 text-muted-foreground tabular-nums"
        >
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}

      <figcaption className="sr-only">
        {summary}
        <table>
          <caption>{summary}</caption>
          <tbody>
            {data.map((value, index) => (
              <tr key={index}>
                <th scope="row">Day {index + 1}</th>
                <td>${value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
