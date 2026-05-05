import { Hono } from "hono";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { equipment } from "../../db/schema";
import {
  EquipmentCreateInput,
  EquipmentUpdateInput,
  type Equipment,
} from "../../shared";
import {
  idConflict,
  nameConflict,
  notFound,
  validationError,
} from "../lib/errors";

export const equipmentRoute = new Hono();

const findByLowerName = async (name: string, excludeId?: string) => {
  const lower = name.toLowerCase();
  const condition = excludeId
    ? and(sql`lower(${equipment.name}) = ${lower}`, ne(equipment.id, excludeId))
    : sql`lower(${equipment.name}) = ${lower}`;
  return db.select().from(equipment).where(condition).get();
};

equipmentRoute.get("/", async (c) => {
  const rows = await db.select().from(equipment).all();
  return c.json({ equipment: rows });
});

equipmentRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await db.select().from(equipment).where(eq(equipment.id, id)).get();
  if (!row) return notFound(c);
  return c.json(row);
});

equipmentRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = EquipmentCreateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const now = Date.now();
  const input = parsed.data;
  const item: Equipment = {
    id: input.id,
    name: input.name,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };

  const existingId = await db
    .select({ id: equipment.id })
    .from(equipment)
    .where(eq(equipment.id, item.id))
    .get();
  if (existingId) return idConflict(c, item.id);

  const existingName = await findByLowerName(item.name);
  if (existingName) return nameConflict(c, item.name);

  await db.insert(equipment).values(item).run();
  return c.json(item, 201);
});

equipmentRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = EquipmentUpdateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const existing = await db.select().from(equipment).where(eq(equipment.id, id)).get();
  if (!existing) return notFound(c);

  const incoming = parsed.data;
  const clash = await findByLowerName(incoming.name, id);
  if (clash) return nameConflict(c, incoming.name);

  const updated: Equipment = {
    ...incoming,
    id,
    updatedAt: Math.max(incoming.updatedAt, Date.now()),
  };

  await db.update(equipment).set(updated).where(eq(equipment.id, id)).run();
  return c.json(updated);
});

equipmentRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(equipment).where(eq(equipment.id, id)).run();
  return c.body(null, 204);
});
