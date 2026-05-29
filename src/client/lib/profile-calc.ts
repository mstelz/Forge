import type { Profile } from "../../shared/profile";

export function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function bmiCategory(bmiVal: number): string {
  if (bmiVal < 18.5) return "Underweight";
  if (bmiVal < 25) return "Normal";
  if (bmiVal < 30) return "Overweight";
  return "Obese";
}

// Mifflin-St Jeor equation
export function bmr(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: Profile["sex"],
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  // "other" or null: use average
  return base - 78;
}

const ACTIVITY_MULTIPLIERS: Record<NonNullable<Profile["activityLevel"]>, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export function tdee(bmrVal: number, activityLevel: Profile["activityLevel"]): number | null {
  if (!activityLevel) return null;
  return bmrVal * ACTIVITY_MULTIPLIERS[activityLevel];
}

// Format height as "X ft Y in" from cm, for display
export function cmToFtIn(cm: number): string {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn % 12);
  return `${ft}′${inches}″`;
}
