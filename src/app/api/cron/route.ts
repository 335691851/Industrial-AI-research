import { after } from "next/server";
import { executeRun, startRun } from "@/server/research";
import { equalSecret, publicError } from "@/server/security";
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
    if (!run.skipped)
      after(async () => {
        await executeRun(run.id, run.resume);
      });
    return Response.json(
      {
        id: run.id,
        status: run.skipped ? "already-processed" : "accepted",
        skipped: run.skipped,
      },
      { status: run.skipped ? 200 : 202 },
    );
  } catch (e) {
    return Response.json({ error: publicError(e) }, { status: 503 });
  }
}
