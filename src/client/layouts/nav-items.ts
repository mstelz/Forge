export interface NavItem {
  to: string;
  label: string;
}

/** Top-level surfaces — the main body of the drawer. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home" },
  { to: "/workout/start", label: "Workout" },
  { to: "/exercises", label: "Exercises" },
  { to: "/routines", label: "Routines" },
  { to: "/programs", label: "Programs" },
  { to: "/goals", label: "Goals" },
  { to: "/history", label: "History" },
  { to: "/equipment", label: "Equipment" },
];

/** Personal destinations, pinned below the divider at the foot of the drawer. */
export const SECONDARY_NAV_ITEMS: NavItem[] = [
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
];

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS];
