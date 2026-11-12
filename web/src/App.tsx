import { Component, type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { resetSession } from "./lib/firebase";
import Home from "./pages/Home";
import Onboard from "./pages/Onboard";
import Sim from "./pages/Sim";
import Admin from "./pages/Admin";
import Letter from "./pages/Letter";
import Stage from "./pages/Stage";
import IncidentPage from "./pages/Incident";
import Profile from "./pages/Profile";
import Landing from "./pages/Landing";
import Ride from "./pages/Ride";
import Brand from "./pages/Brand";
import ReturnBar from "./components/ReturnBar";
import { Link } from "react-router-dom";
import { Logo } from "./components/Logo";

/** Branded 404: the route ends, with a way back. */
function NotFound() {
  return (
    <div className="lp mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-24">
      <Logo size={32} />
      <h1 className="mt-8 heading-4">This stop isn't on the line</h1>
      <p className="mt-2 body-3 text-muted">The page you opened doesn't exist. Head back and pick another route.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/welcome" className="lp-press inline-flex min-h-11 items-center rounded-xl bg-brand px-3 py-2 button-md text-surface hover:bg-brand-hover">
          Back to Sampai
        </Link>
        <Link to="/app" className="lp-press inline-flex min-h-11 items-center rounded-xl px-3 py-2 button-md text-fg ring-1 ring-line hover:bg-sunken">
          Open the app
        </Link>
      </div>
    </div>
  );
}

/** A crash shows a way out instead of a blank screen. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md px-5 pt-24">
        <div className="text-[20px] font-extrabold">
          Sampai<span className="text-brand">.</span>
        </div>
        <h1 className="mt-6 text-xl font-bold">This screen hit a problem</h1>
        <p className="mt-2 text-[15px] text-muted">Your alerts keep arriving in the background. Reload to try again.</p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-sunken p-3 text-xs text-muted">{this.state.error.message}</pre>
        <button onClick={() => location.reload()} className="press mt-5 h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-surface">
          Reload
        </button>
      </div>
    );
  }
}

// "?reset=1" on any page starts over as a brand-new student (handy for demos and testing)
if (typeof location !== "undefined" && new URLSearchParams(location.search).has("reset")) {
  resetSession().finally(() => location.replace("/"));
}

export default function App() {
  return (
    <Boundary>
      <Routes>
        {/* "/" is always the landing page; the student dashboard lives at /app */}
        <Route path="/" element={<><Landing /><ReturnBar /></>} />
        <Route path="/welcome" element={<><Landing /><ReturnBar /></>} />
        <Route path="/app" element={<Home />} />
        <Route path="/ride" element={<Ride />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/sim" element={<Sim />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/letter/:incidentId" element={<Letter />} />
        <Route path="/report" element={<Letter />} />
        <Route path="/stage" element={<Stage />} />
        <Route path="/incident/:id" element={<IncidentPage />} />
        <Route path="/brand" element={<Brand />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Boundary>
  );
}
