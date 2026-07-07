"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface MeUser {
  email: string;
  balanceCents: number;
  freeUsesRemaining: number;
  isAdmin: boolean;
}

export interface BillingUpdateDetail {
  balanceCents: number;
  freeUsesRemaining: number;
}

const PACKAGES = [500, 2000, 5000]; // ¥5 / ¥20 / ¥50

const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#1e222d",
  border: "1px solid #2a2e39",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  color: "#d1d4dc",
  whiteSpace: "nowrap",
};
const smallBtn: React.CSSProperties = {
  background: "#2962ff",
  color: "#fff",
  border: "none",
  borderRadius: 5,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function AccountWidget() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [priceCents, setPriceCents] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [customYuan, setCustomYuan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setUser(data.user ?? null);
      if (typeof data.pricePerUseCents === "number") setPriceCents(data.pricePerUseCents);
    } catch {
      setUser(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Latest user snapshot for event handlers that must not re-subscribe.
  const userRef = useRef<MeUser | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const onBilling = useCallback((e: Event) => {
    const detail = (e as CustomEvent<BillingUpdateDetail>).detail;
    setUser((prev) => (prev ? { ...prev, ...detail } : prev));
  }, []);
  const onOpenRecharge = useCallback(() => {
    // A 402 can race a session expiry: with no user the modal never renders,
    // so send the visitor to login instead of silently doing nothing.
    if (!userRef.current) {
      window.location.href = "/auth";
      return;
    }
    setShowRecharge(true);
  }, []);
  // Refresh on focus so the balance recovers after Stripe checkout returns
  // or after a charge whose response this tab never saw (aborted request).
  const onFocus = useCallback(() => {
    if (userRef.current) void refresh();
  }, [refresh]);

  useEffect(() => {
    // All setState calls in refresh() happen after an await, so this cannot
    // cascade synchronous renders; the lint rule can't see across the call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    window.addEventListener("zenith:billing-update", onBilling);
    window.addEventListener("zenith:open-recharge", onOpenRecharge);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("zenith:billing-update", onBilling);
      window.removeEventListener("zenith:open-recharge", onOpenRecharge);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, onBilling, onOpenRecharge, onFocus]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  const startCheckout = async (amountCents: number) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "创建支付失败");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  if (!user) {
    return (
      <a href="/auth" style={{ ...smallBtn, textDecoration: "none", display: "inline-block" }}>
        登录 / 注册
      </a>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={chip} title={user.email}>
          💰 ¥{(user.balanceCents / 100).toFixed(2)}
          {user.freeUsesRemaining > 0 && (
            <span style={{ color: "#089981" }}>+{user.freeUsesRemaining}次免费</span>
          )}
        </span>
        <button style={smallBtn} onClick={() => setShowRecharge(true)}>充值</button>
        {user.isAdmin && (
          <a href="/admin" style={{ ...chip, textDecoration: "none", color: "#fbbf24" }}>管理</a>
        )}
        <button style={{ ...chip, cursor: "pointer" }} onClick={logout}>退出</button>
      </div>

      {showRecharge && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowRecharge(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 360, background: "#1e222d", border: "1px solid #2a2e39", borderRadius: 10, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: "#fff", fontSize: 17, marginBottom: 6 }}>余额充值</h3>
            <p style={{ color: "#868993", fontSize: 12, marginBottom: 16 }}>
              当前单价：¥{(priceCents / 100).toFixed(2)}/次 · 通过 Stripe 安全支付
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
              {PACKAGES.map((cents) => (
                <button
                  key={cents}
                  style={{ ...smallBtn, padding: "12px 0", fontSize: 14, opacity: busy ? 0.6 : 1 }}
                  disabled={busy}
                  onClick={() => startCheckout(cents)}
                >
                  ¥{cents / 100}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 1, background: "#131722", border: "1px solid #2a2e39", borderRadius: 6, color: "#d1d4dc", padding: "8px 10px", fontSize: 13 }}
                type="number"
                min={5}
                max={500}
                placeholder="自定义金额（5–500 元）"
                value={customYuan}
                onChange={(e) => setCustomYuan(e.target.value)}
              />
              <button
                style={{ ...smallBtn, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={() => {
                  const yuan = parseFloat(customYuan);
                  if (!Number.isFinite(yuan)) { setError("请输入有效金额"); return; }
                  startCheckout(Math.round(yuan * 100));
                }}
              >
                充值
              </button>
            </div>
            {error && <p style={{ color: "#f23645", fontSize: 12, marginTop: 10 }}>{error}</p>}
            <p style={{ color: "#868993", fontSize: 11, marginTop: 14, textAlign: "center", cursor: "pointer" }} onClick={() => setShowRecharge(false)}>关闭</p>
          </div>
        </div>
      )}
    </>
  );
}
