import { Outlet } from "react-router";
import { DevBackendBanner } from "./DevBackendBanner";
import { Navigation } from "./Navigation";
import { Toaster } from "./ui/sonner";

export function Root() {
  return (
    <div className="min-h-screen bg-background">
      <DevBackendBanner />
      <Navigation />
      <Outlet />
      <Toaster />
    </div>
  );
}
