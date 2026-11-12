import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Recording stage for the demo video (not linked from the app).
 *   /stage?t=Title&l=/app&r=/sim   phone on the left, desktop on the right
 *   /stage?t=Title&full=/profile   one desktop window
 *   /stage?end=1                   violet end card
 * Both frames are the live app on the same origin, so they share the signed-in student.
 * window.stage.title("...") swaps the title without reloading the frames.
 */
export default function Stage() {
  const [qs] = useSearchParams();
  const [title, setTitle] = useState(qs.get("t") ?? "");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    (window as any).stage = { title: (t: string) => (setShown(false), setTimeout(() => (setTitle(t), setShown(true)), 250)) };
    const t = setTimeout(() => setShown(true), 150);
    document.title = "Sampai stage";
    return () => clearTimeout(t);
  }, []);

  if (qs.get("end")) return <EndCard />;

  const left = qs.get("l");
  const right = qs.get("r");
  const full = qs.get("full");
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: "#16141f", fontFamily: "Manrope, system-ui, sans-serif" }}>
      <header className="flex h-[92px] shrink-0 items-center gap-5 px-14">
        <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: "#FACA4B" }} />
        <h1
          className="text-[34px] font-bold tracking-[-0.01em] text-white transition-all duration-500"
          style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(8px)" }}
          data-testid="stage-title"
        >
          {title}
        </h1>
        <span className="ml-auto text-[17px] font-medium" style={{ color: "#a9a3c4" }}>
          Sampai · badmintins · APU Cloud Innovation Hackathon 2026
        </span>
      </header>
      <main className="flex min-h-0 flex-1 items-start justify-center gap-10 px-14 pb-10">
        {full ? (
          <Window src={full} id="full" width={1792} height={950} />
        ) : (
          <>
            {left && (
              <figure className="flex shrink-0 flex-col items-center">
                <div className="overflow-hidden rounded-[46px] p-[10px]" style={{ background: "#2a2738", boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
                  <iframe title="Student phone" name="phone" data-testid="frame-phone" src={left} className="block rounded-[36px] bg-white" style={{ width: 400, height: 868, border: 0 }} />
                </div>
                <figcaption className="mt-3 text-[15px] font-medium" style={{ color: "#8f89ab" }}>
                  Student phone
                </figcaption>
              </figure>
            )}
            {right && <Window src={right} id="desktop" width={left ? 1310 : 1792} height={950} />}
          </>
        )}
      </main>
    </div>
  );
}

function Window({ src, id, width, height }: { src: string; id: string; width: number; height: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-2xl" style={{ width, height: height - 40, background: "#fff", boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
      <iframe title={id} name={id} data-testid={`frame-${id}`} src={src} className="block h-full w-full" style={{ border: 0 }} />
    </div>
  );
}

function EndCard() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ts = [setTimeout(() => setStep(1), 300), setTimeout(() => setStep(2), 1100), setTimeout(() => setStep(3), 1900)];
    return () => ts.forEach(clearTimeout);
  }, []);
  const fade = (n: number) => ({ opacity: step >= n ? 1 : 0, transform: step >= n ? "none" : "translateY(14px)", transition: "all 800ms cubic-bezier(.2,.8,.2,1)" });
  return (
    <div className="fixed inset-0 grid place-items-center" style={{ background: "#5E3EB6", fontFamily: "Manrope, system-ui, sans-serif" }} data-testid="end-card">
      <div className="text-center text-white">
        <div className="text-[110px] font-extrabold tracking-[-0.03em]" style={fade(1)}>
          Sampai
          <span
            className="inline-block"
            style={{ color: "#FACA4B", transform: step >= 1 ? "scale(1)" : "scale(0)", transition: "transform 600ms cubic-bezier(.34,1.56,.64,1) 500ms" }}
          >
            .
          </span>
        </div>
        <p className="mt-2 text-[34px] font-medium" style={{ ...fade(2), color: "#ece7fb" }}>
          Get to class, or get proof why you didn't.
        </p>
        <div className="mt-12 space-y-2 text-[26px] font-semibold" style={fade(3)}>
          <div>sampai-apu.web.app</div>
          <div style={{ color: "#d4cbf3" }}>github.com/williamjonathanliem/sampai</div>
        </div>
      </div>
    </div>
  );
}
