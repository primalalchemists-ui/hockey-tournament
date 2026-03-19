import type { SharePreviewRow } from "@/lib/share-preview";

type ShareOgCardProps = {
  title: string;
  subtitle: string;
  rows: SharePreviewRow[];
};

export function ShareOgCard({ title, subtitle, rows }: ShareOgCardProps) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        position: "relative",
        background:
          "linear-gradient(135deg, #020617 0%, #0f172a 45%, #172554 100%)",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at top left, rgba(255,255,255,0.08), transparent 30%), radial-gradient(circle at bottom right, rgba(255,255,255,0.06), transparent 25%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: "38px",
          borderRadius: "28px",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(15,23,42,0.78)",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "44px", fontWeight: 800 }}>{title}</div>
          <div
            style={{
              marginTop: "10px",
              fontSize: "24px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.78)",
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            height: "52px",
            alignItems: "center",
            borderRadius: "16px 16px 0 0",
            background: "rgba(255,255,255,0.12)",
            padding: "0 18px",
            fontSize: "20px",
            fontWeight: 700,
            color: "rgba(255,255,255,0.86)",
          }}
        >
          <div style={{ width: "90px", textAlign: "center" }}>Poz.</div>
          <div style={{ flex: 1 }}>Nazwa</div>
          <div style={{ width: "150px", textAlign: "center" }}>Wartość</div>
          <div style={{ width: "130px", textAlign: "center" }}>Extra</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid rgba(255,255,255,0.08)",
            borderTop: "none",
            borderRadius: "0 0 18px 18px",
            overflow: "hidden",
          }}
        >
          {rows.slice(0, 5).map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                minHeight: "76px",
                padding: "0 18px",
                background:
                  index % 2 === 0
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(255,255,255,0.01)",
                borderTop:
                  index === 0 ? "none" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  width: "90px",
                  textAlign: "center",
                  fontSize: "30px",
                  fontWeight: 800,
                }}
              >
                {row.position}
              </div>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {row.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.logoUrl}
                      alt={row.label}
                      width="48"
                      height="48"
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.9)",
                      }}
                    >
                      {row.logoText || "LOGO"}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "28px",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "620px",
                    }}
                  >
                    {row.label}
                  </div>

                  {row.secondary ? (
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "17px",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.64)",
                      }}
                    >
                      {row.secondary}
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  width: "150px",
                  textAlign: "center",
                  fontSize: "28px",
                  fontWeight: 800,
                }}
              >
                {row.value}
              </div>

              <div
                style={{
                  width: "130px",
                  textAlign: "center",
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.86)",
                }}
              >
                {row.extra || "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}