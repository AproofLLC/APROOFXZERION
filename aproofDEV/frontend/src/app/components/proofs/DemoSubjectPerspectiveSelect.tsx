import { DEMO_RAIL_OPTIONS, type DemoRailId } from "../../../constants/demo-rails";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export type DemoRailSubjectMap = Record<DemoRailId, string>;

export function DemoSubjectPerspectiveSelect({
  railMap,
  subjectId,
  onSubjectChange,
}: {
  railMap: DemoRailSubjectMap;
  subjectId: string;
  onSubjectChange: (id: string) => void;
}) {
  const currentRail =
    (DEMO_RAIL_OPTIONS.find((o) => railMap[o.rail] === subjectId)?.rail as DemoRailId | undefined) ??
    DEMO_RAIL_OPTIONS[0]!.rail;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
      <Label
        htmlFor="demo-subject-perspective"
        className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide shrink-0"
      >
        Demo subject
      </Label>
      <Select
        value={currentRail}
        onValueChange={(rail) => {
          const id = railMap[rail as DemoRailId];
          if (id) onSubjectChange(id);
        }}
      >
        <SelectTrigger
          id="demo-subject-perspective"
          size="sm"
          className="w-full sm:w-[min(100%,20rem)] bg-card border-border text-foreground shadow-none"
          aria-label="Demo subject perspective"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border text-popover-foreground">
          {DEMO_RAIL_OPTIONS.map(({ rail, label }) => (
            <SelectItem key={rail} value={rail}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
