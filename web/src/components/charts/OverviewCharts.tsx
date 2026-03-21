"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SEGMENT_COLORS: Record<string, string> = {
  active: "#16a34a",
  warm: "#2563eb",
  dormant: "#ca8a04",
  ghost: "#71717a",
  remove_candidate: "#dc2626",
};

type OverviewChartsProps = {
  segments: { segment: string; n: number }[];
  capturesSeries: { day: string; count: number }[];
  scoreBuckets: { bucket: string; count: number }[];
  topOpportunities: {
    fullName: string | null;
    company: string | null;
    businessScore: number;
  }[];
  averages: {
    avgRelationship: number;
    avgBusiness: number;
    avgCleanup: number;
  };
};

export function OverviewCharts({
  segments,
  capturesSeries,
  scoreBuckets,
  topOpportunities,
  averages,
}: OverviewChartsProps) {
  const segmentChart = segments.map((s) => ({
    name: s.segment,
    value: s.n,
    fill: SEGMENT_COLORS[s.segment] ?? "#52525b",
  }));

  const oppChart = topOpportunities.map((o) => ({
    name: (o.fullName ?? "—").slice(0, 18) + (o.fullName && o.fullName.length > 18 ? "…" : ""),
    score: o.businessScore,
  }));

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Contacts by segment" subtitle="Distribution of relationship segments">
          <div className="h-[280px] w-full">
            {segmentChart.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segmentChart}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                    label={({ name, percent }) =>
                      `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {segmentChart.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e4e4e7",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Captures (last 14 days)"
          subtitle="How often you ingested profile data"
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={capturesSeries} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Captures"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Relationship score bands"
          subtitle="Population across recency-style scores"
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreBuckets} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="bucket"
                  width={100}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" name="Contacts" fill="#71717a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Top business scores"
          subtitle="Highest opportunity signal (rule v1)"
        >
          <div className="h-[260px] w-full">
            {oppChart.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={oppChart} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis domain={[0, 100]} width={28} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e4e4e7",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="score" name="Business" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Score averages (network)
        </h3>
        <dl className="mt-3 grid grid-cols-3 gap-4 text-center">
          <div>
            <dt className="text-xs text-zinc-500">Relationship</dt>
            <dd className="text-lg font-semibold tabular-nums">{averages.avgRelationship}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Business</dt>
            <dd className="text-lg font-semibold tabular-nums">{averages.avgBusiness}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Cleanup</dt>
            <dd className="text-lg font-semibold tabular-nums">{averages.avgCleanup}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      No data yet
    </div>
  );
}
