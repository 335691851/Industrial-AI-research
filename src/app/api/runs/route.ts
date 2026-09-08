import { after } from "next/server";
import { z } from "zod";
import { executeRun, startRun } from "@/server/research";
import { requireWrite, publicError } from "@/server/security";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    requireWrite(request);
    const body = z
      .object({
        mode: z.enum(["incremental", "full"]).default("incremental"),
        resumeId: z
          .string()
          .max(100)
          .regex(/^[a-zA-Z0-9-]+$/)
          .optional(),
      })
      .parse(await request.json());
    const run = await startRun(body.mode, false, body.resumeId);
    after(async () => {
      await executeRun(run.id, run.resume);
    });
    return Response.json(run, { status: 202 });
  } catch (e) {
    return Response.json({ error: publicError(e) }, { status: 400 });
  }
}
