import { Navigate, RouterProvider, createBrowserRouter } from "react-router";
import { AppShell } from "./layouts/app-shell";
import { ExerciseListPage } from "./pages/exercises/list";
import { ExerciseDetailPage } from "./pages/exercises/detail";
import { ExerciseNewPage } from "./pages/exercises/new";
import { ExerciseEditPage } from "./pages/exercises/edit";
import { EquipmentListPage } from "./pages/equipment/list";
import { RoutineListPage } from "./pages/routines/list";

const RoutineBuilderPlaceholder = () => (
  <div className="flex flex-1 items-center justify-center p-8 text-[var(--text-muted)]">
    Builder coming soon (Phase 6)
  </div>
);

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/exercises" replace /> },
      { path: "/exercises", element: <ExerciseListPage /> },
      { path: "/exercises/new", element: <ExerciseNewPage /> },
      { path: "/exercises/:id", element: <ExerciseDetailPage /> },
      { path: "/exercises/:id/edit", element: <ExerciseEditPage /> },
      { path: "/equipment", element: <EquipmentListPage /> },
      { path: "/routines", element: <RoutineListPage /> },
      { path: "/routines/new", element: <RoutineBuilderPlaceholder /> },
      { path: "/routines/:id", element: <RoutineBuilderPlaceholder /> },
      { path: "*", element: <Navigate to="/exercises" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
