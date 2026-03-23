import { Agent } from "@mastra/core/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { requestInvoiceExportTool } from "../tools/downloadInvoicesTool";
import { processExcelTool } from "../tools/processExcelTool";
import { sendEmailTool } from "../tools/sendEmailTool";

const openai = createOpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export const invoiceAgent = new Agent({
  name: "Invoice Control Agent",
  id: "invoiceAgent",
  instructions: `
    Eres un agente de automatización encargado de gestionar el control de facturas.
    
    Tu trabajo es:
    1. Descargar las facturas pendientes desde iconstruye.com (filtrando por Estado de Asociación)
    2. Procesar el archivo Excel filtrando las facturas pendientes por Estado Documento
    3. Enviar un correo electrónico con el archivo procesado
    
    Cuando proceses las facturas:
    - Filtra por "Estado Asociación": "No Asociada" y "Parcialmente Asociada"
    - Filtra por "Estado Documento": "Ingresada" y "Aprobada"
    
    Siempre reporta los resultados de cada paso de forma clara.
  `,
  model: openai("gpt-4o"),
  tools: {
    requestInvoiceExportTool,
    processExcelTool,
    sendEmailTool,
  },
});
