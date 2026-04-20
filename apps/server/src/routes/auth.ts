import { Hono } from "hono";
import { finishLogin, getCurrentUser, logout, startLogin } from "../services/auth";

export const auth = new Hono();

auth.get("/login", (c) => startLogin(c));
auth.get("/callback", (c) => finishLogin(c));
auth.post("/logout", (c) => logout(c));
auth.get("/me", (c) => {
  const user = getCurrentUser(c);
  return c.json({ user });
});
