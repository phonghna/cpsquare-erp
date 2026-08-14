"use client";

import { useEffect, useRef, useState } from "react";

// USB/Bluetooth barcode scan guns behave like a keyboard: they "type" the
// scanned digits very fast and finish with an Enter keystroke. So all we
// need for gun support is a normal, auto-focused text input that submits on
// Enter — no special hardware API required.
//
// For an actual device camera, we decode barcodes/QR codes live from the
// video stream using ZXing (loaded lazily so the ~zxing bundle is only
// fetched if someone actually opens the camera).

export function ImeiScanField({
  onScan,
  disabled,
  placeholder = "Scan with a scan gun or type IMEI...",
  dark = true,
}: {
  onScan: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  dark?: boolean;
}) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  function submit() {
    const v = value.trim();
    if (!v) return;
    onScan(v);
    setValue("");
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
        }}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className="mono"
        style={{
          flex: 1,
          minWidth: 160,
          padding: "8px 10px",
          borderRadius: 8,
          fontSize: 13,
          border: dark ? "1px solid rgba(255,255,255,0.25)" : "1px solid var(--border)",
          background: dark ? "rgba(255,255,255,0.08)" : "#fff",
          color: dark ? "#fff" : "var(--text)",
        }}
      />
      <button
        type="button"
        onClick={() => setCameraOpen(true)}
        disabled={disabled}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "none",
          background: "var(--info)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          cursor: disabled ? "default" : "pointer",
          whiteSpace: "nowrap",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        📷 Camera
      </button>
      {cameraOpen && (
        <CameraScanModal
          onDetect={(text) => { onScan(text); setCameraOpen(false); }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

function CameraScanModal({ onDetect, onClose }: { onDetect: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  // Start with the rear/back camera by default — the front-facing camera
  // (what a laptop or phone selfie cam defaults to) can't usefully read a
  // barcode on a box in front of the user. Once real device labels come
  // back from the browser we let the picker below override this.
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | null = null;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();

        const onResult = (result: any) => {
          if (result && !cancelled) onDetect(result.getText());
        };

        let c;
        if (deviceId) {
          c = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, onResult);
        } else {
          // Ask for the back camera explicitly via facingMode — on desktop
          // browsers without a rear camera this constraint is just ignored.
          c = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: facingMode } } },
            videoRef.current!,
            onResult
          );
        }
        if (cancelled) { c.stop(); return; }
        controls = c;

        // Now that we have camera permission, list real devices so the user
        // can manually switch camera if the guessed one is still wrong.
        try {
          const list = await BrowserMultiFormatReader.listVideoInputDevices();
          if (!cancelled) setDevices(list);
        } catch { /* device enumeration is a nice-to-have, ignore failures */ }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Couldn't access the camera. Please grant camera permission to the browser.");
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onDetect, deviceId, facingMode]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 16, width: 380, maxWidth: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div className="disp" style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Scan IMEI via camera</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "var(--text-dim)" }}>✕</button>
        </div>
        {error ? (
          <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>
        ) : (
          <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 8, background: "#000", display: "block" }} />
        )}
        {!error && devices.length > 1 && (
          <select
            value={deviceId || ""}
            onChange={(e) => setDeviceId(e.target.value || undefined)}
            style={{ width: "100%", marginTop: 8, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12 }}
          >
            <option value="">Auto-select rear camera</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</option>
            ))}
          </select>
        )}
        {!error && !deviceId && (
          <button
            type="button"
            onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
            style={{ width: "100%", marginTop: 8, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "#fff", fontSize: 12, cursor: "pointer" }}
          >
            🔄 Switch camera (currently using: {facingMode === "environment" ? "rear camera" : "front camera"})
          </button>
        )}
        <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
          Point the camera at the barcode/QR containing the IMEI on the device box or label, holding it about 10-15cm away for focus. The browser will ask for camera permission.
        </div>
      </div>
    </div>
  );
}
