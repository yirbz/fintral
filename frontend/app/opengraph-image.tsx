import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Fintral - Infraestructura fiscal automatizada para RD";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const blurTopStyle = {
  position: "absolute",
  top: "-150px",
  right: "-150px",
  width: "800px",
  height: "800px",
  backgroundColor: "#0EA5E9",
  opacity: 0.15,
  borderRadius: "50%",
  filter: "blur(100px)",
} as const;

const blurBottomStyle = {
  position: "absolute",
  bottom: "-150px",
  left: "-150px",
  width: "700px",
  height: "700px",
  backgroundColor: "#38BDF8",
  opacity: 0.1,
  borderRadius: "50%",
  filter: "blur(100px)",
} as const;

const titleStyle = {
  display: "flex",
  flexDirection: "column",
  fontSize: "56px",
  fontWeight: 300,
  color: "#0d253d",
  letterSpacing: "-0.03em",
  lineHeight: 1.1,
  marginBottom: "28px",
} as const;

const cardStyle = {
  display: "flex",
  flexDirection: "column",
  width: "480px",
  backgroundColor: "white",
  borderRadius: "24px",
  padding: "36px",
  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.1)",
  border: "1px solid #e3e8ee",
  zIndex: 10,
} as const;

const buttonStyle = {
  marginTop: "36px",
  width: "100%",
  height: "56px",
  backgroundColor: "#0d253d",
  borderRadius: "12px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  color: "white",
  fontSize: "18px",
  fontWeight: 500,
} as const;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#f6f9fc",
          fontFamily: "Inter, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle background gradients */}
        <div style={blurTopStyle} />
        <div style={blurBottomStyle} />

        {/* Content Container */}
        <div style={{ display: "flex", width: "100%", height: "100%", padding: "80px", justifyContent: "space-between", alignItems: "center" }}>
          
          {/* Left Side: Copy & Brand */}
          <div style={{ display: "flex", flexDirection: "column", width: "550px", zIndex: 10 }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "40px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "72px", height: "72px", backgroundColor: "#09090b", borderRadius: "14px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ width: "36px", height: "6px", backgroundColor: "#38BDF8", borderRadius: "1.5px" }} />
                  <div style={{ width: "24px", height: "6px", backgroundColor: "#7DD3FC", borderRadius: "1.5px" }} />
                  <div style={{ width: "16px", height: "6px", backgroundColor: "white", borderRadius: "1.5px" }} />
                </div>
              </div>
              <div style={{ fontSize: "64px", fontWeight: 600, color: "#09090b", letterSpacing: "-0.04em" }}>
                Fintral
              </div>
            </div>

            {/* Title */}
            <div style={titleStyle}>
              <span>Infraestructura fiscal</span>
              <span style={{ color: "#0EA5E9", fontWeight: 500 }}>automatizada</span>
              <span>para RD.</span>
            </div>

            {/* Subtitle */}
            <div style={{ fontSize: "26px", color: "#61718a", lineHeight: 1.5 }}>
              Procesa facturas, valida NCFs contra la DGII y centraliza gastos sin intervención manual.
            </div>
          </div>

          {/* Right Side: Mockup Card */}
          <div style={cardStyle}>
            {/* Card Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e3e8ee", paddingBottom: "24px", marginBottom: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ fontSize: "16px", color: "#64748d", fontWeight: 500 }}>Validación NCF</div>
                <div style={{ fontSize: "36px", color: "#0d253d", fontWeight: 600, letterSpacing: "-0.02em" }}>B0100000123</div>
              </div>
              <div style={{ display: "flex", backgroundColor: "#dcfce7", color: "#166534", padding: "8px 16px", borderRadius: "999px", fontSize: "16px", fontWeight: 600 }}>
                Aprobado DGII
              </div>
            </div>

            {/* Mockup Rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "48px", height: "48px", backgroundColor: "#f1f5f9", borderRadius: "10px" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ width: "140px", height: "14px", backgroundColor: "#cbd5e1", borderRadius: "4px" }} />
                    <div style={{ width: "80px", height: "12px", backgroundColor: "#e2e8f0", borderRadius: "4px" }} />
                  </div>
                </div>
                <div style={{ fontSize: "20px", color: "#0d253d", fontWeight: 500 }}>$15,400.00</div>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "48px", height: "48px", backgroundColor: "#f1f5f9", borderRadius: "10px" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ width: "180px", height: "14px", backgroundColor: "#cbd5e1", borderRadius: "4px" }} />
                    <div style={{ width: "100px", height: "12px", backgroundColor: "#e2e8f0", borderRadius: "4px" }} />
                  </div>
                </div>
                <div style={{ fontSize: "20px", color: "#0d253d", fontWeight: 500 }}>$2,500.00</div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "48px", height: "48px", backgroundColor: "#f1f5f9", borderRadius: "10px" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ width: "120px", height: "14px", backgroundColor: "#cbd5e1", borderRadius: "4px" }} />
                    <div style={{ width: "60px", height: "12px", backgroundColor: "#e2e8f0", borderRadius: "4px" }} />
                  </div>
                </div>
                <div style={{ fontSize: "20px", color: "#0d253d", fontWeight: 500 }}>$8,950.00</div>
              </div>
            </div>
            
            {/* Mockup Button */}
            <div style={buttonStyle}>
              Exportar Formato 606
            </div>
          </div>

        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
