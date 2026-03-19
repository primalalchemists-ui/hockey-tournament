import type { SharePreviewRow } from "@/lib/share-preview";

type ShareOgCardProps = {
  title: string;
  subtitle: string;
  rows: SharePreviewRow[];
  bannerUrl?: string;
  mode: "ranking" | "scorers";
};

function HeaderCell({
  width,
  label,
}: {
  width: string;
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        width,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {label}
    </div>
  );
}

function Cell({
  width,
  children,
  justify = "center",
  fontSize = 24,
  fontWeight = 800,
  color = "#ffffff",
}: {
  width: string;
  children: React.ReactNode;
  justify?: "center" | "flex-start" | "flex-end";
  fontSize?: number;
  fontWeight?: number;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        width,
        justifyContent: justify,
        alignItems: "center",
        fontSize,
        fontWeight,
        color,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function ShareOgCard({
  title,
  subtitle,
  rows,
  bannerUrl,
  mode,
}: ShareOgCardProps) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        position: "relative",
        background: "#020617",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      {bannerUrl ? (
        <img
          src={bannerUrl}
          alt="Banner"
          width="1200"
          height="630"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(2,6,23,0.80) 0%, rgba(15,23,42,0.78) 40%, rgba(23,37,84,0.72) 100%)",
        }}
      />

      <div
        style={{
          display: "flex",
          position: "absolute",
          inset: "24px",
          borderRadius: "28px",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(15,23,42,0.62)",
          padding: "24px",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "46px",
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {title}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "12px",
              fontSize: "22px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.82)",
            }}
          >
            {subtitle}
          </div>
        </div>

        {mode === "ranking" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              borderRadius: "20px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div
              style={{
                display: "flex",
                height: "58px",
                alignItems: "center",
                padding: "0 18px",
                background: "rgba(255,255,255,0.12)",
                fontSize: "18px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              <HeaderCell width="90px" label="Poz." />
              <div
                style={{
                  display: "flex",
                  width: "560px",
                  alignItems: "center",
                }}
              >
                Drużyna
              </div>
              <HeaderCell width="90px" label="W" />
              <HeaderCell width="90px" label="P" />
              <HeaderCell width="110px" label="PKT" />
              <HeaderCell width="170px" label="Bramki" />
            </div>

            {rows.slice(0, 5).map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: "78px",
                  padding: "0 18px",
                  background:
                    index % 2 === 0
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(255,255,255,0.025)",
                  borderTop:
                    index === 0 ? "none" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Cell width="90px">{row.position}</Cell>

                <div
                  style={{
                    display: "flex",
                    width: "560px",
                    alignItems: "center",
                    gap: "14px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.08)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {row.logoUrl ? (
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
                          display: "flex",
                          fontSize: "11px",
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.9)",
                        }}
                      >
                        {row.logoText || "LOGO"}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      fontSize: "24px",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.label}
                  </div>
                </div>

                <Cell width="90px">{row.wins ?? 0}</Cell>
                <Cell width="90px">{row.losses ?? 0}</Cell>
                <Cell width="110px" fontSize={26}>
                  {row.points ?? 0}
                </Cell>
                <Cell
                  width="170px"
                  fontSize={20}
                  fontWeight={700}
                  color="rgba(255,255,255,0.90)"
                >
                  {row.goals ?? "0:0"}
                </Cell>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              borderRadius: "20px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div
              style={{
                display: "flex",
                height: "58px",
                alignItems: "center",
                padding: "0 18px",
                background: "rgba(255,255,255,0.12)",
                fontSize: "18px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              <HeaderCell width="90px" label="Poz." />
              <div
                style={{
                  display: "flex",
                  width: "620px",
                  alignItems: "center",
                }}
              >
                Zawodnik
              </div>
              <HeaderCell width="260px" label="Drużyna" />
              <HeaderCell width="120px" label="Bramki" />
            </div>

            {rows.slice(0, 5).map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: "78px",
                  padding: "0 18px",
                  background:
                    index % 2 === 0
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(255,255,255,0.025)",
                  borderTop:
                    index === 0 ? "none" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Cell width="90px">{row.position}</Cell>

                <div
                  style={{
                    display: "flex",
                    width: "620px",
                    alignItems: "center",
                    gap: "14px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.08)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {row.logoUrl ? (
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
                          display: "flex",
                          fontSize: "11px",
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.9)",
                        }}
                      >
                        {row.logoText || "LOGO"}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      fontSize: "24px",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.label}
                  </div>
                </div>

                <Cell
                  width="260px"
                  fontSize={18}
                  fontWeight={700}
                  color="rgba(255,255,255,0.88)"
                >
                  {row.secondary ?? "Brak drużyny"}
                </Cell>

                <Cell width="120px" fontSize={26}>
                  {row.value ?? 0}
                </Cell>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}