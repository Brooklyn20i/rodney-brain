// Vercel serverless probe: liveness + deploy provenance.
//
// Public by design: no auth, no PII, no database access. This lets uptime
// monitors and the rollback runbook answer: "which deploy is live?"

type HealthResponse = {
  ok: true;
  commit: string;
  ref: string | null;
  env: string;
  region: string | null;
  deploymentId: string | null;
};

type VercelResponse = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: HealthResponse) => void };
};

export default function handler(_req: unknown, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? 'development',
    region: process.env.VERCEL_REGION ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  });
}
