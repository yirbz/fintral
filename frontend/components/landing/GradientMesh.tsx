export function GradientMesh() {
  return (
    <div
      aria-hidden="true"
      className="absolute top-0 left-0 right-0 h-[900px] overflow-hidden -z-10 pointer-events-none animate-mesh-reveal"
    >
      <div className="absolute inset-0 bg-[#f5e9d4]/30" />

      <div
        className="absolute -top-[8%] left-[8%] w-[55vw] h-[55vw] rounded-full mix-blend-multiply filter blur-[120px] bg-[#0EA5E9]/15 opacity-70 animate-blob-float"
        style={{ animationDelay: "0s" }}
      />

      <div
        className="absolute top-[12%] right-[18%] w-[42vw] h-[42vw] rounded-full mix-blend-multiply filter blur-[100px] bg-[#38BDF8]/25 opacity-80 animate-blob-float-2"
        style={{ animationDelay: "-2s" }}
      />

      <div
        className="absolute top-[22%] left-[35%] w-[48vw] h-[48vw] rounded-full mix-blend-multiply filter blur-[120px] bg-[#7DD3FC]/12 opacity-60 animate-blob-float"
        style={{ animationDelay: "-6s" }}
      />

      <div
        className="absolute top-[3%] right-[3%] w-[38vw] h-[38vw] rounded-full mix-blend-multiply filter blur-[100px] bg-[#ea2261]/10 opacity-70 animate-blob-float-2"
        style={{ animationDelay: "-4s" }}
      />

      <div
        className="absolute top-[30%] left-[60%] w-[30vw] h-[30vw] rounded-full mix-blend-multiply filter blur-[90px] bg-[#0EA5E9]/8 opacity-60 animate-blob-pulse"
        style={{ animationDelay: "-8s" }}
      />

      <div className="absolute bottom-0 left-0 right-0 h-[300px] bg-gradient-to-b from-transparent to-white" />
    </div>
  );
}
