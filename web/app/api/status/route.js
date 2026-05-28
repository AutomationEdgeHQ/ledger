import { getBranding } from 'thepopebot/branding/config';
import { getStatus } from 'thepopebot/status/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/status
 *
 * Public, no auth. Returns operational metadata for monitoring and future
 * fleet-dashboard scraping. Designed to be safe to expose — no user data,
 * no secrets, no conversation content. Just "is this bot up, what version,
 * what channels are wired."
 */
export async function GET() {
  const branding = getBranding();
  const status = await getStatus(branding);
  return Response.json(status, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
