import { executeRun, startRun } from "@/server/research";
import { equalSecret, publicError } from "@/server/security";
import { readDatabase } from "@/server/store";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const run = await startRun("incremental", true);
    if (!run.skipped) await executeRun(run.id, run.resume);
    const result = (await readDatabase()).runs.find((r) => r.id === run.id);
    return Response.json(
      { id: run.id, status: result?.status, skipped: run.skipped },
      { status: result?.status === "failed" ? 500 : 200 },
    );
  } catch (e) {
    return Response.json({ error: publicError(e) }, { status: 503 });
  }
}
