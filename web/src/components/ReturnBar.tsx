import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { useUid, useUserDoc } from "../lib/hooks";

/**
 * Shown on the landing page when this browser already has a Sampai profile:
 * a way back to the dashboard, without forcing anyone off the landing page.
 */
export default function ReturnBar() {
  const uid = useUid();
  const user = useUserDoc(uid);
  const [hidden, setHidden] = useState(false);
  if (!user || hidden) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1000] px-4 pb-[max(env(safe-area-inset-bottom),16px)]" role="region" aria-label="Your Sampai profile">
      <div className="enter mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-fg py-2.5 pl-4 pr-2.5 text-surface shadow-[0_16px_40px_oklch(0.2_0.05_285/0.35)]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface/15 text-[14px] font-bold">{(user.displayName ?? "S")[0]}</span>
        <span className="min-w-0 flex-1 text-[14px] leading-snug">
          <span className="block truncate font-semibold">Welcome back{user.displayName && user.displayName !== "Student" ? `, ${user.displayName}` : ""}</span>
          <span className="block truncate text-[12.5px] text-surface/70">{user.route?.title ?? "Your commute is saved on this device"}</span>
        </span>
        <Link to="/app" aria-label="Back to my commute" className="press inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-surface px-3.5 text-[14px] font-semibold text-fg hover:bg-surface/90">
          <span className="sm:hidden">Open</span>
          <span className="hidden sm:inline">Back to my commute</span>
          <ArrowRight size={16} />
        </Link>
        <button onClick={() => setHidden(true)} aria-label="Dismiss" className="press grid h-9 w-9 shrink-0 place-items-center rounded-lg text-surface/70 hover:bg-surface/10 hover:text-surface">
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
