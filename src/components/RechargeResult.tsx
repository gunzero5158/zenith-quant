import Link from "next/link";

export default function RechargeResult({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "#131722", color: "#d1d4dc", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
        <h1 style={{ fontSize: 24, marginBottom: 8, color: "#fff" }}>{title}</h1>
        <p style={{ color: "#868993", marginBottom: 24 }}>{subtitle}</p>
        <Link href="/" style={{ color: "#2962ff", textDecoration: "underline" }}>返回首页</Link>
      </div>
    </div>
  );
}
