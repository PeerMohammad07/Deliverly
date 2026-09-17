import { useState } from "react";

interface StorefrontPreviewProps {
  previewAvailable: boolean;
  prefix: string;
  etaCore: string;
  suffixSpace: string;
  suffix: string;
}

export function StorefrontPreview({
  previewAvailable,
  prefix,
  etaCore,
  suffixSpace,
  suffix,
}: StorefrontPreviewProps) {
  const [imageAvailable, setImageAvailable] = useState(true);

  return (
    <div style={{ position: "sticky", top: "16px" }}>
      <s-stack direction="block" gap="base">
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e7e5e4",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              padding: "14px 18px 12px",
              borderBottom: "1px solid #edebe8",
            }}
          >
            <div
              style={{
                fontSize: "17px",
                fontWeight: 600,
                lineHeight: "24px",
                color: "#1a1a1a",
              }}
            >
              Preview
            </div>
          </div>

          <div style={{ padding: "18px" }}>
            <div
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                background: "#ffffff",
              }}
            >
              {imageAvailable ? (
                <img
                  src="/preview-chair.jpg"
                  alt="Example product"
                  style={{
                    width: "100%",
                    height: "120px",
                    objectFit: "contain",
                    display: "block",
                  }}
                  onError={() => setImageAvailable(false)}
                />
              ) : (
                <svg
                  width="110"
                  height="110"
                  viewBox="0 0 150 150"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="30"
                    y="52"
                    width="20"
                    height="36"
                    rx="10"
                    fill="#b4bac5"
                  />
                  <rect
                    x="100"
                    y="52"
                    width="20"
                    height="36"
                    rx="10"
                    fill="#b4bac5"
                  />
                  <rect
                    x="46"
                    y="16"
                    width="58"
                    height="54"
                    rx="15"
                    fill="#c6ccd5"
                  />
                  <rect
                    x="55"
                    y="26"
                    width="40"
                    height="32"
                    rx="10"
                    fill="#d4d9e1"
                  />
                  <rect
                    x="46"
                    y="66"
                    width="58"
                    height="16"
                    rx="8"
                    fill="#d8dce3"
                  />
                  <g stroke="#c69a63" strokeWidth="5" strokeLinecap="round">
                    <line x1="56" y1="82" x2="48" y2="128" />
                    <line x1="68" y1="82" x2="65" y2="128" />
                    <line x1="82" y1="82" x2="85" y2="128" />
                    <line x1="94" y1="82" x2="102" y2="128" />
                  </g>
                </svg>
              )}
              <span
                style={{
                  position: "absolute",
                  top: "0",
                  right: "0",
                  background: "#f1f1f3",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1a1a1a",
                }}
              >
                15% off
              </span>
            </div>

            <div
              style={{
                marginTop: "14px",
                border: "1px solid #e3e1de",
                borderRadius: "12px",
                padding: "10px",
                textAlign: "center",
                fontSize: "14px",
                fontWeight: 500,
                color: "#1a1a1a",
                background: "#ffffff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              Add To Cart
            </div>

            <div
              style={{
                marginTop: "10px",
                border: "2px solid #111111",
                padding: "14px 16px",
                fontSize: "17px",
                lineHeight: "26px",
                fontWeight: 500,
                letterSpacing: "-0.01em",
                color: "#111111",
                background: "#ffffff",
              }}
            >
              {previewAvailable ? (
                <>
                  {prefix.trim() ? `${prefix.trim()} ` : ""}
                  <span style={{ fontWeight: 700 }}>{etaCore}</span>
                  {suffixSpace}
                  {suffix}
                </>
              ) : (
                "Estimated delivery between —"
              )}
            </div>
          </div>
        </div>

        <s-section heading="Tips">
          <s-stack direction="block" gap="small-200">
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  paddingTop: "2px",
                }}
              >
                <s-icon type="lightbulb" size="small" />
              </span>
              <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                <s-paragraph color="subdued">
                  Keep ranges tight (3–5 days) to build trust.
                </s-paragraph>
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  paddingTop: "2px",
                }}
              >
                <s-icon type="lightbulb" size="small" />
              </span>
              <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                <s-paragraph color="subdued">
                  Use Default for everything, Product for express items.
                </s-paragraph>
              </span>
            </div>
          </s-stack>
        </s-section>
      </s-stack>
    </div>
  );
}
