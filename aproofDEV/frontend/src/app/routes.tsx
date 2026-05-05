import { createBrowserRouter, Navigate } from "react-router";
import { Root } from "./components/Root";
import { Home } from "./pages/Home";
import { Sales } from "./pages/Sales";
import { Proofs } from "./pages/Proofs";
import { Regulatory } from "./pages/Regulatory";
import { Contact } from "./pages/Contact";
import { NotFound } from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: "sales", Component: Sales },
      /** Legacy bookmark: API uses `/proofs/:id` — product route is under `/app/proofs`. */
      { path: "proofs", element: <Navigate to="/app/proofs" replace /> },
      { path: "app/proofs", Component: Proofs },
      { path: "regulatory", Component: Regulatory },
      { path: "contact", Component: Contact },
      { path: "*", Component: NotFound },
    ],
  },
]);
