import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import { Flag, Info, PlugZap } from "lucide-react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../server/routers";
import { Chip, DataMount, EmptyState, Panel, Pill } from "./elements";

type Status = inferRouterOutputs<AppRouter>["admin"]["status"];

/**
 * System status, read-only. There is deliberately no control here that changes a source or a flag: going live with a
 * connector is an environment change plus an IT approval record, made outside the app.
 */
export function AdminStatus() {
  const status = trpc.admin.status.useQuery();
  return (
    <div className="space-y-4">
      <p className="callout-dark flex items-start gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span>
          <strong className="font-semibold">Status only.</strong> This screen reports how the server was started and cannot change it. A connector goes live
          through an environment change plus an IT approval record, never from inside the app.
        </span>
      </p>
      <DataMount id="admin-status" query={status} empty={{ icon: PlugZap, title: "No status", sub: "The server returned no status." }} className="space-y-4">
        {data => <StatusPanels data={data} />}
      </DataMount>
    </div>
  );
}

function StatusPanels({ data }: { data: Status }) {
  return (
    <>
      <Panel title="Integration seams" sub="Which implementation each seam uses. Every built implementation works from files or the record and makes no network call.">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Seam</th>
                <th>Setting</th>
                <th>Active implementation</th>
                <th>Mode</th>
                <th>Built</th>
                <th>Reserved, not built</th>
              </tr>
            </thead>
            <tbody>
              {data.seams.map(seam => (
                <tr key={seam.variable}>
                  <td className="font-medium">{seam.label}</td>
                  <td className="whitespace-nowrap">
                    <code className="text-xs">{seam.variable}</code>
                    <p className="text-xs text-ink-muted">{seam.configured ? <>Set to <code>{seam.configured}</code></> : "Not set; default applies"}</p>
                  </td>
                  <td className="max-w-[360px]">
                    {seam.active ? (
                      <>
                        <p className="font-medium"><code>{seam.active}</code></p>
                        {seam.implementation && <p className="text-xs text-ink-muted">{seam.implementation.description} <span className="text-ink-subtle">({seam.implementation.module})</span></p>}
                      </>
                    ) : (
                      <p className="text-xs text-state-blocked-text">{seam.error}</p>
                    )}
                  </td>
                  <td>{seam.active ? <Pill verdict="ready">File mode</Pill> : <Pill verdict="stop">Refused</Pill>}</td>
                  <td><span className="flex flex-wrap gap-1">{seam.built.map(name => <Chip key={name}>{name}</Chip>)}</span></td>
                  <td><span className="flex flex-wrap gap-1">{seam.reserved.length ? seam.reserved.map(name => <Chip key={name}>{name}</Chip>) : <span className="text-ink-subtle">—</span>}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Feature flags" sub="Environment variables read once at startup.">
          {data.featureFlags.length === 0 ? (
            <div className="p-4"><EmptyState icon={Flag} title="No feature flags defined" sub="None exist yet. A new flag is listed here, and in docs/CONFIGURATION.md, in the PR that adds it." /></div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Flag</th><th>Value</th></tr></thead>
              <tbody>
                {data.featureFlags.map(flag => (
                  <tr key={flag.name}>
                    <td><code className="text-xs">{flag.name}</code><p className="text-xs text-ink-muted">{flag.description}</p></td>
                    <td>{flag.value ? <code>{flag.value}</code> : <span className="text-ink-subtle">Not set</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Boundaries" sub="Facts the security review relies on.">
          <dl className="divide-y divide-s100 text-[13px]">
            <Fact label="Outbound network">{data.outbound}</Fact>
            <Fact label="Connector approvals">{data.connectorApprovals}</Fact>
            <Fact label="Sign-in mode">{data.signInMode ? <code>{data.signInMode}</code> : <span className="text-state-blocked-text">Not set: no request is signed in</span>}</Fact>
          </dl>
        </Panel>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 px-4 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
