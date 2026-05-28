import { getBranding } from 'thepopebot/branding/config';
import { getStatus } from 'thepopebot/status/config';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const { productName } = getBranding();
  return {
    title: `${productName} status`,
    description: `Operational status for ${productName}`,
  };
}

export default async function StatusPage() {
  const branding = getBranding();
  const status = await getStatus(branding);

  const channelEntries = Object.entries(status.channels);
  const enabledCount = channelEntries.filter(([, on]) => on).length;

  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="flex items-center justify-center gap-3 mb-2">
          {branding.hasCustomLogo ? (
            <img src="/branding/logo" alt={branding.productName} className="h-10 w-auto" />
          ) : (
            <span className="text-2xl font-semibold">{branding.productName}</span>
          )}
        </div>

        {/* Status pill */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm font-medium">All systems operational</span>
          </div>
        </div>

        {/* Detail card */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <Row label="Version" value={status.version} />
          <Row label="Uptime" value={status.uptimeHuman} />
          <Row
            label="Channels"
            value={`${enabledCount} of ${channelEntries.length} configured`}
          />

          <div className="border-t border-border pt-4 space-y-2">
            {channelEntries.map(([name, enabled]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted-foreground">{name}</span>
                <span className={enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'}>
                  {enabled ? '✓ enabled' : '— not configured'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <div>Checked {new Date(status.checkedAt).toLocaleString()}</div>
          {branding.attributionText && (
            <div>
              {branding.attributionUrl ? (
                <a href={branding.attributionUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  {branding.attributionText}
                </a>
              ) : (
                branding.attributionText
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
