import { formatBRL } from './format';
import { errorMeta, logger } from "@/lib/logger";

// E-mails transacionais (cadastro confirmado, link de pagamento, pedido
// confirmado, ...) via Resend (https://resend.com/docs/api-reference/emails/send-email)
// — chamado direto por fetch em vez do SDK deles, pra não somar uma
// dependência nova só por causa de um POST.
//
// "Colocar pra rodar depois" (combinado com o usuário): sem RESEND_API_KEY
// no ambiente, sendEmail só loga no console e não tenta enviar — a
// estrutura inteira (módulo, templates, todos os pontos que disparam)
// já fica pronta, ligar de verdade é só configurar a variável de ambiente
// (e trocar EMAIL_FROM por um remetente com domínio verificado) quando o
// domínio da loja estiver configurado no Resend.
//
// Sem multi-tenant real ainda por aqui — `storeName` é passado por quem
// chama (hoje sempre o default abaixo); quando o remetente vier do tenant
// da requisição, é só parar de usar o default.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEFAULT_STORE_NAME = 'Loja';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  storeName: string;
}

export type EmailDeliveryStatus = "sent" | "not_configured" | "failed";

async function sendEmail({ to, subject, html, storeName }: SendEmailParams): Promise<EmailDeliveryStatus> {
  if (!RESEND_API_KEY) {
    logger.warn("email", "Envio não realizado: RESEND_API_KEY não configurada", { subject, storeName });
    return "not_configured";
  }
  const from = process.env.EMAIL_FROM || `${storeName} <onboarding@resend.dev>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      logger.error("email", "Resend recusou o envio", { statusCode: res.status, subject, storeName });
      return "failed";
    }
    logger.info("email", "E-mail enviado ao provedor", { subject, storeName, statusCode: res.status });
    return "sent";
  } catch (err) {
    // Nunca deixa um problema de e-mail derrubar o fluxo que disparou o
    // envio (cadastro, link, pedido) — mesmo espírito "fire-and-forget"
    // já usado pros outros fetches não-críticos deste projeto.
    logger.error("email", "Falha ao chamar o provedor de e-mail", { subject, storeName, ...errorMeta(err) });
    return "failed";
  }
}

// Casca visual comum — mínima de propósito (sem CSS externo, precisa
// funcionar em qualquer cliente de e-mail). Sem logo por enquanto (nenhum
// tenant tem uma configurada ainda) — sempre o nome da loja em texto.
function layout(storeName: string, title: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #2a2a2a;">
      <h1 style="font-size: 18px; margin: 0 0 16px;">${storeName}</h1>
      <h2 style="font-size: 16px; margin: 0 0 12px;">${title}</h2>
      ${bodyHtml}
      <p style="font-size: 12px; color: #767676; margin-top: 24px;">${storeName}</p>
    </div>
  `;
}

// Disparado por POST /api/auth/signup (autocadastro da cliente) e por
// POST /api/clients/[id]/create-login (vendedora criando login pra uma
// cliente que só tinha cadastro rápido) — os dois são "conta criada", só
// muda quem preencheu o formulário.
export async function sendSignupConfirmationEmail(params: { to: string; name: string; storeName?: string }): Promise<void> {
  const storeName = params.storeName || DEFAULT_STORE_NAME;
  await sendEmail({
    to: params.to,
    storeName,
    subject: `Cadastro confirmado — ${storeName}`,
    html: layout(
      storeName,
      'Cadastro confirmado',
      `<p>Olá, ${params.name}! Seu cadastro na ${storeName} foi criado com sucesso — já dá pra entrar com esse e-mail e acompanhar seus pedidos.</p>`
    ),
  });
}

/** Primeiro acesso: a conta só é criada depois do clique neste link. */
export async function sendFirstAccessConfirmationEmail(params: {
  to: string; name: string; link: string; storeName?: string;
}): Promise<EmailDeliveryStatus> {
  const storeName = params.storeName || DEFAULT_STORE_NAME;
  return sendEmail({
    to: params.to,
    storeName,
    subject: `Confirme sua conta — ${storeName}`,
    html: layout(
      storeName,
      'Confirme seu primeiro acesso',
      `<p>Olá, ${params.name}! Recebemos uma solicitação para criar sua senha.</p>
       <p><a href="${params.link}" style="display: inline-block; background: #c2185b; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">Confirmar minha conta</a></p>
       <p style="font-size: 13px; color: #767676;">Este link expira em 30 minutos. Se não foi você, ignore este e-mail.</p>`
    ),
  });
}

// Disparado por POST /api/sessions/[id]/payment-link, logo depois da
// vendedora gerar (ou reaproveitar) o token — ver
// web/src/app/pagar/[token]/page.tsx pra onde o link leva.
export async function sendPaymentLinkEmail(params: { to: string; name: string; link: string; storeName?: string }): Promise<void> {
  const storeName = params.storeName || DEFAULT_STORE_NAME;
  await sendEmail({
    to: params.to,
    storeName,
    subject: `Link de pagamento do seu pedido — ${storeName}`,
    html: layout(
      storeName,
      'Seu pedido está pronto pra pagamento',
      `<p>Olá, ${params.name}! A vendedora montou seu pedido — falta só confirmar o pagamento.</p>
       <p><a href="${params.link}" style="display: inline-block; background: #2f7a6c; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">Finalizar pagamento</a></p>
       <p style="font-size: 13px; color: #767676;">Ou copie e cole: ${params.link}</p>`
    ),
  });
}

// Disparado por POST /api/pay/[token] (pagamento pelo link) e por
// POST /api/orders (cliente finaliza sozinha, com ou sem talão) — os dois
// terminam em Order gravado, só muda o caminho até ali.
export async function sendOrderConfirmedEmail(params: {
  to: string; name: string; total: number; orderNumber: number; link: string; storeName?: string;
}): Promise<void> {
  const storeName = params.storeName || DEFAULT_STORE_NAME;
  await sendEmail({
    to: params.to,
    storeName,
    subject: `Pedido confirmado — ${storeName}`,
    html: layout(
      storeName,
      'Pedido confirmado',
      `<p>Olá, ${params.name}! Seu pedido foi confirmado.</p>
       <p><strong>Total:</strong> ${formatBRL(params.total)}</p>
       <p><a href="${params.link}" style="display: inline-block; background: #2f7a6c; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">Conferir meu pedido</a></p>
       <p style="font-size: 13px; color: #767676;">Pedido nº ${params.orderNumber}</p>
       <p style="font-size: 13px; color: #767676;">Ou copie e cole: ${params.link}</p>`
    ),
  });
}
