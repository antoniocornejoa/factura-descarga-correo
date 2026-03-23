import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { registerApiRoute } from "@mastra/core/server";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import pg from "pg";
import { createPool } from "./tools/dbPool";
import { adminHtml } from "./adminHtml";
import { responsablesHtml } from "./responsablesHtml";

import { sharedPostgresStorage } from "./storage";
import { inngest, inngestServe } from "./inngest";

import { registerCronTrigger } from "../triggers/cronTriggers";
import { invoiceControlWorkflow } from "./workflows/workflow";
import { invoiceAgent } from "./agents/agent";

class ProductionPinoLogger extends MastraLogger {
  protected logger: pino.Logger;

  constructor(
    options: {
      name?: string;
      level?: LogLevel;
    } = {},
  ) {
    super(options);

    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label: string, _number: number) => ({
          level: label,
        }),
      },
      timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    });
  }

  debug(message: string, args: Record<string, any> = {}): void {
    this.logger.debug(args, message);
  }

  info(message: string, args: Record<string, any> = {}): void {
    this.logger.info(args, message);
  }

  warn(message: string, args: Record<string, any> = {}): void {
    this.logger.warn(args, message);
  }

  error(message: string, args: Record<string, any> = {}): void {
    this.logger.error(args, message);
  }
}

export const mastra = new Mastra({
  storage: sharedPostgresStorage,
  workflows: { invoiceControlWorkflow },
  agents: { invoiceAgent },
  bundler: {
    // A few dependencies are not properly picked up by
    // the bundler if they are not added directly to the
    // entrypoint.
    externals: [
      "@slack/web-api",
      "inngest",
      "inngest/hono",
      "hono",
      "hono/streaming",
      "puppeteer",
      "exceljs",
      "googleapis",
      "pg",
      "bufferutil",
      "utf-8-validate",
    ],
    // sourcemaps are good for debugging.
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: parseInt(process.env.PORT || "5000", 10),
    middleware: [
      async (c, next) => {
        const p = new URL(c.req.url).pathname;
        if (p === "/" || p === "" || p === "/health" || p === "/api" || p === "/api/") {
          return c.text("OK", 200);
        }
        const mastra = c.get("mastra");
        const logger = mastra?.getLogger();
        logger?.debug("[Request]", { method: c.req.method, url: c.req.url });
        try {
          await next();
        } catch (error) {
          logger?.error("[Response]", {
            method: c.req.method,
            url: c.req.url,
            error,
          });
          if (error instanceof MastraError) {
            if (error.id === "AGENT_MEMORY_MISSING_RESOURCE_ID") {
              // This is typically a non-retirable error. It means that the request was not
              // setup correctly to pass in the necessary parameters.
              throw new NonRetriableError(error.message, { cause: error });
            }
          } else if (error instanceof z.ZodError) {
            // Validation errors are never retriable.
            throw new NonRetriableError(error.message, { cause: error });
          }

          throw error;
        }
      },
    ],
    apiRoutes: [
      {
        path: "/api/inngest",
        method: "ALL",
        createHandler: async ({ mastra }) => inngestServe({ mastra, inngest }),
      },

      registerApiRoute("/", {
        method: "GET",
        handler: async (c) => {
          return c.text("OK", 200);
        },
      }),

      registerApiRoute("/health", {
        method: "GET",
        handler: async (c) => {
          return c.text("OK", 200);
        },
      }),

      registerApiRoute("/admin", {
        method: "GET",
        handler: async (c) => {
          return c.html(adminHtml);
        },
      }),

      registerApiRoute("/cost-centers", {
        method: "GET",
        handler: async (c) => {
          const pool = createPool();
          try {
            const result = await pool.query("SELECT id, name, active, created_at FROM cost_centers ORDER BY name");
            return c.json(result.rows);
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/cost-centers", {
        method: "POST",
        handler: async (c) => {
          const body = await c.req.json();
          const name = body.name?.trim();
          if (!name) {
            return c.json({ message: "Nombre es requerido" }, 400);
          }
          const pool = createPool();
          try {
            const existing = await pool.query("SELECT id FROM cost_centers WHERE name = $1", [name]);
            if (existing.rows.length > 0) {
              return c.json({ message: "Este centro ya existe" }, 409);
            }
            const result = await pool.query(
              "INSERT INTO cost_centers (name, active) VALUES ($1, true) RETURNING id, name, active, created_at",
              [name]
            );
            return c.json(result.rows[0], 201);
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/cost-centers/:id", {
        method: "PATCH",
        handler: async (c) => {
          const id = c.req.param("id");
          const body = await c.req.json();
          const pool = createPool();
          try {
            const result = await pool.query(
              "UPDATE cost_centers SET active = $1 WHERE id = $2 RETURNING id, name, active",
              [body.active, id]
            );
            if (result.rows.length === 0) {
              return c.json({ message: "No encontrado" }, 404);
            }
            return c.json(result.rows[0]);
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/cost-centers/:id", {
        method: "DELETE",
        handler: async (c) => {
          const id = c.req.param("id");
          const pool = createPool();
          try {
            await pool.query("DELETE FROM cost_centers WHERE id = $1", [id]);
            return c.json({ success: true });
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/admin/responsables", {
        method: "GET",
        handler: async (c) => {
          return c.html(responsablesHtml);
        },
      }),

      registerApiRoute("/responsables", {
        method: "GET",
        handler: async (c) => {
          const pool = createPool();
          try {
            const result = await pool.query("SELECT id, name, email, created_at FROM responsables ORDER BY name");
            return c.json(result.rows);
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/responsables", {
        method: "POST",
        handler: async (c) => {
          const body = await c.req.json();
          const name = body.name?.trim();
          const email = body.email?.trim()?.toLowerCase();
          if (!name || !email) {
            return c.json({ message: "Nombre y email son requeridos" }, 400);
          }
          const pool = createPool();
          try {
            const existing = await pool.query("SELECT id FROM responsables WHERE email = $1", [email]);
            if (existing.rows.length > 0) {
              return c.json({ message: "Este email ya esta registrado" }, 409);
            }
            const result = await pool.query(
              "INSERT INTO responsables (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at",
              [name, email]
            );
            return c.json(result.rows[0], 201);
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/responsables/:id", {
        method: "PATCH",
        handler: async (c) => {
          const id = c.req.param("id");
          const body = await c.req.json();
          const pool = createPool();
          try {
            const updates: string[] = [];
            const values: any[] = [];
            let idx = 1;
            if (body.name !== undefined) { updates.push(`name = $${idx++}`); values.push(body.name.trim()); }
            if (body.email !== undefined) { updates.push(`email = $${idx++}`); values.push(body.email.trim().toLowerCase()); }
            if (updates.length === 0) return c.json({ message: "Nada que actualizar" }, 400);
            values.push(id);
            const result = await pool.query(
              `UPDATE responsables SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, name, email`,
              values
            );
            if (result.rows.length === 0) return c.json({ message: "No encontrado" }, 404);
            return c.json(result.rows[0]);
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/responsables/:id", {
        method: "DELETE",
        handler: async (c) => {
          const id = c.req.param("id");
          const pool = createPool();
          try {
            await pool.query("UPDATE cost_center_responsables SET responsable_id = NULL WHERE responsable_id = $1", [id]);
            await pool.query("DELETE FROM responsables WHERE id = $1", [id]);
            return c.json({ success: true });
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/responsables/centers", {
        method: "GET",
        handler: async (c) => {
          const pool = createPool();
          try {
            const result = await pool.query(
              "SELECT id, center_code, center_name, group_name, responsable_id FROM cost_center_responsables ORDER BY center_code"
            );
            return c.json(result.rows);
          } finally {
            await pool.end();
          }
        },
      }),

      registerApiRoute("/responsables/centers/:id", {
        method: "PATCH",
        handler: async (c) => {
          const id = c.req.param("id");
          const body = await c.req.json();
          const pool = createPool();
          try {
            const result = await pool.query(
              "UPDATE cost_center_responsables SET responsable_id = $1 WHERE id = $2 RETURNING id, center_code, responsable_id",
              [body.responsable_id, id]
            );
            if (result.rows.length === 0) return c.json({ message: "No encontrado" }, 404);
            return c.json(result.rows[0]);
          } finally {
            await pool.end();
          }
        },
      }),
    ],
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({
          name: "Mastra",
          level: "info",
        })
      : new PinoLogger({
          name: "Mastra",
          level: "info",
        }),
});

registerCronTrigger({
  cronExpression: process.env.SCHEDULE_CRON_EXPRESSION || "0 23 * * *",
  workflow: invoiceControlWorkflow,
});

/*  Sanity check 1: Throw an error if there are more than 1 workflows.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.listWorkflows()).length > 1) {
  throw new Error(
    "More than 1 workflows found. Currently, more than 1 workflows are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}

/*  Sanity check 2: Throw an error if there are more than 1 agents.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.listAgents()).length > 1) {
  throw new Error(
    "More than 1 agents found. Currently, more than 1 agents are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}
