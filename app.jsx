import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { badgeVariants } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight } from 'lucide-react';

const formatter = new Intl.NumberFormat('en-GB');
const dateClock = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
function WorkTime({ item }) {
  if (!Number.isFinite(item.startedAt)) return null;
  const start = new Date(item.startedAt);
  const end = new Date(item.endedAt);
  const label = !Number.isFinite(item.endedAt) || end < start ? dateClock.format(start)
    : dateClock.formatRange(start, end);
  return <span className="mt-1 block text-xs font-normal text-muted-foreground">{label}</span>;
}
const number = (value) => Number.isFinite(value) ? formatter.format(value) : '–';
const duration = (item) => {
  if (item.workSeconds === null) return item.minutes == null ? '–' : `${number(item.minutes)} min to acceptance`;
  const minutes = Math.floor(item.workSeconds / 60);
  const seconds = item.workSeconds% 60;
  return minutes ? `${number(minutes)} min ${number(seconds)} sec` : `${number(seconds)} sec`;
};
const stepTypes = { implementation: 'Implementation', feedback: 'Feedback', handoff: 'Handoff' };
const epicColors = [
  'border-sky-400/30 bg-sky-400/10 text-sky-300',
  'border-violet-400/30 bg-violet-400/10 text-violet-300',
  'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  'border-amber-400/30 bg-amber-400/10 text-amber-300',
  'border-rose-400/30 bg-rose-400/10 text-rose-300',
];

function EpicTag({ epic }) {
  if (!epic) return null;
  const hash = Array.from(epic).reduce((value, char) => (Math.imul(value, 31) + char.codePointAt(0)) >>> 0, 0);
  return <span className={badgeVariants({ variant: 'outline', className: epicColors[hash % epicColors.length] })}>{epic}</span>;
}

const scoreBand = score => !Number.isFinite(score) ? 3 : score >= 110 ? 0 : score >= 90 ? 1 : 2;

function EfficiencyBadge({ score, labels }) {
  if (!Number.isFinite(score)) return null;
  const rating = [
    { label: labels[0], color: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
    { label: 'Typical', color: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
    { label: labels[1], color: 'border-rose-400/30 bg-rose-400/10 text-rose-300' },
  ][scoreBand(score)];
  return <span className="mt-1 block"><span className={badgeVariants({ variant: 'outline', className: rating.color + ' tabular-nums' })}
    title="Whole-ticket score. 100 represents the median for the same story-point estimate. Higher is better.">
    {number(score)} · {rating.label}
  </span></span>;
}

function TokenCount({ item }) {
  const readQuota = (entry) => Number.isFinite(entry.quotaUsed) ? entry.quotaUsed
    : Number.isFinite(entry.quota?.after) && Number.isFinite(entry.quota?.before) ? entry.quota.after - entry.quota.before : null;
  const parts = item.subtasks?.map(readQuota).filter((value) => value !== null) ?? [];
  const ownQuota = readQuota(item);
  const quota = ownQuota ?? (parts.length ? parts.reduce((sum, value) => sum + value, 0) : null);
  const partial = item.partialQuota || (ownQuota === null && parts.length > 0 && parts.length < item.subtasks.length);
  return <>{number(item.tokens)} {item.partialUsage &&
    <span className="text-muted-foreground">· partially measured</span>}
    {quota !== null && <span className="block text-xs text-muted-foreground">
      <span className="underline decoration-dotted underline-offset-2"
        title="Measured usage of the 5-hour quota"
        aria-label={`${number(quota)} percent of the 5-hour quota used`}>{number(quota)}%</span>
      {partial && ' · partially measured'}</span>}
  </>;
}

function PackageField({ label, children, className = '' }) {
  return <span className={`grid min-w-0 content-start gap-1 ${className}`}><span className="text-xs text-muted-foreground">{label}</span><span>{children}</span></span>;
}

const rowLayout = 'grid w-full grid-cols-1 items-start gap-x-4 gap-y-3 whitespace-normal break-words rounded-md p-3.5 pe-10 text-left text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]';
const ticketRow = rowLayout + ' relative bg-muted/60';
const fieldLayout = 'grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4';

function PackageItem({ item, windowItem }) {
  const expandable = item.subtasks.length > 1;
  const windowRuns = windowItem && new Set(windowItem.subtasks.map(step => step.key));
  const fields = <>
    <span className="min-w-0 font-semibold">
      {item.name}<WorkTime item={item}/>
      {windowItem && <span className="mt-1 block text-xs font-normal text-muted-foreground">
        This window · {windowItem.subtasks.length}/{item.subtasks.length} runs · {number(windowItem.tokens)} tokens · {duration(windowItem)}
      </span>}
      {item.epic && <span className="mt-1.5 block"><EpicTag epic={item.epic}/></span>}
    </span>
    <span className={fieldLayout + ' font-normal'}>
      <PackageField label="Story points">{number(item.points)}</PackageField>
      <PackageField label="Tokens"><TokenCount item={item}/>
        <EfficiencyBadge score={item.tokenScore} labels={['Low usage', 'High usage']}/>
      </PackageField>
      <PackageField label="Work time">{duration(item)}
        <EfficiencyBadge score={item.timeScore} labels={['Fast', 'Slow']}/>
      </PackageField>
      <PackageField label="Rework rounds">{number(item.correctionRounds)}</PackageField>
    </span>
  </>;
  return <li className="min-w-0">{expandable ? <Collapsible>
    <CollapsibleTrigger asChild><Button variant="ghost" className={ticketRow + ' group h-auto'}>
      {fields}
      <ChevronRight aria-hidden="true" className="absolute end-3.5 top-1/2 size-4 -translate-y-1/2 group-data-[state=open]:rotate-90"/>
    </Button></CollapsibleTrigger>
    <CollapsibleContent asChild><ul className="space-y-1.5 pt-1.5" aria-label="Subtasks">
      {item.subtasks.map((step) => <li key={step.key} className={rowLayout + ' bg-muted/40'}>
        <span className="min-w-0 ps-4 font-medium"><span className="text-muted-foreground">{stepTypes[step.kind]} · </span>{step.name}<WorkTime item={step}/>
          {windowRuns && <span className="mt-1 block text-xs font-normal text-muted-foreground">{windowRuns.has(step.key) ? 'This window' : 'Outside this window'}</span>}
        </span>
        <span className={fieldLayout}>
          <PackageField label="Tokens" className="col-start-2 row-start-1"><TokenCount item={step}/></PackageField>
          <PackageField label="Work time" className="col-start-1 row-start-2 sm:col-start-3 sm:row-start-1">{duration(step)}</PackageField>
        </span>
      </li>)}
    </ul></CollapsibleContent>
  </Collapsible> : <div className={ticketRow}>{fields}</div>}</li>;
}

function Metric({ title, value, detail }) {
  return <Card>
    <CardHeader className="p-4 sm:p-6">
      <CardTitle className="text-sm">{title}</CardTitle>
      <strong className="block break-words text-3xl">{typeof value === 'string' ? value : number(value)}</strong>
      <CardDescription>{detail}</CardDescription>
    </CardHeader>
  </Card>;
}

const chartMetrics = {
  tickets: { label: 'Tickets', read: () => 1, format: number },
  points: { label: 'Story points', read: item => item.points, format: number },
  tokens: { label: 'Recorded tokens', read: item => item.tokens, format: number },
  time: { label: 'Work time', read: item => item.workSeconds, format: workSeconds => duration({ workSeconds }) },
};

function ScoreDistribution({ items, field, title, labels }) {
  const counts = [0, 0, 0, 0];
  items.forEach(item => counts[scoreBand(item[field])]++);
  const colours = ['bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-muted-foreground/40'];
  return <div className="min-w-0 space-y-2">
    <h4 className="text-sm font-semibold">{title}</h4>
    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {counts.map((count, index) => count > 0 &&
        <span key={index} className={colours[index]} style={{ width: `${100 * count / items.length}%` }}/>)}
    </div>
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {[labels[0], 'Typical', labels[1], 'Unscored'].map((label, index) => <li key={label} className="flex items-center gap-1.5">
        <span className={`size-2 shrink-0 rounded-full ${colours[index]}`} aria-hidden="true"/>{label} {number(counts[index])}
      </li>)}
    </ul>
  </div>;
}

function TicketOverview({ items }) {
  const [metric, setMetric] = useState('tokens');
  const { label, read, format } = chartMetrics[metric];
  const byEpic = new Map();
  for (const item of items) {
    const epic = item.epic || 'No epic';
    if (!byEpic.has(epic)) byEpic.set(epic, { epic, total: 0, measured: 0, tickets: 0 });
    const group = byEpic.get(epic);
    group.tickets++;
    const value = read(item);
    if (Number.isFinite(value)) {
      group.total += value;
      if (metric !== 'tokens' || !item.partialUsage) group.measured++;
    }
  }
  const groups = [...byEpic.values()].sort((a, b) => b.total - a.total || a.epic.localeCompare(b.epic, 'en-GB'));
  const max = Math.max(1, ...groups.map(group => group.total));
  return <Card>
    <CardHeader className="p-4 sm:p-6">
      <CardTitle>Ticket overview</CardTitle>
      <CardDescription>Compare epics and see how tickets score on tokens and work time. Each ticket counts once in the selected scope.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-6 px-4 sm:px-6 lg:grid-cols-[3fr_2fr]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Effort by epic</h3>
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger aria-label="Chart metric" className="w-40"><SelectValue/></SelectTrigger>
            <SelectContent>{Object.entries(chartMetrics).map(([key, option]) =>
              <SelectItem key={key} value={key}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <ul className="space-y-3" aria-label={label + ' by epic'}>
          {groups.map(group => <li key={group.epic} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <span className="min-w-0 break-words">{group.epic}</span>
              <span className="tabular-nums">{group.measured || group.total ? format(group.total) : '–'}
                {group.measured < group.tickets && <span className="text-xs text-muted-foreground"> · {group.measured}/{group.tickets} complete</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary/80" style={{ width: `${100 * group.total / max}%` }}/>
            </div>
          </li>)}
        </ul>
      </div>
      <div className="min-w-0 space-y-4">
        <h3 className="text-sm font-semibold">Score distribution</h3>
        <ScoreDistribution items={items} field="tokenScore" title="Token usage" labels={['Low usage', 'High usage']}/>
        <ScoreDistribution items={items} field="timeScore" title="Work time" labels={['Fast', 'Slow']}/>
      </div>
    </CardContent>
  </Card>;
}

const coveragePercent = (part, total) => `${number(Math.round(100 * part / total))}%`;

const contextBands = [0, 25, 50, 75];
const contextMetrics = {
  tokens: { label: 'Tokens', read: item => item.partialUsage ? null : item.tokens, format: number },
  time: chartMetrics.time,
  rework: { label: 'Rework rounds', read: item => item.correctionRounds, format: number },
};

function contextBandStats(items, read) {
  return contextBands.map((lower, index) => {
    const upper = contextBands[index + 1] ?? Infinity;
    const values = items.filter(item => item.startContext.percent >= lower && item.startContext.percent < upper)
      .map(read).filter(Number.isFinite).sort((a, b) => a - b);
    const median = values.length ? (values[Math.floor(values.length / 2)] + values[Math.floor((values.length - 1) / 2)]) / 2 : null;
    return { lower, upper, count: values.length, median };
  });
}

function ContextOverview({ items }) {
  const [metric, setMetric] = useState('tokens');
  const [selected, setSelected] = useState('');
  const cohorts = new Map();
  for (const item of items) {
    if (!item.completed || !item.startContext || !Number.isFinite(item.points)) continue;
    const id = JSON.stringify([item.points, item.startContext.model]);
    if (!cohorts.has(id)) cohorts.set(id, { id, label: `${item.points} SP · ${item.startContext.model}`, items: [] });
    cohorts.get(id).items.push(item);
  }
  const options = [...cohorts.values()].sort((a, b) => b.items.length - a.items.length);
  const cohort = cohorts.get(selected) ?? options[0];
  const { label, read, format } = contextMetrics[metric];
  const points = (cohort?.items ?? []).flatMap(item => Number.isFinite(read(item)) ? [{ item, value: read(item) }] : []);
  const maxX = Math.max(100, ...points.map(({ item }) => item.startContext.percent));
  const maxY = Math.max(1, ...points.map(({ value }) => value));
  const bands = contextBandStats(cohort?.items ?? [], read);
  const [baseline, ...higher] = contextBandStats(cohort?.items ?? [], contextMetrics.tokens.read);
  const isElevated = band => band.count >= 3 && band.median >= 1.25 * baseline.median;
  const signal = baseline.count >= 3 && baseline.median > 0
    ? higher.find((band, index) => higher[index + 1] && isElevated(band) && isElevated(higher[index + 1]))
    : null;
  return <Card>
    <CardHeader className="p-4 sm:p-6">
      <CardTitle>Chat context and effort</CardTitle>
      <CardDescription>Estimated context at the first recorded request for each ticket, compared within the same starting model and story-point estimate.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4 px-4 sm:px-6">
      {cohort ? <>
        <div className="flex flex-wrap gap-2">
          <Select value={cohort.id} onValueChange={setSelected}>
            <SelectTrigger aria-label="Context comparison group" className="w-56 max-w-full"><SelectValue/></SelectTrigger>
            <SelectContent>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.label} ({number(option.items.length)})</SelectItem>)}</SelectContent>
          </Select>
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger aria-label="Context outcome" className="w-40"><SelectValue/></SelectTrigger>
            <SelectContent>{Object.entries(contextMetrics).map(([id, option]) =>
              <SelectItem key={id} value={id}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{signal
          ? `Consider a fresh chat at ${signal.lower}% context for this group. Median token usage was at least 25% higher in two adjacent bands.`
          : 'No chat-switch threshold established for this group yet.'}</p>
        {points.length > 0 && <figure className="space-y-1">
          <figcaption className="text-xs text-muted-foreground">{label} by estimated starting context · {number(points.length)} tickets with data · vertical scale 0 to {format(maxY)}</figcaption>
          <svg viewBox="0 0 480 155" className="w-full text-muted-foreground" role="img" aria-label={label + ' by estimated starting context'}>
            <path d="M12 12V132H468" fill="none" stroke="currentColor" opacity=".55"/>
            {[0, 25, 50, 75, maxX].map(tick => {
              const x = 12 + 456 * tick / maxX;
              return <g key={tick}><path d={`M${x} 12V132`} stroke="currentColor" opacity=".2"/>
                <text x={x} y="150" fill="currentColor" fontSize="11" textAnchor={tick === 0 ? 'start' : tick === maxX ? 'end' : 'middle'}>{number(tick)}%</text></g>;
            })}
            {points.map(({ item, value }) => <circle key={item.id} r="4" className="fill-primary/80"
              cx={12 + 456 * item.startContext.percent / maxX} cy={132 - 120 * value / maxY}>
              <title>{item.name} · {number(Math.round(item.startContext.percent))}% context · {format(value)}</title>
            </circle>)}
          </svg>
        </figure>}
        <ul aria-label="Median effort by starting context band" className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {bands.map(({ lower, upper, count, median }) => <li key={lower} className="rounded-md bg-muted/60 p-2.5">
            <strong className="block">{Number.isFinite(upper) ? `${lower}–<${upper}%` : `${lower}%+`}</strong>
            <span className="block text-muted-foreground">{count ? `Median ${format(median)}` : 'No measurements'} · {number(count)} {count === 1 ? 'ticket' : 'tickets'}</span>
          </li>)}
        </ul>
      </> : <p className="text-sm text-muted-foreground">No completed tickets with starting context measurements in this scope.</p>}
    </CardContent>
  </Card>;
}

function WindowQuotaBar({ coverage }) {
  const segments = [
    { label: 'Assigned to tickets', value: coverage.assigned, colour: 'bg-emerald-400' },
    { label: 'Measured without a ticket', value: coverage.unassigned, colour: 'bg-amber-400' },
    { label: 'Unexplained usage', value: coverage.unexplained, colour: 'bg-muted-foreground/50' },
    { label: 'Unused at snapshot', value: coverage.unused, colour: 'bg-sky-400/40' },
  ].filter(({ value }) => value > 0);
  return <div className="relative mb-3 flex h-3 rounded-full bg-muted" role="group" aria-label="Quota breakdown for this window">
    {segments.map(({ label, value, colour }) => {
      const detail = `${label} · ${number(value)}% of this window’s quota`;
      return <span key={label} tabIndex={0} role="img" aria-label={detail}
        className={`group/quota h-full first:rounded-s-full last:rounded-e-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${colour}`}
        style={{ width: `${value}%` }}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-2 hidden justify-center px-2 group-hover/quota:flex group-focus-visible/quota:flex">
          <span className="rounded-md border border-border bg-popover px-2.5 py-1 text-center text-xs text-popover-foreground shadow-md">{detail}</span>
        </span>
      </span>;
    })}
  </div>;
}

function QuotaCoverage({ coverage }) {
  const measured = coverage?.windows > 0 && Number.isFinite(coverage.unused);
  return <Card>
    <CardHeader className="p-4 sm:p-6">
      <CardTitle>Quota attribution coverage</CardTitle>
      <CardDescription>Coverage uses observed usage across all epics. The quota breakdown is shown in each measured window below.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3 px-4 sm:px-6">
      {measured ? <>
        <p className="text-sm text-muted-foreground">{coverage.observed > 0 ? <>
          <strong className="text-xl text-foreground">{coveragePercent(coverage.assigned, coverage.observed)}</strong>
          {' '}of observed usage assigned</> : 'No usage observed'}
          {' across '}{number(coverage.windows)} measured {coverage.windows === 1 ? 'window' : 'windows'}</p>
      </> : <p className="text-sm text-muted-foreground">No comparable account usage snapshots are available.</p>}
      {coverage?.inconsistent > 0 && <p className="text-sm text-amber-300">
        {number(coverage.inconsistent)} {coverage.inconsistent === 1 ? 'window excluded' : 'windows excluded'} because the quota measurements do not reconcile.
      </p>}
    </CardContent>
  </Card>;
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('all');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      setLoading(true);
      setError('');
      try {
        const query = scope === 'all' ? '' : '?' + new URLSearchParams({ epic: scope === 'none' ? '' : scope.slice(5) });
        const response = await fetch('/api/analytics' + query, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    refresh();
    return () => controller.abort();
  }, [scope, revision]);

  const wholeTickets = new Map(data?.items.map(item => [item.id, item]));
  const completed = data?.items.filter((item) => item.completed).length ?? 0;
  const timed = data?.items.filter((item) => item.workSeconds !== null) ?? [];
  const workSeconds = timed.length ? timed.reduce((sum, item) => sum + item.workSeconds, 0) : null;
  return <main className="mx-auto max-w-[76rem] space-y-4 p-4 md:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-xs tracking-widest text-muted-foreground">CONTEXT STARTER / LOCAL TELEMETRY</p>
        <h1 className="my-2 text-3xl font-semibold md:text-4xl">AI Analytics</h1>
        <p className="text-muted-foreground">Token usage and effort per ticket.</p>
      </div>
      <Button variant="outline" disabled={loading} onClick={() => setRevision(revision + 1)}>Refresh</Button>
    </header>

    <p className="break-words text-sm text-muted-foreground" role="status">{loading ? 'Loading metrics…' : data?.project}</p>
    {error && <p className="break-words rounded-md border border-border p-3 text-sm" role="alert">Could not load analytics. {error}</p>}
    {data && <>
      <div className="flex items-center gap-3 text-sm">
        <label htmlFor="epic-filter">Epic</label>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger id="epic-filter" className="w-52 min-w-0"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All epics</SelectItem>
            <SelectItem value="none">No epic</SelectItem>
            {data.epics.map((epic) => <SelectItem key={epic} value={'epic:' + epic}>{epic}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!data.hasLog && <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Usage data will appear here once the telemetry hook records it.</p>}
      {data.skipped > 0 && <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">{number(data.skipped)} invalid log entries skipped. Token scores are unavailable until the log is fixed.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Recorded tokens" value={data.tokens} detail={`${number(data.measured)} of ${number(data.attempts)} attempts with token counts`} />
        <Metric title="Model attempts" value={data.attempts} detail={scope === 'all' ? 'All readable log entries' : 'Linked log entries'} />
        <Metric title="Work time" value={duration({ workSeconds })} detail={`Recorded for ${number(timed.length)} of ${number(data.items.length)} tickets`} />
        <Metric title="Completed tickets" value={completed} detail={`Of ${number(data.items.length)} recorded tickets`} />
      </div>

      {data.items.length > 0 && <TicketOverview items={data.items}/>}
      <ContextOverview items={data.items}/>
      <QuotaCoverage coverage={data.coverage}/>

      <Card>
        <CardHeader className="p-4 sm:p-6"><CardTitle>Tickets</CardTitle>
          <CardDescription>Each 5-hour window shows measured usage for the runs listed in it. Tickets that span windows are split by run.</CardDescription>
          <CardDescription>Rows show whole-ticket totals and scores. When a ticket spans multiple windows, its contribution to this window is listed separately. Scores compare tickets with the same story-point estimate.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
        {data.items.length ? <div className="space-y-6">
          {(data.quotaWindows ?? [{resetsAt: null, items: data.items}]).map(({resetsAt, items, coverage}) => <section key={resetsAt ?? 'unknown'}>
              <h3 className="pb-3 text-sm font-semibold">{resetsAt === null ? 'No matching 5-hour window'
                : <>5-hour window · {new Intl.DateTimeFormat('en-GB', {
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                }).formatRange(new Date((resetsAt - 18000) * 1000), new Date(resetsAt * 1000))}</>}</h3>
            {coverage && <p className="pb-3 text-sm text-muted-foreground">
              Account · {number(coverage.observed)}% observed
              {coverage.inconsistent ? ' · Coverage unavailable because the quota measurements do not reconcile.'
                : coverage.observed > 0 && <> · <strong className="font-medium text-foreground">{coveragePercent(coverage.assigned, coverage.observed)} assigned</strong>
                  {' '}({number(coverage.assigned)} pp)
                  {' · '}{number(coverage.unassigned)} pp without a ticket
                  {coverage.runs > 0 && ` across ${number(coverage.runs)} runs`}
                  {' · '}{number(coverage.unexplained)} pp unexplained</>}
              {Number.isFinite(coverage.unused) && <> · {number(coverage.unused)} pp unused at snapshot</>}
            </p>}
            {coverage && !coverage.inconsistent && Number.isFinite(coverage.unused) && <WindowQuotaBar coverage={coverage}/>}
            <ul className="space-y-1.5">
              {items.map(item => <PackageItem key={item.id} item={wholeTickets.get(item.id) ?? item}
                windowItem={item.partialWindow ? item : null}/>)}
            </ul>
          </section>)}
        </div> : <p className="break-words text-sm text-muted-foreground">{scope === 'all'
          ? <>Add a ticket to <code>.codex/context-packages.json</code> to see it here.</>
          : 'No tickets match this filter.'}</p>}
        </CardContent>
      </Card>
    </>}
  </main>;
}

createRoot(document.getElementById('root')).render(<Dashboard />);
