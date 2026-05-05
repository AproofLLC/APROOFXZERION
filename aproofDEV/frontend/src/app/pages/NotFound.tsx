import { Link } from "react-router";
import { Button } from "../components/ui/button";

export function NotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground mb-2">404</p>
      <h1 className="text-2xl font-medium mb-3">Page not found</h1>
      <p className="text-sm text-muted-foreground max-w-md mb-8">
        This path is not part of the app. If you opened a URL directly, check the address or return home.
      </p>
      <Button asChild>
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  );
}
