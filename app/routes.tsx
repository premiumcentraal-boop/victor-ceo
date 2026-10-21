import React from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./Layout";

// Each page loads when its route is opened, so three.js and the galaxy only load where they are used.
export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      {
        // The exhibition is the homepage.
        index: true,
        lazy: async () => ({ Component: (await import("./pages/TheExhibition")).TheExhibition }),
      },
      {
        // The previous homepage, unchanged, for the lab.
        path: "lab",
        lazy: async () => ({ Component: (await import("./pages/Home")).Home }),
      },
      {
        path: "exhibition",
        element: <Navigate to="/" replace />,
      },
      {
        path: "pre-release",
        lazy: async () => ({ Component: (await import("./pages/PreRelease")).PreRelease }),
      },
      {
        path: "radar",
        lazy: async () => ({ Component: (await import("./pages/Radar")).Radar }),
      },
      {
        path: "watchlist",
        lazy: async () => ({ Component: (await import("./pages/Watchlist")).Watchlist }),
      },
      {
        path: "execution",
        element: <Navigate to="/watchlist" replace />,
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
