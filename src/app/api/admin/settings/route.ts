import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getPricePerUseCents, setPricePerUseCents,
  getPlatformLlmConfig, setPlatformLlmConfig,
} from "@/lib/billing/settings";

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof NextResponse) return guard;

  const llm = await getPlatformLlmConfig();
  return NextResponse.json({
    pricePerUseCents: await getPricePerUseCents(),
    platformLlm: llm
      ? {
          provider: llm.provider || "custom",
          baseUrl: llm.baseUrl || "",
          modelName: llm.modelName || "",
          apiKeyMasked: maskKey(llm.apiKey),
        }
      : null,
  });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  if (body.pricePerUseCents !== undefined) {
    const cents = body.pricePerUseCents;
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0 || cents > 10_000) {
      return NextResponse.json({ error: "单价需为 0–10000 分之间的整数" }, { status: 400 });
    }
    await setPricePerUseCents(cents);
  }

  if (body.platformLlm !== undefined) {
    const llm = body.platformLlm;
    if (!llm || typeof llm !== "object") {
      return NextResponse.json({ error: "模型配置格式不正确" }, { status: 400 });
    }
    const provider = typeof llm.provider === "string" ? llm.provider.trim() : "custom";
    const baseUrl = typeof llm.baseUrl === "string" ? llm.baseUrl.trim() : "";
    const modelName = typeof llm.modelName === "string" ? llm.modelName.trim() : "";
    let apiKey = typeof llm.apiKey === "string" ? llm.apiKey.trim() : "";
    if (!modelName) {
      return NextResponse.json({ error: "请填写模型名称" }, { status: 400 });
    }
    if (!apiKey) {
      // Empty key in the form means "keep the current key".
      const existing = await getPlatformLlmConfig();
      if (!existing) {
        return NextResponse.json({ error: "请填写 API Key" }, { status: 400 });
      }
      apiKey = existing.apiKey;
    }
    await setPlatformLlmConfig({ provider, baseUrl, modelName, apiKey });
  }

  return NextResponse.json({ ok: true });
}
