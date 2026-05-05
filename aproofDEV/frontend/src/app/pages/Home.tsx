import { ArrowRight } from "lucide-react";

export function Home() {
  const whatAproofDoes = [
    {
      title: "Capture System Events",
      description: "Record every action, decision, and state change across your systems",
    },
    {
      title: "Normalize into Canonical Form",
      description: "Transform diverse events into a unified, verifiable structure",
    },
    {
      title: "Evaluate Across Integrity Angles",
      description: "Assess behavior through 7 dimensions of system integrity",
    },
    {
      title: "Produce Immutable Proof",
      description: "Generate cryptographically anchored evidence of system behavior",
    },
  ];


  return (
    <div className="flex flex-col">
      {/* SECTION 1 - HERO */}
      <section className="py-24 lg:py-32 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-5xl lg:text-7xl font-medium tracking-tight mb-6">
            Immutable Integrity for AI and Software Systems
          </h1>
          <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
            Aproof provides cryptographic proof of system behavior, lineage, and integrity across AI models, agents, and services.
          </p>

          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground py-12">
            <div className="px-4 py-2 rounded-lg border border-border bg-card">Input</div>
            <ArrowRight className="w-4 h-4" />
            <div className="px-4 py-2 rounded-lg border border-border bg-card">Canonical</div>
            <ArrowRight className="w-4 h-4" />
            <div className="px-4 py-2 rounded-lg border border-border bg-card">Evaluate</div>
            <ArrowRight className="w-4 h-4" />
            <div className="px-4 py-2 rounded-lg border border-border bg-card">Proof</div>
            <ArrowRight className="w-4 h-4" />
            <div className="px-4 py-2 rounded-lg border border-border bg-card">Anchor</div>
          </div>
        </div>
      </section>

      {/* SECTION 2 - WHAT APROOF DOES */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {whatAproofDoes.map((item, index) => (
              <div key={index} className="space-y-3">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </div>
                <h3 className="text-lg font-medium">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 - SUBJECT TYPES */}
      <section className="py-24 px-6 border-t border-border bg-[#0f1419]">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-medium mb-3">Applies across system types</h2>
          <p className="text-sm text-muted-foreground mb-12">
            Aproof operates at the subject level, allowing each system type to be evaluated with precision and context.
          </p>

          <div className="grid grid-cols-5 gap-4">
            <div className="p-6 rounded-xl border border-border bg-[#0b0b0c] space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full border border-border flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.3-7.7l2.8-2.8M5.5 18.5l2.8-2.8m0-7.4L5.5 5.5m13 13l-2.8-2.8"/>
                </svg>
              </div>
              <h3 className="font-medium">Models</h3>
              <p className="text-xs text-muted-foreground">
                Track model behavior, prompt integrity, and output consistency.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-[#0b0b0c] space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full border border-border flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="2"/>
                  <path d="M12 2v4m0 12v4"/>
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                </svg>
              </div>
              <h3 className="font-medium">Agents</h3>
              <p className="text-xs text-muted-foreground">
                Verify tool use, decisions, and cross-system interactions.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-[#0b0b0c] space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full border border-border flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="4" rx="1"/>
                  <rect x="3" y="10" width="18" height="4" rx="1"/>
                  <rect x="3" y="16" width="18" height="4" rx="1"/>
                </svg>
              </div>
              <h3 className="font-medium">Services</h3>
              <p className="text-xs text-muted-foreground">
                Anchor critical business logic, state, and outcomes.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-[#0b0b0c] space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full border border-border flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v10m10-11h-6m-6 0H1"/>
                </svg>
              </div>
              <h3 className="font-medium">Systems</h3>
              <p className="text-xs text-muted-foreground">
                Capture end-to-end behavior and integration flows.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-[#0b0b0c] space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full border border-border flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="2"/>
                  <path d="M12 2v8m0 4v8"/>
                </svg>
              </div>
              <h3 className="font-medium">Endpoints</h3>
              <p className="text-xs text-muted-foreground">
                Prove API calls, data sent, and responses.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 - 7 ANGLES */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-medium mb-3">Integrity Analysis</h2>
            <p className="text-sm text-muted-foreground">
              Each event is evaluated across seven distinct integrity angles. Together, they form a complete picture.
            </p>
          </div>

          <div className="relative">
            {/* Center circle */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border-2 border-border bg-card flex items-center justify-center z-10">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-lg border border-border flex items-center justify-center">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div className="text-lg font-medium">Integrity</div>
                <div className="text-lg font-medium">Analysis</div>
              </div>
            </div>

            {/* Angle cards arranged in circle */}
            <div className="grid grid-cols-3 gap-8 relative">
              {/* Policy Integrity - Top */}
              <div className="col-start-2 p-6 rounded-xl border border-border bg-card text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg border border-border flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <h3 className="text-sm font-medium mb-2">Policy Integrity</h3>
                <p className="text-xs text-muted-foreground">
                  Enforces defined rules and constraints
                </p>
              </div>

              {/* Identity & Access - Top Right */}
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg border border-border flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <h3 className="text-sm font-medium mb-2">Identity & Access Integrity</h3>
                <p className="text-xs text-muted-foreground">
                  Verifies authentication chains
                </p>
              </div>

              {/* Cross-System - Left */}
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg border border-border flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M3 12h6m6 0h6M12 3v6m0 6v6"/>
                  </svg>
                </div>
                <h3 className="text-sm font-medium mb-2">Cross-System Integrity</h3>
                <p className="text-xs text-muted-foreground">
                  Maintains distributed state consistency
                </p>
              </div>

              {/* Empty space for center */}
              <div className="opacity-0 pointer-events-none"></div>

              {/* Operational - Right */}
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg border border-border flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v10"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                </div>
                <h3 className="text-sm font-medium mb-2">Operational Integrity</h3>
                <p className="text-xs text-muted-foreground">
                  Monitors performance parameters
                </p>
              </div>

              {/* Deterministic - Bottom Left */}
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg border border-border flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <h3 className="text-sm font-medium mb-2">Deterministic Integrity</h3>
                <p className="text-xs text-muted-foreground">
                  Ensures consistent outputs and behavior
                </p>
              </div>

              {/* Retrieval - Bottom Center */}
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg border border-border flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <h3 className="text-sm font-medium mb-2">Retrieval Integrity</h3>
                <p className="text-xs text-muted-foreground">
                  Validates all information sources
                </p>
              </div>

              {/* Model Identity - Bottom Right */}
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg border border-border flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                </div>
                <h3 className="text-sm font-medium mb-2">Model Identity Integrity</h3>
                <p className="text-xs text-muted-foreground">
                  Confirms exact model versions
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 - OUTPUT */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <div className="p-8 rounded-xl border border-border bg-card space-y-6">
            <h2 className="text-2xl font-medium mb-6">Proof Output</h2>
            <div className="space-y-4 font-mono text-sm">
              <div className="flex justify-between py-3 border-b border-border">
                <span className="text-muted-foreground">Event</span>
                <span>evt_7k3m9n2p4q8r</span>
              </div>
              <div className="flex justify-between py-3 border-b border-border">
                <span className="text-muted-foreground">Lineage</span>
                <span>lin_a1b2c3d4e5f6</span>
              </div>
              <div className="flex justify-between py-3 border-b border-border">
                <span className="text-muted-foreground">Proof</span>
                <span>prf_9s8t7u6v5w4x</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-muted-foreground">Anchor</span>
                <span className="text-green-500">0x3e7f...9a2b</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6 - CLOSING */}
      <section className="py-32 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-2xl font-medium tracking-tight">
            Truth, preserved. Not interpreted.
          </p>
        </div>
      </section>
    </div>
  );
}
