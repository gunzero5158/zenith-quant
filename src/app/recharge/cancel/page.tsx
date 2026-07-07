import Link from "next/link";

export default function RechargeCancelPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#131722", color: "#d1d4dc", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>↩️</div>
        <h1 style={{ fontSize: 24, marginBottom: 8, color: "#fff" }}>已取消支付</h1>
        <p style={{ color: "#868993", marginBottom: 24 }}>没有产生任何扣款，随时可以重新充值。</p>
        <Link href="/" style={{ color: "#2962ff", textDecoration: "underline" }}>返回首页</Link>
      </div>
    </div>
  );
}
