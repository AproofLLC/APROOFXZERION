import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function TableLoadingState() {
  return (
    <div className="p-8 text-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">Loading data...</p>
    </div>
  );
}
