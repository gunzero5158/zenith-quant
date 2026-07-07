"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
const SLOTS: Record<"top" | "bottom", string> = {
  top: process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP || "",
  bottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM || "",
};

let scriptInjected = false;
function injectAdsenseScript() {
  if (scriptInjected || !ADSENSE_CLIENT) return;
  scriptInjected = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}

// Google AdSense banner. Renders nothing until both the client id and the
// slot id for this position are configured, so the layout has no dead gaps.
export default function AdBanner({ position }: { position: "top" | "bottom" }) {
  const slot = SLOTS[position];
  const pushed = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slot || pushed.current) return;
    pushed.current = true;
    injectAdsenseScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense throws if the slot renders zero-width (e.g. hidden); ignore.
    }
  }, [slot]);

  if (!ADSENSE_CLIENT || !slot) return null;

  return (
    <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: "4px 0", minHeight: 50, overflow: "hidden" }}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
