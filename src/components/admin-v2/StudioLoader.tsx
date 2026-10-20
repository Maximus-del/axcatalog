// AX Studio OS loader — light, animated, and quiet.
//
// Self-contained on purpose: it renders BEFORE the V2 stylesheet has loaded
// (first visit, auth still resolving), so its colours and keyframes live here
// rather than in ax-studio.css. Nothing shows for the first 180ms — a load
// that finishes inside that window never flashes a loader at all.

const CSS = `
@keyframes axl-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes axl-sweep { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }
@keyframes axl-breathe { 0%,100% { opacity: .55; transform: scale(.985) } 50% { opacity: 1; transform: scale(1) } }
.axl { opacity: 0; animation: axl-in .25s ease-out .18s forwards; }
.axl-mark { font: 800 44px/1 Manrope, "DM Sans", Inter, system-ui, sans-serif; letter-spacing: -0.08em; color: #101923; animation: axl-breathe 1.6s ease-in-out infinite; }
.axl-mark span { color: #03AC13; }
.axl-bar { position: relative; width: 72px; height: 3px; margin-top: 14px; border-radius: 3px; overflow: hidden; background: #dce3e8; }
.axl-bar::after { content: ""; position: absolute; inset: 0; width: 40%; border-radius: 3px; background: #03AC13; animation: axl-sweep 1.1s cubic-bezier(.6,0,.4,1) infinite; }
@media (prefers-reduced-motion: reduce) { .axl-mark, .axl-bar::after { animation: none } .axl { animation-delay: 0s } }
`;

export default function StudioLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: fullScreen ? "100vh" : "50vh",
        background: fullScreen ? "#f4f6f7" : "transparent",
      }}
    >
      <style>{CSS}</style>
      <div className="axl" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className="axl-mark">
          A<span>X</span>
        </div>
        <div className="axl-bar" />
      </div>
    </div>
  );
}
