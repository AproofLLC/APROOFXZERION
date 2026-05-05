import { Check } from "lucide-react";
import { Button } from "../components/ui/button";

export function Sales() {
  const features = [
    "Deterministic proof generation",
    "Full event traceability",
    "Lineage tracking",
    "Failure detection",
    "Immutable anchor record",
  ];

  return (
    <div className="flex flex-col">
      {/* SECTION 1 - HERO PRICING */}
      <section className="py-24 lg:py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl lg:text-5xl font-medium tracking-tight mb-12">
            Simple Pricing
          </h1>

          <div className="mb-8">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-7xl lg:text-8xl font-medium tracking-tight">$0.05</span>
            </div>
            <p className="text-xl text-muted-foreground mt-4">per anchor</p>
            <p className="text-sm text-muted-foreground mt-2">
              Immutable, finalized proof recorded on-chain
            </p>
          </div>

          <div className="my-12 p-8 rounded-xl border border-border bg-card">
            <div className="space-y-4">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-left">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <Button size="lg" className="rounded-xl px-8">
            Start Anchoring
          </Button>
        </div>
      </section>

      {/* SECTION 2 - FREE PROOFS STRIP */}
      <section className="py-16 px-6 border-t border-b border-border bg-accent/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-medium mb-2">50 Free Proofs Included</h2>
          <p className="text-muted-foreground">No commitment. Start immediately.</p>
        </div>
      </section>

      {/* SECTION 3 - BILLING */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-medium mb-4">Usage-Based Billing</h2>
          <div className="space-y-2 text-muted-foreground">
            <p>Pay only for what you use</p>
            <p>No subscriptions</p>
            <p>Credits loaded upfront</p>
          </div>
        </div>
      </section>

      {/* SECTION 4 - HIGH VOLUME */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-medium mb-4">High-Volume Usage</h2>
          <p className="text-muted-foreground">
            Custom pricing for 100,000+ anchors/month
          </p>
        </div>
      </section>

      {/* SECTION 5 - FINAL CTA */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <Button size="lg" className="rounded-xl px-8">
            Start Anchoring
          </Button>
          <p className="text-sm text-muted-foreground">Get started in minutes</p>
        </div>
      </section>
    </div>
  );
}
