import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser, User } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

function roleForEmail(email?: string | null): "user" | "admin" {
  if (email && env.adminEmails.includes(email.toLowerCase())) {
    return "admin";
  }
  return "user";
}

export async function findUserById(id: number): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  return rows.at(0);
}

export async function findUserByEmail(
  email: string,
): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1);
  return rows.at(0);
}

export async function findUserByTelegramId(
  telegramId: string,
): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.telegramId, telegramId))
    .limit(1);
  return rows.at(0);
}

export async function findUserByGoogleId(
  googleId: string,
): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.googleId, googleId))
    .limit(1);
  return rows.at(0);
}

export async function createUser(
  data: Omit<InsertUser, "role"> & { role?: "user" | "admin" },
): Promise<User> {
  const values: InsertUser = {
    ...data,
    email: data.email ? data.email.toLowerCase() : data.email,
    role: data.role ?? roleForEmail(data.email),
  };
  await getDb().insert(schema.users).values(values);
  const created = data.email
    ? await findUserByEmail(data.email)
    : data.telegramId
      ? await findUserByTelegramId(data.telegramId)
      : data.googleId
        ? await findUserByGoogleId(data.googleId)
        : undefined;
  if (!created) {
    throw new Error("Failed to create user");
  }
  return created;
}

export async function touchLastSignIn(id: number) {
  await getDb()
    .update(schema.users)
    .set({ lastSignInAt: new Date() })
    .where(eq(schema.users.id, id));
}

export async function linkTelegramToUser(
  userId: number,
  telegramId: string,
  telegramUsername?: string,
) {
  await getDb()
    .update(schema.users)
    .set({
      telegramId,
      telegramUsername: telegramUsername ?? null,
    })
    .where(eq(schema.users.id, userId));
}
