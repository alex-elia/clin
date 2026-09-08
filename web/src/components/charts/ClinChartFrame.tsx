"use client";

import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

type ChartChild = ReactElement<{ width?: number; height?: number }>;

type ClinChartFrameProps = {
  className?: string;
  children: ChartChild;
};

/** Mount Recharts with measured pixel size (avoids ResponsiveContainer -1 warnings). */
export function ClinChartFrame({ className, children }: ClinChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.floor(width);
      const h = Math.floor(height);
      if (w > 0 && h > 0) {
        setSize((prev) =>
          prev?.width === w && prev?.height === h ? prev : { width: w, height: h },
        );
      } else {
        setSize(null);
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className ?? "relative block h-[220px] w-full min-h-0 min-w-0"}
    >
      {size
        ? cloneElement(children, {
            width: size.width,
            height: size.height,
          })
        : null}
    </div>
  );
}
