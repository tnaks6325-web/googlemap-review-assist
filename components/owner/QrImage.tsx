"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrImage({ text, size = 120 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(text, { width: size, margin: 1 })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [text, size]);

  if (!src) {
    return <div style={{ width: size, height: size }} className="rounded bg-canvas" aria-hidden />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="참여 QR" className="rounded" />;
}
