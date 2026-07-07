"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register" | "verify";

const input: React.CSSProperties = {
  width: "100%",
  background: "#131722",
  border: "1px solid #2a2e39",
  borderRadius: 6,
  color: "#d1d4dc",
  padding: "10px 12px",
  fontSize: 14,
  marginBottom: 12,
};
const button: React.CSSProperties = {
  width: "100%",
  background: "#2962ff",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "11px 0",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
const switchLink: React.CSSProperties = {
  color: "#2962ff",
  cursor: "pointer",
  fontSize: 13,
};

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async (url: string, body: object) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };

  const handleLogin = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { ok, data } = await post("/api/auth/login", { email, password });
      if (ok) {
        router.push("/");
        return;
      }
      if (data.needVerify) {
        setMessage("该邮箱尚未验证，请先注册获取验证码完成验证");
        setMode("register");
      } else {
        setMessage(data.error || "登录失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { ok, data } = await post("/api/auth/register", { email, password });
      if (ok) {
        setMode("verify");
        setMessage(data.devCode ? `开发模式验证码：${data.devCode}` : "验证码已发送至邮箱，请查收（10 分钟内有效）");
      } else {
        setMessage(data.error || "注册失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { ok, data } = await post("/api/auth/verify", { email, code });
      if (ok) {
        router.push("/");
        return;
      }
      setMessage(data.error || "验证失败");
    } finally {
      setBusy(false);
    }
  };

  const submit = mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleVerify;

  return (
    <div style={{ minHeight: "100vh", background: "#131722", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#1e222d", border: "1px solid #2a2e39", borderRadius: 10, padding: 28 }}>
        <h1 style={{ color: "#fff", fontSize: 20, textAlign: "center", marginBottom: 4 }}>Zenith Quant</h1>
        <p style={{ color: "#868993", fontSize: 13, textAlign: "center", marginBottom: 22 }}>
          {mode === "login" ? "登录账号" : mode === "register" ? "注册新账号（送 2 次免费 AI 分析）" : "输入邮箱验证码"}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submit();
          }}
        >
          <input style={input} type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={mode === "verify"} />
          {mode !== "verify" && (
            <input style={input} type="password" placeholder={mode === "register" ? "密码（至少 8 位）" : "密码"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          )}
          {mode === "verify" && (
            <input style={{ ...input, letterSpacing: 6, textAlign: "center", fontSize: 18 }} inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="6 位验证码" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
          )}
          <button style={{ ...button, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
            {busy ? "请稍候…" : mode === "login" ? "登录" : mode === "register" ? "发送验证码" : "完成验证"}
          </button>
        </form>

        {message && <p style={{ color: "#fbbf24", fontSize: 13, marginTop: 14, wordBreak: "break-all" }}>{message}</p>}

        <div style={{ marginTop: 18, textAlign: "center" }}>
          {mode === "login" && (
            <span style={switchLink} onClick={() => { setMode("register"); setMessage(""); }}>没有账号？注册</span>
          )}
          {mode === "register" && (
            <span style={switchLink} onClick={() => { setMode("login"); setMessage(""); }}>已有账号？登录</span>
          )}
          {mode === "verify" && (
            <span style={switchLink} onClick={() => { setMode("register"); setMessage(""); }}>重新发送验证码</span>
          )}
        </div>
      </div>
    </div>
  );
}
