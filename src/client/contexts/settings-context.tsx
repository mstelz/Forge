import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Settings } from "../../shared/settings";
import { SETTINGS_ID } from "../../shared/settings";
import { useSettings } from "../hooks/use-settings";
import { setTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";

const defaultSettings: Settings = {
  id: SETTINGS_ID,
  weightUnit: "kg",
  distanceUnit: "km",
  heightUnit: "cm",
  timezone: "America/Chicago",
  weekStartsOn: "mon",
  showRpe: true,
  showCardio: true,
  theme: "system",
  createdAt: 0,
  updatedAt: 0,
};

export const SettingsContext = createContext<Settings>(defaultSettings);

export function useSettingsContext(): Settings {
  return useContext(SettingsContext);
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { data } = useSettings();
  const settings = data ?? defaultSettings;

  // Apply theme from Dexie whenever it changes
  useEffect(() => {
    if (data?.theme) {
      setTheme(data.theme as Theme);
    }
  }, [data?.theme]);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}
