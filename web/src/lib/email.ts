import { CONFIG } from './config';
import { formatBRL } from './format';

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
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || `${CONFIG.storeName} <onboarding@resend.dev>`;

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`[email] (desligado — sem RESEND_API_KEY) enviaria "${subject}" pra ${to}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`[email] Resend recusou o envio pra ${to} (${res.status}):`, await res.text());
    }
  } catch (err) {
    // Nunca deixa um problema de e-mail derrubar o fluxo que disparou o
    // envio (cadastro, link, pedido) — mesmo espírito "fire-and-forget"
    // já usado pros outros fetches não-críticos deste projeto.
    console.error(`[email] erro ao enviar pra ${to}:`, err);
  }
}

// Casca visual comum — mínima de propósito (sem CSS externo, precisa
// funcionar em qualquer cliente de e-mail). Troque storeName/logoUrl em
// web/src/lib/config.ts e todo e-mail já sai com a marca certa.
function layout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #2a2a2a;">
      ${CONFIG.logoUrl ? `<img src="${CONFIG.logoUrl}" alt="${CONFIG.storeName}" style="max-height: 40px; margin-bottom: 16px;" />` : `<h1 style="font-size: 18px; margin: 0 0 16px;">${CONFIG.storeName}</h1>`}
      <h2 style="font-size: 16px; margin: 0 0 12px;">${title}</h2>
      ${bodyHtml}
      <p style="font-size: 12px; color: #767676; margin-top: 24px;">${CONFIG.storeName}</p>
    </div>
  `;
}

// Disparado por POST /api/auth/signup (autocadastro da cliente) e por
// POST /api/clients/[id]/create-login (vendedora criando login pra uma
// cliente que só tinha cadastro rápido) — os dois são "conta criada", só
// muda quem preencheu o formulário.
export async function sendSignupConfirmationEmail(params: { to: string; name: string }): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Cadastro confirmado — ${CONFIG.storeName}`,
    html: layout(
      'Cadastro confirmado',
      `<p>Olá, ${params.name}! Seu cadastro na ${CONFIG.storeName} foi criado com sucesso — já dá pra entrar com esse e-mail e acompanhar seus pedidos.</p>`
    ),
  });
}

// Disparado por POST /api/sessions/[id]/payment-link, logo depois da
// vendedora gerar (ou reaproveitar) o token — ver
// web/src/app/pagar/[token]/page.tsx pra onde o link leva.
export async function sendPaymentLinkEmail(params: { to: string; name: string; link: string }): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Link de pagamento do seu pedido — ${CONFIG.storeName}`,
    html: layout(
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
export async function sendOrderConfirmedEmail(params: { to: string; name: string; total: number; orderId: string }): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Pedido confirmado — ${CONFIG.storeName}`,
    html: layout(
      'Pedido confirmado',
      `<p>Olá, ${params.name}! Seu pedido foi confirmado.</p>
       <p><strong>Total:</strong> ${formatBRL(params.total)}</p>
       <p style="font-size: 13px; color: #767676;">Pedido nº ${params.orderId}</p>`
    ),
  });
}
