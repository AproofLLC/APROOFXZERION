import { Link, useLocation } from "react-router";

export function Navigation() {
  const location = useLocation();

  const navItems = [
    { name: "Sales", path: "/sales" },
    { name: "Proofs", path: "/app/proofs" },
    { name: "Regulatory", path: "/regulatory" },
    { name: "Contact", path: "/contact" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/app/proofs") {
      return location.pathname.startsWith("/app/proofs") || location.pathname === "/proofs";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center">
            <span className="text-xl font-medium tracking-tight">Aproof</span>
          </Link>

          <div className="flex gap-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm transition-colors hover:text-foreground ${
                  isActive(item.path)
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
                style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
