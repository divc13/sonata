import { describe, expect, it } from "bun:test";

import { localDevLogin, localDevLoginMessage } from "~/lib/local-dev-login";

const user = { email: "local@example.test", password: "LocalDev123!" };
const local = "postgresql://u:p@127.0.0.1:5432/db";

function run(env: { DATABASE_URL?: string; NODE_ENV?: string }) {
  let read = false;
  const message = localDevLoginMessage(env, () => {
    read = true;
    return user;
  });
  return { message, read };
}

describe("localDevLogin", () => {
  it("returns the fixture's credentials for a loopback database", () => {
    expect(localDevLogin({ DATABASE_URL: local }, () => user)).toEqual(user);
  });

  it("reads nothing, and returns null, for a remote database or production", () => {
    for (const env of [
      { DATABASE_URL: "postgresql://u:p@db.example.com:5432/db" },
      { DATABASE_URL: local, NODE_ENV: "production" },
      { DATABASE_URL: undefined },
    ]) {
      let read = false;
      expect(
        localDevLogin(env, () => {
          read = true;
          return user;
        }),
      ).toBeNull();
      expect(read).toBe(false);
    }
  });
});

describe("localDevLoginMessage", () => {
  it("shows the email and password for a loopback database in development", () => {
    const { message } = run({ DATABASE_URL: local, NODE_ENV: "development" });
    expect(message).toContain("local@example.test");
    expect(message).toContain("LocalDev123!");
  });

  it("also shows them when NODE_ENV is unset or test", () => {
    expect(run({ DATABASE_URL: local }).message).not.toBeNull();
    expect(
      run({ DATABASE_URL: local, NODE_ENV: "test" }).message,
    ).not.toBeNull();
  });

  it("stays silent in production, even for a loopback database", () => {
    expect(run({ DATABASE_URL: local, NODE_ENV: "production" })).toEqual({
      message: null,
      read: false,
    });
  });

  it("stays silent for a non-loopback or missing database", () => {
    for (const DATABASE_URL of [
      "postgresql://u:p@db.example.com:5432/db",
      "postgresql://u:p@localhost.evil.com:5432/db",
      "postgresql://u:p@127.0.0.1:5432/db?host=db.example.com",
      "not a url",
      "",
      undefined,
    ]) {
      expect(run({ DATABASE_URL, NODE_ENV: "development" })).toEqual({
        message: null,
        read: false,
      });
    }
  });
});
