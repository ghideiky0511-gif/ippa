from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from psycopg2.extras import Json, RealDictCursor

from webapp_sales_app.config import Config
from webapp_sales_app.db.connection import get_connection, release_connection
from webapp_sales_app.helpers.logger import logger

STATUS_ATIVA = "ativa"
STATUS_INATIVA = "inativa"

STATUS_PENDENTE = "pendente"
STATUS_PROCESSANDO = "processando"
STATUS_ENVIADO = "enviado"
STATUS_ERRO = "erro"


def _users_db_name() -> str:
    db_name = str(Config.USERS_DB or "").strip()
    if not db_name:
        raise ValueError("Configuracao USERS_DB ausente para operador_push.")
    return db_name


def _set_request_context(cur, tenant_id: str, actor_user_id: str) -> None:
    cur.execute("SELECT app.set_request_context(%s, %s)", (tenant_id, actor_user_id))


def _to_uuid_list(values: Iterable[str] | None) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output


def registrar_ou_atualizar_subscription(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    installation_id: str,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
) -> dict[str, Any]:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                _set_request_context(cur, tenant_id, actor_user_id)
                cur.execute(
                    """
                    SELECT *
                    FROM public.operador_push_subscriptions
                    WHERE tenant_id = %s
                      AND (installation_id = %s OR endpoint = %s)
                    ORDER BY CASE WHEN installation_id = %s THEN 0 ELSE 1 END, id DESC
                    LIMIT 1
                    FOR UPDATE
                    """,
                    (tenant_id, installation_id, endpoint, installation_id),
                )
                atual = cur.fetchone()

                if not atual:
                    cur.execute(
                        """
                        INSERT INTO public.operador_push_subscriptions (
                            tenant_id,
                            user_id,
                            installation_id,
                            endpoint,
                            p256dh,
                            auth,
                            user_agent,
                            status,
                            last_seen_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                        RETURNING *
                        """,
                        (
                            tenant_id,
                            user_id,
                            installation_id,
                            endpoint,
                            p256dh,
                            auth,
                            (str(user_agent or "").strip() or None),
                            STATUS_ATIVA,
                        ),
                    )
                    row = cur.fetchone() or {}
                    row["acao"] = "ativa"
                    return row

                acao = "ativa"
                mesmo_usuario = str(atual.get("user_id") or "") == str(user_id)
                mesmos_dados = (
                    str(atual.get("endpoint") or "") == endpoint
                    and str(atual.get("p256dh") or "") == p256dh
                    and str(atual.get("auth") or "") == auth
                    and str(atual.get("installation_id") or "") == installation_id
                    and str(atual.get("status") or "").strip().lower() == STATUS_ATIVA
                )
                if mesmo_usuario and mesmos_dados:
                    acao = "inalterada"
                elif not mesmo_usuario:
                    acao = "reatribuida"

                cur.execute(
                    """
                    UPDATE public.operador_push_subscriptions
                    SET user_id = %s,
                        installation_id = %s,
                        endpoint = %s,
                        p256dh = %s,
                        auth = %s,
                        user_agent = %s,
                        status = %s,
                        last_seen_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE tenant_id = %s
                      AND id = %s
                    RETURNING *
                    """,
                    (
                        user_id,
                        installation_id,
                        endpoint,
                        p256dh,
                        auth,
                        (str(user_agent or "").strip() or None),
                        STATUS_ATIVA,
                        tenant_id,
                        atual["id"],
                    ),
                )
                row = cur.fetchone() or {}
                row["acao"] = acao
                return row
    except Exception:
        logger.exception(
            "[PUSH][MODEL] Falha ao registrar subscription tenant_id=%s user_id=%s",
            tenant_id,
            user_id,
        )
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def desativar_subscription(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    installation_id: str | None,
    endpoint: str | None,
) -> dict[str, Any]:
    if not installation_id and not endpoint:
        raise ValueError("Informe installation_id e/ou endpoint para desativar.")

    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                _set_request_context(cur, tenant_id, actor_user_id)
                params: list[Any] = [tenant_id, user_id]
                identificadores: list[str] = []
                if installation_id:
                    identificadores.append("installation_id = %s")
                    params.append(str(installation_id).strip())
                if endpoint:
                    identificadores.append("endpoint = %s")
                    params.append(str(endpoint).strip())

                where = "tenant_id = %s AND user_id = %s AND (" + " OR ".join(identificadores) + ")"
                cur.execute(
                    f"""
                    UPDATE public.operador_push_subscriptions
                    SET status = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE {where}
                      AND status <> %s
                    RETURNING id
                    """,
                    [STATUS_INATIVA, *params, STATUS_INATIVA],
                )
                rows = cur.fetchall() or []
                return {
                    "status": "desativada" if rows else "nao_encontrada",
                    "desativadas": len(rows),
                }
    except Exception:
        logger.exception(
            "[PUSH][MODEL] Falha ao desativar subscription tenant_id=%s user_id=%s",
            tenant_id,
            user_id,
        )
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def listar_subscriptions_ativas_por_usuario(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
) -> list[dict[str, Any]]:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            _set_request_context(cur, tenant_id, actor_user_id)
            cur.execute(
                """
                SELECT
                    s.id,
                    s.tenant_id,
                    s.user_id,
                    s.installation_id,
                    s.endpoint,
                    s.p256dh,
                    s.auth,
                    s.user_agent,
                    s.last_seen_at,
                    s.status
                FROM public.operador_push_subscriptions s
                JOIN public.users u
                  ON u.tenant_id = s.tenant_id
                 AND u.id = s.user_id
                WHERE s.tenant_id = %s
                  AND s.user_id = %s
                  AND LOWER(COALESCE(s.status, '')) = %s
                  AND u.is_active = TRUE
                ORDER BY s.id ASC
                """,
                (tenant_id, user_id, STATUS_ATIVA),
            )
            return cur.fetchall() or []
    finally:
        if conn:
            release_connection(db_name, conn)


def listar_subscriptions_ativas_para_target(
    *,
    tenant_id: str,
    actor_user_id: str,
    target: str,
    role_keys: list[str] | None = None,
    user_ids: list[str] | None = None,
    feature_key: str | None = None,
) -> list[dict[str, Any]]:
    target_norm = str(target or "").strip().lower()
    role_keys_norm = [str(value or "").strip() for value in (role_keys or []) if str(value or "").strip()]
    user_ids_norm = _to_uuid_list(user_ids)
    feature_key_norm = str(feature_key or "").strip()

    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            _set_request_context(cur, tenant_id, actor_user_id)
            if target_norm == "user_ids":
                if not user_ids_norm:
                    return []
                cur.execute(
                    """
                    SELECT
                        s.id,
                        s.tenant_id,
                        s.user_id,
                        s.installation_id,
                        s.endpoint,
                        s.p256dh,
                        s.auth,
                        s.user_agent,
                        s.last_seen_at,
                        s.status
                    FROM public.operador_push_subscriptions s
                    JOIN public.users u
                      ON u.tenant_id = s.tenant_id
                     AND u.id = s.user_id
                    WHERE s.tenant_id = %s
                      AND LOWER(COALESCE(s.status, '')) = %s
                      AND u.is_active = TRUE
                      AND s.user_id = ANY(%s::uuid[])
                    ORDER BY s.id ASC
                    """,
                    (tenant_id, STATUS_ATIVA, user_ids_norm),
                )
                return cur.fetchall() or []

            if target_norm == "admins":
                cur.execute(
                    """
                    SELECT
                        s.id,
                        s.tenant_id,
                        s.user_id,
                        s.installation_id,
                        s.endpoint,
                        s.p256dh,
                        s.auth,
                        s.user_agent,
                        s.last_seen_at,
                        s.status
                    FROM public.operador_push_subscriptions s
                    JOIN public.users u
                      ON u.tenant_id = s.tenant_id
                     AND u.id = s.user_id
                    WHERE s.tenant_id = %s
                      AND LOWER(COALESCE(s.status, '')) = %s
                      AND u.is_active = TRUE
                      AND LOWER(COALESCE(u.clearance_level::text, '')) = 'admin'
                    ORDER BY s.id ASC
                    """,
                    (tenant_id, STATUS_ATIVA),
                )
                return cur.fetchall() or []

            if target_norm == "all_active_users":
                cur.execute(
                    """
                    SELECT
                        s.id,
                        s.tenant_id,
                        s.user_id,
                        s.installation_id,
                        s.endpoint,
                        s.p256dh,
                        s.auth,
                        s.user_agent,
                        s.last_seen_at,
                        s.status
                    FROM public.operador_push_subscriptions s
                    JOIN public.users u
                      ON u.tenant_id = s.tenant_id
                     AND u.id = s.user_id
                    WHERE s.tenant_id = %s
                      AND LOWER(COALESCE(s.status, '')) = %s
                      AND u.is_active = TRUE
                    ORDER BY s.id ASC
                    """,
                    (tenant_id, STATUS_ATIVA),
                )
                return cur.fetchall() or []

            if target_norm == "role_keys":
                if not role_keys_norm:
                    return []
                cur.execute(
                    """
                    WITH alvo AS (
                        SELECT DISTINCT ura.user_id
                        FROM public.user_role_assignments ura
                        JOIN public.roles r
                          ON r.tenant_id = ura.tenant_id
                         AND r.id = ura.role_id
                        JOIN public.users u
                          ON u.tenant_id = ura.tenant_id
                         AND u.id = ura.user_id
                        WHERE ura.tenant_id = %s
                          AND ura.is_active = TRUE
                          AND r.is_active = TRUE
                          AND u.is_active = TRUE
                          AND r.key = ANY(%s::text[])
                    )
                    SELECT
                        s.id,
                        s.tenant_id,
                        s.user_id,
                        s.installation_id,
                        s.endpoint,
                        s.p256dh,
                        s.auth,
                        s.user_agent,
                        s.last_seen_at,
                        s.status
                    FROM public.operador_push_subscriptions s
                    JOIN alvo a
                      ON a.user_id = s.user_id
                    WHERE s.tenant_id = %s
                      AND LOWER(COALESCE(s.status, '')) = %s
                    ORDER BY s.id ASC
                    """,
                    (tenant_id, role_keys_norm, tenant_id, STATUS_ATIVA),
                )
                return cur.fetchall() or []

            if target_norm == "feature_key":
                if not feature_key_norm:
                    return []
                cur.execute(
                    """
                    WITH alvo AS (
                        SELECT DISTINCT ufp.user_id
                        FROM public.user_feature_permissions ufp
                        JOIN public.features f
                          ON f.tenant_id = ufp.tenant_id
                         AND f.id = ufp.feature_id
                        JOIN public.users u
                          ON u.tenant_id = ufp.tenant_id
                         AND u.id = ufp.user_id
                        WHERE ufp.tenant_id = %s
                          AND ufp.is_active = TRUE
                          AND u.is_active = TRUE
                          AND f.key = %s
                          AND f.is_active = TRUE

                        UNION

                        SELECT DISTINCT ura.user_id
                        FROM public.user_role_assignments ura
                        JOIN public.roles r
                          ON r.tenant_id = ura.tenant_id
                         AND r.id = ura.role_id
                        JOIN public.role_feature_permissions rfp
                          ON rfp.tenant_id = r.tenant_id
                         AND rfp.role_id = r.id
                        JOIN public.features f
                          ON f.tenant_id = rfp.tenant_id
                         AND f.id = rfp.feature_id
                        JOIN public.users u
                          ON u.tenant_id = ura.tenant_id
                         AND u.id = ura.user_id
                        WHERE ura.tenant_id = %s
                          AND ura.is_active = TRUE
                          AND r.is_active = TRUE
                          AND rfp.is_active = TRUE
                          AND u.is_active = TRUE
                          AND f.key = %s
                          AND f.is_active = TRUE
                    )
                    SELECT
                        s.id,
                        s.tenant_id,
                        s.user_id,
                        s.installation_id,
                        s.endpoint,
                        s.p256dh,
                        s.auth,
                        s.user_agent,
                        s.last_seen_at,
                        s.status
                    FROM public.operador_push_subscriptions s
                    JOIN alvo a
                      ON a.user_id = s.user_id
                    WHERE s.tenant_id = %s
                      AND LOWER(COALESCE(s.status, '')) = %s
                    ORDER BY s.id ASC
                    """,
                    (tenant_id, feature_key_norm, tenant_id, feature_key_norm, tenant_id, STATUS_ATIVA),
                )
                return cur.fetchall() or []

            return []
    finally:
        if conn:
            release_connection(db_name, conn)


def criar_notificacao_push_interna(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id_destino: str,
    module: str,
    evento: str,
    idempotency_key: str,
    payload_snapshot: dict[str, Any],
) -> dict[str, Any]:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                _set_request_context(cur, tenant_id, actor_user_id)
                cur.execute(
                    """
                    INSERT INTO public.operador_notificacoes_internas (
                        tenant_id,
                        user_id_destino,
                        module,
                        evento,
                        status,
                        tentativas,
                        proxima_tentativa_em,
                        payload_snapshot,
                        provider_response,
                        erro,
                        processado_em,
                        read,
                        read_at,
                        idempotency_key
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, 0, CURRENT_TIMESTAMP, %s, '{}'::jsonb,
                        NULL, NULL, FALSE, NULL, %s
                    )
                    ON CONFLICT (tenant_id, idempotency_key)
                    DO UPDATE SET
                        payload_snapshot = EXCLUDED.payload_snapshot,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING *
                    """,
                    (
                        tenant_id,
                        user_id_destino,
                        module,
                        evento,
                        STATUS_PENDENTE,
                        Json(payload_snapshot or {}),
                        idempotency_key,
                    ),
                )
                return cur.fetchone() or {}
    except Exception:
        logger.exception(
            "[PUSH][MODEL] Falha ao criar notificacao tenant_id=%s user_id=%s evento=%s",
            tenant_id,
            user_id_destino,
            evento,
        )
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def reservar_notificacoes_internas_pendentes(*, limite: int) -> list[dict[str, Any]]:
    limite_num = max(1, min(int(limite or 1), 500))
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    WITH candidatos AS (
                        SELECT n.id
                        FROM public.operador_notificacoes_internas n
                        WHERE n.status = %s
                          AND n.proxima_tentativa_em <= CURRENT_TIMESTAMP
                        ORDER BY n.proxima_tentativa_em ASC, n.id ASC
                        LIMIT %s
                        FOR UPDATE SKIP LOCKED
                    ),
                    atualizados AS (
                        UPDATE public.operador_notificacoes_internas n
                        SET status = %s,
                            updated_at = CURRENT_TIMESTAMP
                        FROM candidatos
                        WHERE n.id = candidatos.id
                        RETURNING n.*
                    )
                    SELECT * FROM atualizados
                    """,
                    (STATUS_PENDENTE, limite_num, STATUS_PROCESSANDO),
                )
                return cur.fetchall() or []
    except Exception:
        logger.exception("[PUSH][MODEL] Falha ao reservar notificacoes pendentes.")
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def marcar_notificacao_interna_enviada(
    *,
    tenant_id: str,
    notificacao_id: str,
    provider_response: dict[str, Any] | None,
) -> dict[str, Any] | None:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    UPDATE public.operador_notificacoes_internas
                    SET status = %s,
                        tentativas = tentativas + 1,
                        provider_response = %s,
                        erro = NULL,
                        processado_em = CURRENT_TIMESTAMP,
                        read = FALSE,
                        read_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE tenant_id = %s
                      AND id = %s
                    RETURNING *
                    """,
                    (STATUS_ENVIADO, Json(provider_response or {}), tenant_id, notificacao_id),
                )
                return cur.fetchone()
    except Exception:
        logger.exception("[PUSH][MODEL] Falha ao marcar notificacao enviada id=%s", notificacao_id)
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def reagendar_notificacao_interna_com_erro(
    *,
    tenant_id: str,
    notificacao_id: str,
    proxima_tentativa_em: datetime,
    erro: str,
    provider_response: dict[str, Any] | None,
) -> dict[str, Any] | None:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    UPDATE public.operador_notificacoes_internas
                    SET status = %s,
                        tentativas = tentativas + 1,
                        proxima_tentativa_em = %s,
                        erro = %s,
                        provider_response = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE tenant_id = %s
                      AND id = %s
                    RETURNING *
                    """,
                    (
                        STATUS_PENDENTE,
                        proxima_tentativa_em,
                        (str(erro or "").strip() or "Falha no envio push."),
                        Json(provider_response or {}),
                        tenant_id,
                        notificacao_id,
                    ),
                )
                return cur.fetchone()
    except Exception:
        logger.exception("[PUSH][MODEL] Falha ao reagendar notificacao id=%s", notificacao_id)
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def marcar_notificacao_interna_erro_permanente(
    *,
    tenant_id: str,
    notificacao_id: str,
    erro: str,
    provider_response: dict[str, Any] | None,
) -> dict[str, Any] | None:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    UPDATE public.operador_notificacoes_internas
                    SET status = %s,
                        tentativas = tentativas + 1,
                        erro = %s,
                        provider_response = %s,
                        processado_em = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE tenant_id = %s
                      AND id = %s
                    RETURNING *
                    """,
                    (
                        STATUS_ERRO,
                        (str(erro or "").strip() or "Falha no envio push."),
                        Json(provider_response or {}),
                        tenant_id,
                        notificacao_id,
                    ),
                )
                return cur.fetchone()
    except Exception:
        logger.exception("[PUSH][MODEL] Falha ao marcar erro permanente id=%s", notificacao_id)
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def listar_notificacoes_internas_usuario(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    filtro: str,
    pagina: int,
    limite: int,
) -> dict[str, Any]:
    filtro_norm = str(filtro or "nao_lidas").strip().lower()
    if filtro_norm not in {"nao_lidas", "lidas", "todas"}:
        filtro_norm = "nao_lidas"

    pagina_num = max(1, int(pagina or 1))
    limite_num = max(1, min(int(limite or 20), 100))
    offset_num = (pagina_num - 1) * limite_num

    condicao_filtro = "TRUE"
    if filtro_norm == "nao_lidas":
        condicao_filtro = "COALESCE(n.read, FALSE) = FALSE"
    elif filtro_norm == "lidas":
        condicao_filtro = "COALESCE(n.read, FALSE) = TRUE"

    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            _set_request_context(cur, tenant_id, actor_user_id)
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE COALESCE(n.read, FALSE) = FALSE) AS nao_lidas,
                    COUNT(*) FILTER (WHERE COALESCE(n.read, FALSE) = TRUE) AS lidas
                FROM public.operador_notificacoes_internas n
                WHERE n.tenant_id = %s
                  AND n.user_id_destino = %s
                  AND LOWER(COALESCE(n.status, '')) = %s
                """,
                (tenant_id, user_id, STATUS_ENVIADO),
            )
            resumo = cur.fetchone() or {}

            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM public.operador_notificacoes_internas n
                WHERE n.tenant_id = %s
                  AND n.user_id_destino = %s
                  AND LOWER(COALESCE(n.status, '')) = %s
                  AND {condicao_filtro}
                """,
                (tenant_id, user_id, STATUS_ENVIADO),
            )
            total_row = cur.fetchone() or {}

            cur.execute(
                f"""
                SELECT
                    n.id,
                    n.module,
                    n.evento,
                    n.created_at,
                    COALESCE(n.read, FALSE) AS read,
                    n.read_at,
                    COALESCE(NULLIF(TRIM(n.payload_snapshot->>'title'), ''), 'Notificacao interna') AS title,
                    COALESCE(NULLIF(TRIM(n.payload_snapshot->>'body'), ''), '') AS body,
                    COALESCE(NULLIF(TRIM(n.payload_snapshot->>'url'), ''), '') AS url,
                    COALESCE(NULLIF(TRIM(n.payload_snapshot->>'tag'), ''), '') AS tag,
                    COALESCE(n.payload_snapshot->'payload_extra', '{{}}'::jsonb) AS payload_extra
                FROM public.operador_notificacoes_internas n
                WHERE n.tenant_id = %s
                  AND n.user_id_destino = %s
                  AND LOWER(COALESCE(n.status, '')) = %s
                  AND {condicao_filtro}
                ORDER BY n.created_at DESC, n.id DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, user_id, STATUS_ENVIADO, limite_num, offset_num),
            )
            itens = cur.fetchall() or []
            return {
                "itens": itens,
                "pagina": pagina_num,
                "limite": limite_num,
                "total": int(total_row.get("total") or 0),
                "nao_lidas": int(resumo.get("nao_lidas") or 0),
                "lidas": int(resumo.get("lidas") or 0),
            }
    finally:
        if conn:
            release_connection(db_name, conn)


def obter_resumo_notificacoes_internas_usuario(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
) -> dict[str, int]:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            _set_request_context(cur, tenant_id, actor_user_id)
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE COALESCE(n.read, FALSE) = FALSE) AS nao_lidas,
                    COUNT(*) FILTER (WHERE COALESCE(n.read, FALSE) = TRUE) AS lidas,
                    COUNT(*) AS total
                FROM public.operador_notificacoes_internas n
                WHERE n.tenant_id = %s
                  AND n.user_id_destino = %s
                  AND LOWER(COALESCE(n.status, '')) = %s
                """,
                (tenant_id, user_id, STATUS_ENVIADO),
            )
            row = cur.fetchone() or {}
            return {
                "nao_lidas": int(row.get("nao_lidas") or 0),
                "lidas": int(row.get("lidas") or 0),
                "total": int(row.get("total") or 0),
            }
    finally:
        if conn:
            release_connection(db_name, conn)


def marcar_notificacao_interna_lida_usuario(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    notificacao_id: str,
) -> dict[str, Any] | None:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                _set_request_context(cur, tenant_id, actor_user_id)
                cur.execute(
                    """
                    UPDATE public.operador_notificacoes_internas n
                    SET read = TRUE,
                        read_at = COALESCE(n.read_at, CURRENT_TIMESTAMP),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE n.tenant_id = %s
                      AND n.id = %s
                      AND n.user_id_destino = %s
                      AND LOWER(COALESCE(n.status, '')) = %s
                    RETURNING
                        n.id,
                        n.module,
                        n.evento,
                        n.created_at,
                        COALESCE(n.read, FALSE) AS read,
                        n.read_at,
                        COALESCE(NULLIF(TRIM(n.payload_snapshot->>'title'), ''), 'Notificacao interna') AS title,
                        COALESCE(NULLIF(TRIM(n.payload_snapshot->>'body'), ''), '') AS body,
                        COALESCE(NULLIF(TRIM(n.payload_snapshot->>'url'), ''), '') AS url,
                        COALESCE(NULLIF(TRIM(n.payload_snapshot->>'tag'), ''), '') AS tag
                    """,
                    (tenant_id, notificacao_id, user_id, STATUS_ENVIADO),
                )
                return cur.fetchone()
    except Exception:
        logger.exception(
            "[PUSH][MODEL] Falha ao marcar notificacao lida tenant_id=%s user_id=%s notificacao_id=%s",
            tenant_id,
            user_id,
            notificacao_id,
        )
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def marcar_todas_notificacoes_internas_lidas_usuario(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
) -> dict[str, int]:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                _set_request_context(cur, tenant_id, actor_user_id)
                cur.execute(
                    """
                    UPDATE public.operador_notificacoes_internas n
                    SET read = TRUE,
                        read_at = COALESCE(n.read_at, CURRENT_TIMESTAMP),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE n.tenant_id = %s
                      AND n.user_id_destino = %s
                      AND LOWER(COALESCE(n.status, '')) = %s
                      AND COALESCE(n.read, FALSE) = FALSE
                    RETURNING n.id
                    """,
                    (tenant_id, user_id, STATUS_ENVIADO),
                )
                rows = cur.fetchall() or []
                return {"marcadas": len(rows)}
    except Exception:
        logger.exception(
            "[PUSH][MODEL] Falha ao marcar todas notificacoes lidas tenant_id=%s user_id=%s",
            tenant_id,
            user_id,
        )
        raise
    finally:
        if conn:
            release_connection(db_name, conn)


def desativar_subscription_por_id(*, tenant_id: str, subscription_id: str) -> None:
    conn = None
    db_name = _users_db_name()
    try:
        conn = get_connection(db_name)
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE public.operador_push_subscriptions
                    SET status = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE tenant_id = %s
                      AND id = %s
                    """,
                    (STATUS_INATIVA, tenant_id, subscription_id),
                )
    except Exception:
        logger.exception("[PUSH][MODEL] Falha ao desativar subscription_id=%s", subscription_id)
        raise
    finally:
        if conn:
            release_connection(db_name, conn)
