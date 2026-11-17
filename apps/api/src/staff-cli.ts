// pnpm staff:add <email> "<name>" <role>[,<role>…]
//
// Makes a staff account for the Estúdio, or gives an existing one a new
// password and more roles. There is no page for this on purpose: who is on the
// staff is decided by whoever holds the server.
//
// The password is read from STAFF_PASSWORD when it is set. Otherwise one is
// made here and printed once: it is kept nowhere else, only its salted hash.
//
// Roles: moderador, live_ops, economy, world_builder, support, platform_admin
// (platform_admin may do what any role may).

import { randomBytes } from "node:crypto";
import { STAFF_ROLES, audit, connect, putStaff, type StaffRole } from "@nzila/db";
import { hashPassword } from "./linking.ts";

const [email, name, rolesAsked] = process.argv.slice(2);
const roles = (rolesAsked ?? "").split(",").map((role) => role.trim()).filter(Boolean);
const unknown = roles.filter((role) => !STAFF_ROLES.includes(role as StaffRole));
if (!email || !/^\S+@\S+$/.test(email) || !name || roles.length === 0 || unknown.length > 0) {
  if (unknown.length > 0) console.error(`staff: no such role: ${unknown.join(", ")}`);
  console.error(`usage: pnpm staff:add <email> "<name>" <role>[,<role>…]\nroles: ${STAFF_ROLES.join(", ")}`);
  process.exit(2);
}
const given = process.env.STAFF_PASSWORD;
if (given !== undefined && given.length < 12) {
  console.error("staff: STAFF_PASSWORD must be twelve characters or more");
  process.exit(2);
}
const password = given ?? randomBytes(15).toString("base64url");
const sql = connect(undefined, 1);
try {
  const id = await putStaff(sql, { email, name, passwordHash: await hashPassword(password), roles: roles as StaffRole[] });
  await audit.log(sql, { actorKind: "system", actorId: "staff-cli", kind: "staff.put", subjectKind: "staff", subjectId: id, reason: `account made or renewed from the server, roles: ${roles.join(", ")}` });
  console.log(`staff: ${email.trim().toLowerCase()} may sign in to the Estúdio as ${roles.join(", ")}.`);
  if (given === undefined) console.log(`staff: password, shown this once: ${password}`);
} finally {
  await sql.end();
}
