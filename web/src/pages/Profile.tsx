import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { useUid, useUserDoc } from "../lib/hooks";
import ProfileForm from "../components/ProfileForm";
import { SimTag, btn } from "../components/ui";

export default function Profile() {
  const uid = useUid();
  const user = useUserDoc(uid);
  const nav = useNavigate();

  return (
    <div className="mx-auto max-w-xl px-5 lg:max-w-6xl lg:px-10 pb-16 pt-[max(env(safe-area-inset-top),14px)] lg:pt-10">
      <div className="flex items-center justify-between">
        <button onClick={() => nav("/")} className={btn("ghost", "sm", "-ml-2")}>
          <ArrowLeft size={17} /> Back
        </button>
        <Link to="/onboard" className={btn("ghost", "sm")}>
          <Users size={16} /> Demo students
        </Link>
      </div>
      <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] lg:text-[32px]">Your profile</h1>
      <p className="mt-1.5 text-[15px] text-muted">Home, station and classes decide which disruptions reach you.</p>
      {user?.simulated && (
        <div className="mt-5 flex max-w-2xl items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-[13px] text-warn">
          <SimTag className="mt-px" /> You're using the demo student {user.displayName}. Saving here replaces it with your own profile.
        </div>
      )}
      <div className="mt-8">
        {user === undefined ? <div className="h-96 animate-pulse rounded-2xl bg-sunken" /> : <ProfileForm key={uid ?? "x"} wide uid={uid} initial={user} onSaved={() => nav("/")} />}
      </div>
    </div>
  );
}
