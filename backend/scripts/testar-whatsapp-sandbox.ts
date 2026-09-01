// Testa o envio real de uma mensagem de template pela WhatsApp Cloud API,
// usando o número de teste gratuito que a Meta provisiona automaticamente
// em App Dashboard > WhatsApp > API Setup (não precisa de Business
// Verification nem de Embedded Signup para esse teste).
// Uso: cd backend && npm run test:whatsapp-sandbox
//
// Onde pegar os três valores pedidos, em developers.facebook.com > seu app
// > WhatsApp > API Setup:
//   - phone_number_id: campo "Phone number ID" (não é o número em si)
//   - access token: campo "Temporary access token" (validade 24h)
//   - destino: um número da lista "To" já verificado nessa tela (até 5
//     grátis, adicione o seu em "Manage phone number list" se não estiver lá)

import { createInterface } from "node:readline/promises";

import { sendTemplateMessage } from "../src/whatsapp/client";
import { toWaId } from "../src/whatsapp/payloadBuilders";
import { WhatsAppClientError } from "../src/whatsapp/errors";

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const phoneNumberId = (await rl.question("phone_number_id (API Setup > Phone number ID): ")).trim();
  const token = (await rl.question("Temporary access token (API Setup > Temporary access token): ")).trim();
  const destino = (await rl.question("Número de destino, formato E.164 (ex.: +5511999999999): ")).trim();

  if (!phoneNumberId || !token || !destino) {
    console.log("ERRO: todos os três campos são obrigatórios.");
    rl.close();
    process.exit(1);
  }

  let waId: string;
  try {
    waId = toWaId(destino);
  } catch (error) {
    console.log(`ERRO: ${(error as Error).message}`);
    rl.close();
    process.exit(1);
  }

  console.log(`\nEnviando template "hello_world" (en_US, sem parâmetros) para ${destino}...`);
  try {
    const response = await sendTemplateMessage(phoneNumberId, token, {
      to: waId,
      templateName: "hello_world",
      languageCode: "en_US",
    });
    console.log("\nOK — a Meta aceitou a mensagem:");
    console.log(`  message id: ${response.messages[0]?.id}`);
    console.log(`  wa_id do destinatário: ${response.contacts[0]?.wa_id}`);
    console.log("\nConfira o WhatsApp do número de destino para ver a mensagem chegar.");
  } catch (error) {
    if (error instanceof WhatsAppClientError) {
      console.log(`\nERRO da Meta (HTTP ${error.statusCode ?? "?"}, code=${error.metaCode ?? "?"}): ${error.message}`);
      if (error.payload) console.log(JSON.stringify(error.payload, null, 2));
    } else {
      console.log("\nERRO inesperado:", error);
    }
    rl.close();
    process.exit(1);
  }

  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
