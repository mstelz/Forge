import { db } from "../src/db/client.js";
import { exercises, equipment } from "../src/db/schema.js";

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

  // Extract unique equipment names from dataset
  const datasetEquipments = Array.from(
    new Set(data.map((e: any) => e.equipment).filter(Boolean))
  ) as string[];

  // Fetch existing equipment from the DB
  const existingEquipmentRows = await db.select().from(equipment);
  const equipMap = new Map<string, string>();
  for (const eq of existingEquipmentRows) {
    equipMap.set(eq.name.toLowerCase(), eq.id);
  }

  // Find equipment that needs to be inserted
  const newEquipments = [];
  for (const eqName of datasetEquipments) {
    const lowerName = eqName.toLowerCase();
    if (!equipMap.has(lowerName)) {
      const newId = crypto.randomUUID();
      equipMap.set(lowerName, newId);
      newEquipments.push({
        id: newId,
        name: eqName,
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

  console.log("Preparing exercise records...");
  const records = data.map((ex: any) => {
    const lowerEqName = (ex.equipment || "").toLowerCase();
    const eqId = equipMap.get(lowerEqName);
    const primaryMuscles = Array.from(
      new Set([ex.target, ex.muscle_group].filter(Boolean))
    );
    const instructions = ex.instruction_steps?.en
      ? JSON.stringify(ex.instruction_steps.en)
      : null;
    const description = ex.instructions?.en || null;
    const videoUrls = ex.gif_url
      ? JSON.stringify([
          `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/${ex.gif_url}`,
        ])
      : "[]";
    const type = ex.category === "cardio" ? "cardio" : "strength";

    return {
      id: `seed-${ex.id}`,
      name: ex.name,
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

  console.log("Inserting exercises in chunks...");
  const chunkSize = 100;
  let insertedCount = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    // onConflictDoNothing ensures we can run this script multiple times safely
    await db.insert(exercises).values(chunk).onConflictDoNothing();
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
