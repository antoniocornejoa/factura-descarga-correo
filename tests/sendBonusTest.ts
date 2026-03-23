import fs from "fs";
import path from "path";
import { getUncachableGmailClient } from "../src/mastra/tools/gmailClient";

async function main() {
  const filePath = "/tmp/invoices/evaluacion_bonos_2026-02-27.xlsx";
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
  }

  const gmail = await getUncachableGmailClient();
  const fileContent = fs.readFileSync(filePath);
  const base64File = fileContent.toString("base64");
  const fileName = path.basename(filePath);

  const chileStr = new Date().toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Santiago",
  });

  const subject = `[PRUEBA] Evaluacion Mensual de Bonos - ${chileStr}`;
  const body = [
    "Estimado,",
    "",
    "Se adjunta la evaluacion mensual de bonos por responsable.",
    "",
    "Evaluacion de bonos - 3 pagan ($150.000 c/u = $450.000), 15 no pagan.",
    "",
    "El archivo adjunto contiene el detalle completo por responsable y por centro.",
    "",
    "Saludos cordiales.",
  ].join("\n");

  const boundary = "boundary_bonus_test_" + Date.now();
  const mimeMessage = [
    "To: acornejo@cindependencia.cl",
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body).toString("base64"),
    "",
    `--${boundary}`,
    "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    `Content-Disposition: attachment; filename="${fileName}"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64File,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const encodedMessage = Buffer.from(mimeMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });

  console.log("Bonus email sent to acornejo@cindependencia.cl! Message ID:", result.data.id);
}

main().catch(console.error);
