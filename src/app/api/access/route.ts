import { workspaceAccess } from "@/server/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = workspaceAccess(request);
  const status = !access.configured ? 503 : access.editable ? 200 : 401;
  return Response.json(
    {
      ...access,
      error: !access.configured
        ? "服务端尚未配置 WORKSPACE_ACCESS_TOKEN。请在当前部署环境中添加后重新部署。"
        : access.editable
          ? undefined
          : "管理口令不正确，请检查后重试。",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
