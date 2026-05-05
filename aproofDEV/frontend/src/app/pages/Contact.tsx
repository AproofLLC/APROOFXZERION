import { Mail } from "lucide-react";

export function Contact() {
  return (
    <div className="flex flex-col">
      <section className="py-24 lg:py-32 px-6">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-medium tracking-tight">Contact Us</h1>
            <p className="text-lg text-muted-foreground">Direct communication only</p>
          </div>

          <div className="p-8 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Mail className="w-6 h-6 text-muted-foreground" />
              <span className="text-2xl font-medium">Email</span>
            </div>
            <a
              href="mailto:aproofllc@outlook.com"
              className="text-xl text-primary hover:text-primary/80 transition-colors"
            >
              aproofllc@outlook.com
            </a>
          </div>

          <div className="pt-8 text-sm text-muted-foreground space-y-2">
            <p>For general inquiries, partnership opportunities, or technical questions.</p>
            <p>We respond to all messages within 24-48 hours.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
