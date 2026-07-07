import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getPlatformLlmConfig } from "@/lib/billing/settings";
import { generateLLMReport } from "@/lib/analysis/llmProxy";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof NextResponse) return guard;

  const config = await getPlatformLlmConfig();
  if (!config) {
    return NextResponse.json({ error: "尚未配置平台默认模型" }, { status: 400 });
  }
  try {
    const reply = await generateLLMReport(
      '请原样返回以下 JSON，不要添加任何其他内容：{"overview":"ok","recommendation":"ok","technicalAnalysis":"ok"}',
      config,
    );
    return NextResponse.json({ ok: true, sample: reply.slice(0, 200) });
  } catch (err) {
    return NextResponse.json(
      { error: `模型调用失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
