"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface AdminSettings {
  pricePerUseCents: number;
  platformLlm: {
    provider: string;
    baseUrl: string;
    modelName: string;
    apiKeyMasked: string;
    hasApiKey: boolean;
  } | null;
}

interface AdminStats {
  verifiedUsers: number;
  todayAnalyses: number;
  totalTopupCents: number;
}

const box: React.CSSProperties = {
  background: "#1e222d",
  border: "1px solid #2a2e39",
  borderRadius: 8,
  padding: 20,
  marginBottom: 16,
};
const label: React.CSSProperties = { display: "block", fontSize: 13, color: "#868993", marginBottom: 6 };
const input: React.CSSProperties = {
  width: "100%",
  background: "#131722",
  border: "1px solid #2a2e39",
  borderRadius: 6,
  color: "#d1d4dc",
  padding: "8px 10px",
  fontSize: 14,
  marginBottom: 12,
};
const button: React.CSSProperties = {
  background: "#2962ff",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "9px 18px",
  fontSize: 14,
  cursor: "pointer",
};

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [priceYuan, setPriceYuan] = useState("");
  const [provider, setProvider] = useState("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyMasked, setKeyMasked] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) {
      setAuthorized(false);
      return;
    }
    const data = (await res.json()) as AdminSettings;
    setAuthorized(true);
    setPriceYuan((data.pricePerUseCents / 100).toFixed(2));
    if (data.platformLlm) {
      setProvider(data.platformLlm.provider);
      setBaseUrl(data.platformLlm.baseUrl);
      setModelName(data.platformLlm.modelName);
      setKeyMasked(data.platformLlm.apiKeyMasked);
    }
    const statsRes = await fetch("/api/admin/stats");
    if (statsRes.ok) setStats((await statsRes.json()) as AdminStats);
  }, []);

  useEffect(() => {
    load().catch(() => setAuthorized(false));
  }, [load]);

  const savePrice = async () => {
    setBusy(true);
    setMessage("");
    try {
      const cents = Math.round(parseFloat(priceYuan) * 100);
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricePerUseCents: cents }),
      });
      const data = await res.json();
      setMessage(res.ok ? "✅ 单价已更新" : `❌ ${data.error}`);
    } finally {
      setBusy(false);
    }
  };

  const saveLlm = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformLlm: { provider, baseUrl, modelName, apiKey } }),
      });
      const data = await res.json();
      if (res.ok) {
        setApiKey("");
        setMessage("✅ 默认模型已更新");
        await load();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const testLlm = async () => {
    setBusy(true);
    setMessage("⏳ 正在测试模型连通性…");
    try {
      const res = await fetch("/api/admin/test-llm", { method: "POST" });
      const data = await res.json();
      setMessage(res.ok ? `✅ 模型连通正常，返回示例：${data.sample}` : `❌ ${data.error}`);
    } finally {
      setBusy(false);
    }
  };

  if (authorized === null) {
    return <div style={{ minHeight: "100vh", background: "#131722", color: "#868993", padding: 40 }}>加载中…</div>;
  }
  if (!authorized) {
    return (
      <div style={{ minHeight: "100vh", background: "#131722", color: "#d1d4dc", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>无权访问</h1>
        <p style={{ color: "#868993", marginBottom: 20 }}>此页面仅限管理员。请先用管理员账号登录。</p>
        <Link href="/" style={{ color: "#2962ff" }}>返回首页</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#131722", color: "#d1d4dc", padding: "32px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, color: "#fff" }}>管理后台</h1>
          <Link href="/" style={{ color: "#2962ff", fontSize: 14 }}>← 返回首页</Link>
        </div>

        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "已验证用户", value: String(stats.verifiedUsers) },
              { label: "今日分析次数", value: String(stats.todayAnalyses) },
              { label: "累计充值", value: `¥${(stats.totalTopupCents / 100).toFixed(2)}` },
            ].map((s) => (
              <div key={s.label} style={{ ...box, marginBottom: 0, textAlign: "center" }}>
                <div style={{ fontSize: 22, color: "#fff", fontWeight: 600 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#868993", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={box}>
          <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>按次计费单价</h2>
          <label style={label}>每次 AI 分析价格（元）</label>
          <input style={input} type="number" step="0.01" min="0" value={priceYuan} onChange={(e) => setPriceYuan(e.target.value)} />
          <button style={button} onClick={savePrice} disabled={busy}>保存单价</button>
        </div>

        <div style={box}>
          <h2 style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>平台默认大模型</h2>
          <label style={label}>Provider</label>
          <select style={input} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="custom">Custom（OpenAI 兼容中转）</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
          </select>
          <label style={label}>Base URL（官方接口可留空）</label>
          <input style={input} placeholder="https://api.example.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <label style={label}>模型名称</label>
          <input style={input} placeholder="例如 gpt-4o-mini / claude-sonnet-5" value={modelName} onChange={(e) => setModelName(e.target.value)} />
          <label style={label}>API Key{keyMasked ? `（当前：${keyMasked}，留空保持不变）` : ""}</label>
          <input style={input} type="password" placeholder={keyMasked ? "留空表示不修改" : "sk-..."} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <div style={{ display: "flex", gap: 10 }}>
            <button style={button} onClick={saveLlm} disabled={busy}>保存模型配置</button>
            <button style={{ ...button, background: "#2a2e39" }} onClick={testLlm} disabled={busy}>测试连通性</button>
          </div>
        </div>

        {message && (
          <div style={{ ...box, fontSize: 13, wordBreak: "break-all" }}>{message}</div>
        )}
      </div>
    </div>
  );
}
