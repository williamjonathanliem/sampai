import { Component, type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Onboard from "./pages/Onboard";
import Sim from "./pages/Sim";
import Admin from "./pages/Admin";
import Letter from "./pages/Letter";
import IncidentPage from "./pages/Incident";
import Profile from "./pages/Profile";
import Landing from "./pages/Landing";
import Ride from "./pages/Ride";

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

export default function App() {
  return (
    <Boundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/welcome" element={<Landing />} />
        <Route path="/ride" element={<Ride />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/sim" element={<Sim />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/letter/:incidentId" element={<Letter />} />
        <Route path="/incident/:id" element={<IncidentPage />} />
      </Routes>
    </Boundary>
  );
}
