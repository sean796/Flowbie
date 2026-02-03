import { useState, useCallback, useEffect } from "react";
import { hexToHslComponents } from "../lib/utils";

const COLOR_KEY = "primaryColor";

export const usePersistedColor = (initialColor: string) => {
  const [color, setColorState] = useState(() => {
    if (typeof window !== "undefined") {
      const storedColor = localStorage.getItem(COLOR_KEY);
      return storedColor || initialColor;
    }
    return initialColor;
  });

  // Function to update state and localStorage
  const setColor = useCallback((newColor: string) => {
    setColorState(newColor);
    if (typeof window !== "undefined") {
      localStorage.setItem(COLOR_KEY, newColor);
    }
  }, []);

  // Effect to apply the color as CSS variable for global themeing
  useEffect(() => {
    if (typeof document !== "undefined" && color) {
      const hslComponents = hexToHslComponents(color);
      // Set the CSS variables used by shadcn/tailwind to customize primary color
      document.documentElement.style.setProperty("--primary", hslComponents);
      document.documentElement.style.setProperty("--ring", hslComponents);
      document.documentElement.style.setProperty("--accent", hslComponents);
      document.documentElement.style.setProperty("--neural-glow", hslComponents);
      // Fallback/direct color setting, though --primary should be sufficient
      document.documentElement.style.setProperty("--primary-color", color);
    }
  }, [color]);

  return [color, setColor] as const;
};
