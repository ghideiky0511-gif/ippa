// Credencial de serviço do bippa-catalogo perante o bippa-messaging: uma API
// key estática (bippa_<key_id>_<segredo>), emitida manualmente pelo
// bippa-auth via POST /admin/api-keys (bootstrap token) -- ver
// backend/docs/whatsapp-bippa-messaging.md. Isso SUBSTITUI o esquema
// anterior (client_credentials/OAuth trocado em tempo de execução contra
// {BIPPA_AUTH_URL}/oauth/token, com cache em memória de processo); o
// bippa-auth passou a emitir a credencial pronta, sem exchange nenhum, então
// não há mais token para cachear -- só ler a variável de ambiente.
//
// ATENÇÃO (2026-09-03): o bippa-messaging ainda NÃO valida
// `X-Bippa-Api-Key` -- hoje ele só aceita o JWT antigo assinado com
// BIPPA_AUTH_JWT_SIGNING_KEY (ver POST /internal/api-keys/validate no
// bippa-auth, que o bippa-messaging ainda não chama). Até esse lado ser
// ligado pelo time do bippa-messaging, toda chamada autenticada por esta key
// continua recebendo 401 -- isso é esperado e não indica erro de
// configuração deste repositório.
//
// Escopos da key: messaging:write (enviar mensagem, ver
// whatsappNotificationService.ts) e messaging:control (operações
// administrativas do Catálogo sobre o próprio tenant -- instalar app,
// iniciar onboarding, listar conexões, associar sender profile).

/** API key de serviço do Catálogo perante o bippa-messaging (header X-Bippa-Api-Key). */
export function getApiKey(): string {
    const apiKey = process.env.BIPPA_CATALOGO_API_KEY;
    if (!apiKey) {
        throw new Error("BIPPA_CATALOGO_API_KEY não configurada -- necessária para autenticar o Catálogo perante o bippa-messaging.");
    }
    return apiKey;
}
