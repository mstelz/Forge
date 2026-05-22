import { Navigate, RouterProvider, createBrowserRouter } from "react-router";
import { AppShell } from "./layouts/app-shell";
import { ExerciseListPage } from "./pages/exercises/list";
import { ExerciseDetailPage } from "./pages/exercises/detail";
import { ExerciseNewPage } from "./pages/exercises/new";
import { ExerciseEditPage } from "./pages/exercises/edit";
import { EquipmentListPage } from "./pages/equipment/list";
import { RoutineListPage } from "./pages/routines/list";
import { RoutineBuilderPage } from "./pages/routines/builder";
import { WorkoutStartPage } from "./pages/workout/start";
import { WorkoutActivePage } from "./pages/workout/active";
import { SessionDetailPage } from "./pages/workout/session-detail";
import { HistoryListPage } from "./pages/history/list";

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
      { path: "/routines/new", element: <RoutineBuilderPage mode="create" /> },
      { path: "/routines/:id", element: <RoutineBuilderPage mode="edit" /> },
      { path: "/workout/start", element: <WorkoutStartPage /> },
      { path: "/workout/active", element: <WorkoutActivePage /> },
      { path: "/workout/sessions/:id", element: <SessionDetailPage /> },
      { path: "/history", element: <HistoryListPage /> },
      { path: "*", element: <Navigate to="/exercises" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
