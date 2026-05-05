import type { ReactNode } from "react";

type SettingsSectionProps = {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
};

/** Shared heading + copy rhythm for the Settings control plane (one surface, not scattered forms). */
export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  return (
    <section className="scroll-mt-4 space-y-4" id={id} aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">{description}</p>
      </div>
      {children}
    </section>
  );
}
