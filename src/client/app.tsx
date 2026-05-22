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
import { HomePage } from "./pages/home";
import { GoalListPage } from "./pages/goals/list";
import { GoalNewPage } from "./pages/goals/new";
import { GoalDetailPage } from "./pages/goals/detail";
import { GoalEditPage } from "./pages/goals/edit";

const ProgramsPlaceholder = () => (
  <div className="flex flex-1 items-center justify-center p-8 text-[var(--text-muted)]">
    Programs coming soon
  </div>
);

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "/today", element: <Navigate to="/" replace /> },
      { path: "/exercises", element: <ExerciseListPage /> },
      { path: "/exercises/new", element: <ExerciseNewPage /> },
      { path: "/exercises/:id", element: <ExerciseDetailPage /> },
      { path: "/exercises/:id/edit", element: <ExerciseEditPage /> },
      { path: "/equipment", element: <EquipmentListPage /> },
      { path: "/routines", element: <RoutineListPage /> },
      { path: "/routines/new", element: <RoutineBuilderPage mode="create" /> },
      { path: "/routines/:id", element: <RoutineBuilderPage mode="edit" /> },
      { path: "/programs", element: <ProgramsPlaceholder /> },
      { path: "/programs/new", element: <ProgramsPlaceholder /> },
      { path: "/programs/:id", element: <ProgramsPlaceholder /> },
      { path: "/goals", element: <GoalListPage /> },
      { path: "/goals/new", element: <GoalNewPage /> },
      { path: "/goals/:id", element: <GoalDetailPage /> },
      { path: "/goals/:id/edit", element: <GoalEditPage /> },
      { path: "/workout/start", element: <WorkoutStartPage /> },
      { path: "/workout/active", element: <WorkoutActivePage /> },
      { path: "/workout/sessions/:id", element: <SessionDetailPage /> },
      { path: "/history", element: <HistoryListPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
