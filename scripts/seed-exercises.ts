import { db } from "../src/db/client.js";
import { exercises, equipment } from "../src/db/schema.js";
import { sql, eq } from "drizzle-orm";

async function seed() {
  console.log("Fetching exercises dataset...");
  const res = await fetch(
    "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json"
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch dataset: ${res.statusText}`);
  }
  const data = await res.json();

  console.log(`Found ${data.length} exercises. Processing equipment...`);

  // Equipment cleanup mapping
  const datasetEquipments = Array.from(
    new Set(data.map((e: any) => {
      let n = e.equipment?.toLowerCase() || "";
      if (n === "dumbbell") return "dumbbells";
      if (n === "body weight") return "bodyweight";
      if (n === "bench") return null;
      return n;
    }).filter(Boolean))
  ) as string[];

  // Fetch existing equipment from the DB
  const existingEquipmentRows = await db.select().from(equipment);
  const equipMap = new Map<string, string>();
  for (const eqRow of existingEquipmentRows) {
    equipMap.set(eqRow.name.toLowerCase(), eqRow.id);
  }

  // Find equipment that needs to be inserted
  const newEquipments = [];
  for (const eqName of datasetEquipments) {
    if (!equipMap.has(eqName)) {
      const newId = crypto.randomUUID();
      equipMap.set(eqName, newId);
      newEquipments.push({
        id: newId,
        name: eqName.charAt(0).toUpperCase() + eqName.slice(1),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  // Insert new equipment
  if (newEquipments.length > 0) {
    console.log(`Inserting ${newEquipments.length} new equipment types...`);
    await db.insert(equipment).values(newEquipments);
  }

  // Capitalize existing equipment
  console.log("Checking for existing equipment that needs capitalization...");
  for (const row of existingEquipmentRows) {
    const capitalized = row.name.charAt(0).toUpperCase() + row.name.slice(1);
    if (row.name !== capitalized) {
      await db.update(equipment)
        .set({ name: capitalized, updatedAt: Date.now() })
        .where(eq(equipment.id, row.id));
    }
  }

  console.log("Fetching existing curated exercises to avoid duplicates...");
  const allExercises = await db.select().from(exercises);
  const curatedNames = new Set(
    allExercises
      .filter((ex) => !ex.id.startsWith("seed-"))
      .map((ex) => ex.name.toLowerCase())
  );

  console.log("Preparing exercise records...");
  const records = data
    .filter((ex: any) => {
      const name = ex.name ? ex.name.toLowerCase() : "";
      return !curatedNames.has(name); // skip if we already have a curated version
    })
    .map((ex: any) => {
      let lowerEqName = (ex.equipment || "").toLowerCase();
      if (lowerEqName === "dumbbell") lowerEqName = "dumbbells";
      if (lowerEqName === "body weight") lowerEqName = "bodyweight";
      if (lowerEqName === "bench") lowerEqName = "barbell"; // fallback for bench

      const eqId = equipMap.get(lowerEqName);
      const primaryMuscles = Array.from(
        new Set([ex.target, ex.muscle_group].filter(Boolean))
      );
      let instructions = ex.instruction_steps?.en
        ? ex.instruction_steps.en.join("\n")
        : null;
      let description = ex.instructions?.en || null;
      
      // If description is practically identical to instructions, only keep the instructions
      if (description && instructions) {
        const descText = description.replace(/\s+/g, "");
        const instText = instructions.replace(/\s+/g, "");
        if (descText === instText) {
          description = null;
        }
      }
      const videoUrls = ex.gif_url
        ? JSON.stringify([
            `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/${ex.gif_url}`,
          ])
        : "[]";
      const type = ex.category === "cardio" ? "cardio" : "strength";
      const name = ex.name ? ex.name.charAt(0).toUpperCase() + ex.name.slice(1) : ex.name;

      return {
        id: `seed-${ex.id}`,
        name,
        type,
        primaryMuscles: JSON.stringify(primaryMuscles),
        secondaryMuscles: JSON.stringify(ex.secondary_muscles || []),
        equipmentIds: eqId ? JSON.stringify([eqId]) : "[]",
        aliases: "[]",
        description,
        instructions,
        videoUrls,
        notes: ex.attribution ? `Attribution: ${ex.attribution}` : null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

  console.log(`Inserting ${records.length} deduplicated exercises in chunks...`);
  const chunkSize = 100;
  let insertedCount = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    await db.insert(exercises).values(chunk).onConflictDoUpdate({
      target: exercises.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        instructions: sql`excluded.instructions`,
        equipmentIds: sql`excluded.equipment_ids`,
        updatedAt: Date.now(),
      }
    });
    insertedCount += chunk.length;
    console.log(`Processed ${insertedCount} / ${records.length} exercises`);
  }

  console.log("Seeding complete! You can view your updated database.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
