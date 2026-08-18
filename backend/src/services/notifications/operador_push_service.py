from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from webapp_sales_app.config import Config
from webapp_sales_app.helpers.logger import logger
from webapp_sales_app.models.operador_push_models import (
    criar_notificacao_push_interna,
    desativar_subscription,
    desativar_subscription_por_id,
    listar_notificacoes_internas_usuario,
    listar_subscriptions_ativas_para_target,
    listar_subscriptions_ativas_por_usuario,
    marcar_notificacao_interna_enviada,
    marcar_notificacao_interna_erro_permanente,
    marcar_notificacao_interna_lida_usuario,
    marcar_todas_notificacoes_internas_lidas_usuario,
    obter_resumo_notificacoes_internas_usuario,
    reagendar_notificacao_interna_com_erro,
    registrar_ou_atualizar_subscription,
    reservar_notificacoes_internas_pendentes,
)

try:
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover
    WebPushException = Exception
    webpush = None

_MAX_ATTEMPTS = max(1, int(getattr(Config, "PUSH_INTERNO_MAX_ATTEMPTS", 6) or 6))


def _push_habilitado() -> bool:
    return bool(getattr(Config, "PUSH_INTERNO_ENABLED", True))


def _cfg_text(name: str) -> str:
    return str(getattr(Config, name, "") or "").strip()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalizar_filtro_notificacoes(valor: Any) -> str:
    filtro = str(valor or "nao_lidas").strip().lower()
    if filtro not in {"nao_lidas", "lidas", "todas"}:
        return "nao_lidas"
    return filtro


def _normalizar_paginacao(pagina: Any, limite: Any) -> tuple[int, int]:
    try:
        pagina_num = int(pagina or 1)
    except (TypeError, ValueError):
        pagina_num = 1
    try:
        limite_num = int(limite or 20)
    except (TypeError, ValueError):
        limite_num = 20
    return max(1, pagina_num), max(1, min(limite_num, 100))


def _calcular_backoff(tentativas_apos_falha: int) -> timedelta:
    expoente = max(0, min(int(tentativas_apos_falha) - 1, 8))
    return timedelta(seconds=30 * (2**expoente))


def _build_idempotency_key(
    *,
    tenant_id: str,
    user_id_destino: str,
    module: str,
    evento: str,
    payload_snapshot: dict[str, Any],
    idempotency_scope: str | None,
) -> str:
    base_scope = str(idempotency_scope or "").strip()
    payload_raw = {
        "module": str(module or "").strip().lower(),
        "evento": str(evento or "").strip().lower(),
        "title": str(payload_snapshot.get("title") or ""),
        "body": str(payload_snapshot.get("body") or ""),
        "url": str(payload_snapshot.get("url") or ""),
        "tag": str(payload_snapshot.get("tag") or ""),
        "payload_extra": payload_snapshot.get("payload_extra") or {},
        "scope": base_scope,
    }
    raw = json.dumps(
        {
            "tenant_id": tenant_id,
            "user_id_destino": user_id_destino,
            "payload": payload_raw,
        },
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _validar_payload_registro(payload: dict[str, Any]) -> tuple[str, str, str, str]:
    installation_id = str(payload.get("installation_id") or "").strip()
    endpoint = str(payload.get("endpoint") or "").strip()
    keys = payload.get("keys") or {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()

    if not installation_id:
        raise ValueError("Campo installation_id e obrigatorio.")
    if not endpoint:
        raise ValueError("Campo endpoint e obrigatorio.")
    if not p256dh or not auth:
        raise ValueError("Chaves de assinatura push invalidas.")
    return installation_id[:120], endpoint, p256dh[:255], auth[:255]


def _deduplicar_subscriptions_para_envio(subscriptions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    vistos: set[tuple[str, str, str]] = set()
    unicas: list[dict[str, Any]] = []
    for sub in subscriptions or []:
        endpoint = str(sub.get("endpoint") or "").strip()
        installation_id = str(sub.get("installation_id") or "").strip()
        user_id = str(sub.get("user_id") or "").strip()
        sub_id = str(sub.get("id") or "").strip()
        p256dh = str(sub.get("p256dh") or "").strip()
        auth = str(sub.get("auth") or "").strip()
        if not sub_id or not endpoint or not p256dh or not auth:
            continue
        chave = (endpoint.lower(), installation_id.lower(), user_id)
        if chave in vistos:
            continue
        vistos.add(chave)
        unicas.append(sub)
    return unicas


def obter_push_config_service() -> dict[str, Any]:
    public_key = _cfg_text("WEBPUSH_VAPID_PUBLIC_KEY")
    enabled = _push_habilitado()
    worker_enabled = bool(getattr(Config, "PUSH_INTERNO_WORKER_ENABLED", True))
    return {
        "status": "ok",
        "enabled": enabled,
        "workerEnabled": worker_enabled,
        "vapidPublicKey": public_key or None,
        "configured": bool(public_key),
    }


def registrar_push_operador_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if not _push_habilitado():
        return {"status": "feature_indisponivel", "mensagem": "Push interno desabilitado por configuracao."}

    installation_id, endpoint, p256dh, auth = _validar_payload_registro(payload or {})
    user_agent = str(payload.get("ua") or "").strip() or None
    row = registrar_ou_atualizar_subscription(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        user_id=user_id,
        installation_id=installation_id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_agent=user_agent,
    )
    acao = str(row.get("acao") or "").strip().lower()
    if acao not in {"ativa", "reatribuida", "inalterada"}:
        acao = "ativa"
    return {
        "status": "ok",
        "mensagem": "Inscricao push atualizada com sucesso.",
        "resultado": acao,
        "subscription_id": row.get("id"),
    }


def desativar_push_operador_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if not _push_habilitado():
        return {"status": "feature_indisponivel", "mensagem": "Push interno desabilitado por configuracao."}

    installation_id = str((payload or {}).get("installation_id") or "").strip() or None
    endpoint = str((payload or {}).get("endpoint") or "").strip() or None
    resultado = desativar_subscription(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        user_id=user_id,
        installation_id=installation_id,
        endpoint=endpoint,
    )
    if resultado.get("status") == "desativada":
        return {"status": "ok", "mensagem": "Inscricao push desativada.", **resultado}
    return {"status": "nao_encontrada", "mensagem": "Inscricao push nao encontrada.", **resultado}


def obter_status_push_operador_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if not _push_habilitado():
        return {"status": "feature_indisponivel", "mensagem": "Push interno desabilitado por configuracao."}

    installation_id = str((payload or {}).get("installation_id") or "").strip()
    endpoint = str((payload or {}).get("endpoint") or "").strip()
    if not installation_id and not endpoint:
        return {
            "status": "ok",
            "ativa": False,
            "mensagem": "Informe installation_id ou endpoint para consultar o status.",
        }

    subscriptions = listar_subscriptions_ativas_por_usuario(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        user_id=user_id,
    )
    ativa = False
    for sub in subscriptions:
        if installation_id and str(sub.get("installation_id") or "").strip() == installation_id:
            ativa = True
            break
        if endpoint and str(sub.get("endpoint") or "").strip() == endpoint:
            ativa = True
            break

    return {
        "status": "ok",
        "ativa": ativa,
        "total_ativas": len(subscriptions),
    }


def listar_notificacoes_internas_usuario_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    filtro: Any,
    pagina: Any,
    limite: Any,
) -> dict[str, Any]:
    filtro_norm = _normalizar_filtro_notificacoes(filtro)
    pagina_num, limite_num = _normalizar_paginacao(pagina, limite)
    resultado = listar_notificacoes_internas_usuario(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        user_id=user_id,
        filtro=filtro_norm,
        pagina=pagina_num,
        limite=limite_num,
    )
    return {
        "status": "ok",
        "filtro": filtro_norm,
        "pagina": int(resultado.get("pagina") or pagina_num),
        "limite": int(resultado.get("limite") or limite_num),
        "total": int(resultado.get("total") or 0),
        "nao_lidas": int(resultado.get("nao_lidas") or 0),
        "lidas": int(resultado.get("lidas") or 0),
        "itens": resultado.get("itens") or [],
    }


def obter_resumo_notificacoes_internas_usuario_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
) -> dict[str, Any]:
    resumo = obter_resumo_notificacoes_internas_usuario(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        user_id=user_id,
    )
    return {"status": "ok", **resumo}


def marcar_notificacao_interna_lida_usuario_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
    notificacao_id: str,
) -> dict[str, Any]:
    row = marcar_notificacao_interna_lida_usuario(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        user_id=user_id,
        notificacao_id=notificacao_id,
    )
    if not row:
        return {"status": "nao_encontrada", "mensagem": "Notificacao nao encontrada para este usuario."}
    return {"status": "ok", "mensagem": "Notificacao marcada como lida.", "notificacao": row}


def marcar_todas_notificacoes_internas_lidas_usuario_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    user_id: str,
) -> dict[str, Any]:
    resultado = marcar_todas_notificacoes_internas_lidas_usuario(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        user_id=user_id,
    )
    return {
        "status": "ok",
        "mensagem": "Notificacoes marcadas como lidas.",
        "marcadas": int(resultado.get("marcadas") or 0),
    }


def enfileirar_push_interno_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    module: str,
    evento: str,
    title: str,
    body: str,
    url: str,
    tag: str,
    role_keys: list[str] | None = None,
    user_ids: list[str] | None = None,
    feature_key: str | None = None,
    target: str = "role_keys",
    payload_extra: dict[str, Any] | None = None,
    idempotency_scope: str | None = None,
) -> dict[str, Any]:
    if not _push_habilitado():
        return {"status": "feature_indisponivel", "mensagem": "Push interno desabilitado por configuracao."}

    target_norm = str(target or "").strip().lower()
    if target_norm not in {"role_keys", "user_ids", "all_active_users", "admins", "feature_key"}:
        raise ValueError("Target de push invalido.")
    if target_norm == "role_keys" and not (role_keys or []):
        raise ValueError("role_keys e obrigatorio para target role_keys.")
    if target_norm == "user_ids" and not (user_ids or []):
        raise ValueError("user_ids e obrigatorio para target user_ids.")
    if target_norm == "feature_key" and not str(feature_key or "").strip():
        raise ValueError("feature_key e obrigatorio para target feature_key.")

    subscriptions = listar_subscriptions_ativas_para_target(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        target=target_norm,
        role_keys=role_keys,
        user_ids=user_ids,
        feature_key=feature_key,
    )
    subscriptions = _deduplicar_subscriptions_para_envio(subscriptions)
    if not subscriptions:
        return {
            "status": "aviso",
            "mensagem": "Sem inscricoes push ativas para o target informado.",
            "enfileiradas": 0,
        }

    module_norm = str(module or "").strip().lower() or "sistema"
    evento_norm = str(evento or "").strip().lower() or "notificacao"
    title_norm = str(title or "").strip() or "Notificacao interna"
    body_norm = str(body or "").strip() or "Nova notificacao disponivel."
    url_norm = str(url or "").strip() or "/"
    tag_norm = str(tag or "").strip() or f"{module_norm}-{evento_norm}"
    payload_extra_norm = dict(payload_extra or {})

    usuarios_destino_ids = sorted(
        {
            str(sub.get("user_id") or "").strip()
            for sub in subscriptions
            if str(sub.get("user_id") or "").strip()
        }
    )

    total = 0
    for user_id_destino in usuarios_destino_ids:
        payload_snapshot = {
            "title": title_norm,
            "body": body_norm,
            "url": url_norm,
            "tag": tag_norm,
            "module": module_norm,
            "evento": evento_norm,
            "payload_extra": payload_extra_norm,
        }
        idempotency_key = _build_idempotency_key(
            tenant_id=tenant_id,
            user_id_destino=user_id_destino,
            module=module_norm,
            evento=evento_norm,
            payload_snapshot=payload_snapshot,
            idempotency_scope=idempotency_scope,
        )
        criar_notificacao_push_interna(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            user_id_destino=user_id_destino,
            module=module_norm,
            evento=evento_norm,
            idempotency_key=idempotency_key,
            payload_snapshot=payload_snapshot,
        )
        total += 1

    return {
        "status": "ok",
        "mensagem": "Notificacoes internas enfileiradas.",
        "enfileiradas": total,
    }


def notificar_admins_onedrive_expirado_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    origem: str = "client_product_images",
) -> dict[str, Any]:
    """Queue an operational alert when the tenant OneDrive grant expires.

    The alert is idempotent per tenant/hour so repeated client searches while
    the account is disconnected do not flood the admins.
    """

    tenant_id_norm = str(tenant_id or "").strip()
    actor_user_id_norm = str(actor_user_id or "").strip() or "system"
    if not tenant_id_norm:
        return {"status": "ignorado", "mensagem": "tenant_id ausente."}

    now = _now_utc()
    scope = f"{tenant_id_norm}:{now:%Y%m%d%H}"
    return enfileirar_push_interno_service(
        tenant_id=tenant_id_norm,
        actor_user_id=actor_user_id_norm,
        module="onedrive",
        evento="oauth_expirado",
        title="OneDrive desconectado",
        body="A conexao com o OneDrive expirou. Reconecte a conta para liberar as imagens dos produtos.",
        url="/internal/marketing/photos",
        tag="onedrive-oauth-expirado",
        target="admins",
        payload_extra={
            "tenant_id": tenant_id_norm,
            "origem": str(origem or "").strip() or "unknown",
            "occurred_at": now.isoformat(),
        },
        idempotency_scope=scope,
    )


def _normalizar_lista_texto(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    itens: list[str] = []
    vistos: set[str] = set()
    for value in values:
        item = str(value or "").strip()
        if not item or item in vistos:
            continue
        itens.append(item)
        vistos.add(item)
    return itens


def _validar_selector_push_externo(selector: Any, index: int) -> dict[str, Any]:
    if not isinstance(selector, dict):
        raise ValueError(f"selectors[{index}] deve ser um objeto.")

    target = str(selector.get("target") or "").strip().lower()
    if target not in {"role_keys", "user_ids", "all_active_users", "admins", "feature_key"}:
        raise ValueError(f"selectors[{index}].target invalido.")

    role_keys = _normalizar_lista_texto(selector.get("role_keys"))
    user_ids = _normalizar_lista_texto(selector.get("user_ids"))
    feature_key = str(selector.get("feature_key") or "").strip()

    if target == "role_keys" and not role_keys:
        raise ValueError(f"selectors[{index}].role_keys e obrigatorio para target role_keys.")
    if target == "user_ids" and not user_ids:
        raise ValueError(f"selectors[{index}].user_ids e obrigatorio para target user_ids.")
    if target == "feature_key" and not feature_key:
        raise ValueError(f"selectors[{index}].feature_key e obrigatorio para target feature_key.")

    return {
        "target": target,
        "role_keys": role_keys,
        "user_ids": user_ids,
        "feature_key": feature_key or None,
    }


def _listar_user_ids_ativos_para_selector(
    *,
    tenant_id: str,
    actor_user_id: str,
    selector: dict[str, Any],
) -> list[str]:
    subscriptions = listar_subscriptions_ativas_para_target(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        target=selector["target"],
        role_keys=selector.get("role_keys"),
        user_ids=selector.get("user_ids"),
        feature_key=selector.get("feature_key"),
    )
    subscriptions = _deduplicar_subscriptions_para_envio(subscriptions)
    return sorted(
        {
            str(sub.get("user_id") or "").strip()
            for sub in subscriptions
            if str(sub.get("user_id") or "").strip()
        }
    )


def enfileirar_push_interno_api_externa_service(
    *,
    tenant_id: str,
    actor_user_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if not _push_habilitado():
        return {"status": "feature_indisponivel", "mensagem": "Push interno desabilitado por configuracao."}

    actor_user_id_norm = str(actor_user_id or "").strip()
    if not actor_user_id_norm:
        raise ValueError("actor_user_id e obrigatorio.")

    data = dict(payload or {})
    module = str(data.get("module") or "").strip()
    evento = str(data.get("event") or data.get("evento") or "").strip()
    body = str(data.get("body") or "").strip()
    if not module:
        raise ValueError("Campo module e obrigatorio.")
    if not evento:
        raise ValueError("Campo event e obrigatorio.")
    if not body:
        raise ValueError("Campo body e obrigatorio.")

    selectors_raw = data.get("selectors")
    if not isinstance(selectors_raw, list) or not selectors_raw:
        raise ValueError("Campo selectors deve ser uma lista nao vazia.")

    payload_extra_raw = data.get("payload_extra")
    if payload_extra_raw is None:
        payload_extra = {}
    elif isinstance(payload_extra_raw, dict):
        payload_extra = dict(payload_extra_raw)
    else:
        raise ValueError("Campo payload_extra deve ser um objeto.")

    selectors = [
        _validar_selector_push_externo(selector, index)
        for index, selector in enumerate(selectors_raw)
    ]

    title = str(data.get("title") or "").strip() or "Notificacao interna"
    url = str(data.get("url") or "").strip() or "/"
    tag = str(data.get("tag") or "").strip() or f"{module.lower()}-{evento.lower()}"
    idempotency_scope = str(data.get("idempotency_scope") or "").strip() or None

    user_ids_enfileirados: set[str] = set()
    results: list[dict[str, Any]] = []
    for selector in selectors:
        user_ids_alvo = _listar_user_ids_ativos_para_selector(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id_norm,
            selector=selector,
        )
        user_ids_enfileirados.update(user_ids_alvo)

        result = enfileirar_push_interno_service(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id_norm,
            module=module,
            evento=evento,
            title=title,
            body=body,
            url=url,
            tag=tag,
            role_keys=selector.get("role_keys"),
            user_ids=selector.get("user_ids"),
            feature_key=selector.get("feature_key"),
            target=selector["target"],
            payload_extra=payload_extra,
            idempotency_scope=idempotency_scope,
        )
        results.append(
            {
                "selector": {
                    "target": selector["target"],
                    "role_keys": selector.get("role_keys") or None,
                    "user_ids": selector.get("user_ids") or None,
                    "feature_key": selector.get("feature_key") or None,
                },
                **result,
            }
        )

    total_enfileiradas = len(user_ids_enfileirados)
    if total_enfileiradas > 0:
        return {
            "status": "ok",
            "mensagem": "Notificacoes internas enfileiradas.",
            "tenant_id": tenant_id,
            "enfileiradas": total_enfileiradas,
            "results": results,
        }

    return {
        "status": "aviso",
        "mensagem": "Sem inscricoes push ativas para os seletores informados.",
        "tenant_id": tenant_id,
        "enfileiradas": 0,
        "results": results,
    }


def _webpush_config_ok() -> tuple[bool, str]:
    if webpush is None:
        return False, "Dependencia pywebpush indisponivel."
    if not _cfg_text("WEBPUSH_VAPID_PUBLIC_KEY"):
        return False, "WEBPUSH_VAPID_PUBLIC_KEY nao configurada."
    if not _cfg_text("WEBPUSH_VAPID_PRIVATE_KEY"):
        return False, "WEBPUSH_VAPID_PRIVATE_KEY nao configurada."
    if not _cfg_text("WEBPUSH_VAPID_SUBJECT"):
        return False, "WEBPUSH_VAPID_SUBJECT nao configurado."
    return True, ""


def _enviar_push(item: dict[str, Any]) -> dict[str, Any]:
    ok_cfg, msg_cfg = _webpush_config_ok()
    if not ok_cfg:
        return {"status": "erro", "mensagem": msg_cfg, "retryable": False, "status_code": None}

    endpoint = str(item.get("endpoint") or "").strip()
    p256dh = str(item.get("p256dh") or "").strip()
    auth = str(item.get("auth") or "").strip()
    if not endpoint or not p256dh or not auth:
        return {"status": "erro", "mensagem": "Subscription sem endpoint/chaves.", "retryable": False, "status_code": None}

    payload = item.get("payload_snapshot") or {}
    data = json.dumps(
        {
            "title": str(payload.get("title") or "Notificacao interna"),
            "body": str(payload.get("body") or "Nova notificacao disponivel."),
            "url": str(payload.get("url") or "/"),
            "tag": str(payload.get("tag") or "webapp-sales-notification"),
        },
        ensure_ascii=False,
    )
    subscription_info = {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth,
        },
    }
    try:
        response = webpush(
            subscription_info=subscription_info,
            data=data,
            vapid_private_key=_cfg_text("WEBPUSH_VAPID_PRIVATE_KEY"),
            vapid_claims={"sub": _cfg_text("WEBPUSH_VAPID_SUBJECT")},
        )
        return {
            "status": "ok",
            "mensagem": "Push enviado.",
            "retryable": False,
            "status_code": int(getattr(response, "status_code", 201) or 201),
        }
    except WebPushException as exc:  # type: ignore[misc]
        status_code = int(getattr(getattr(exc, "response", None), "status_code", 0) or 0)
        mensagem = str(exc)
        retryable = status_code in {429, 500, 502, 503, 504}
        return {
            "status": "erro",
            "mensagem": mensagem or "Falha no envio push.",
            "retryable": retryable,
            "status_code": status_code or None,
        }
    except Exception as exc:
        return {
            "status": "erro",
            "mensagem": str(exc) or "Falha inesperada no envio push.",
            "retryable": True,
            "status_code": None,
        }


def _consolidar_resultado_envios(envios: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(envios)
    sucessos = [envio for envio in envios if str(envio.get("status") or "").strip().lower() == "ok"]
    falhas = [envio for envio in envios if str(envio.get("status") or "").strip().lower() != "ok"]
    retryable = any(bool(envio.get("retryable")) for envio in falhas)
    codigos = [
        int(envio.get("status_code") or 0)
        for envio in envios
        if int(envio.get("status_code") or 0) > 0
    ]
    mensagens_erro = [
        str(envio.get("mensagem") or "").strip()
        for envio in falhas
        if str(envio.get("mensagem") or "").strip()
    ]
    detalhes = []
    for envio in envios:
        detalhes.append(
            {
                "subscription_id": str(envio.get("subscription_id") or "").strip() or None,
                "status": str(envio.get("status") or "").strip().lower() or "erro",
                "mensagem": str(envio.get("mensagem") or "").strip() or None,
                "status_code": int(envio.get("status_code") or 0) or None,
                "retryable": bool(envio.get("retryable")),
            }
        )
    mensagem = "Push enviado."
    if not sucessos:
        mensagem = mensagens_erro[0] if mensagens_erro else "Falha no envio push."
    elif falhas:
        mensagem = "Push enviado para parte dos aparelhos."
    return {
        "status": "ok" if sucessos else "erro",
        "mensagem": mensagem,
        "retryable": retryable if not sucessos else False,
        "status_code": max(codigos) if codigos else None,
        "total_subscriptions": total,
        "sucessos": len(sucessos),
        "falhas": len(falhas),
        "detalhes": detalhes,
    }


def processar_fila_push_interno_service(*, limite: int | None = None) -> dict[str, Any]:
    if not _push_habilitado():
        return {"status": "ok", "mensagem": "Push interno desabilitado.", "processados": 0, "sucesso": 0, "falha": 0}

    limite_num = max(1, int(limite or getattr(Config, "PUSH_INTERNO_BATCH_SIZE", 100) or 100))
    itens = reservar_notificacoes_internas_pendentes(limite=limite_num)
    resumo = {"status": "ok", "processados": len(itens), "sucesso": 0, "falha": 0}

    for item in itens:
        notif_id = str(item.get("id") or "").strip()
        tenant_id = str(item.get("tenant_id") or "").strip()
        user_id_destino = str(item.get("user_id_destino") or "").strip()
        if not notif_id or not tenant_id or not user_id_destino:
            resumo["falha"] += 1
            continue

        try:
            subscriptions = _deduplicar_subscriptions_para_envio(
                listar_subscriptions_ativas_por_usuario(
                    tenant_id=tenant_id,
                    actor_user_id=user_id_destino,
                    user_id=user_id_destino,
                )
            )
            if not subscriptions:
                marcar_notificacao_interna_erro_permanente(
                    tenant_id=tenant_id,
                    notificacao_id=notif_id,
                    erro="Usuario sem subscriptions ativas.",
                    provider_response={"status": "erro", "mensagem": "Usuario sem subscriptions ativas."},
                )
                resumo["falha"] += 1
                continue

            envios: list[dict[str, Any]] = []
            for sub in subscriptions:
                envio = _enviar_push({**item, **sub})
                envio["subscription_id"] = str(sub.get("id") or "").strip() or None
                envios.append(envio)

                status_code = int(envio.get("status_code") or 0)
                sub_id = str(sub.get("id") or "").strip()
                if status_code in {404, 410} and sub_id:
                    desativar_subscription_por_id(tenant_id=tenant_id, subscription_id=sub_id)

            envio_consolidado = _consolidar_resultado_envios(envios)
            logger.info(
                "[PUSH][WORKER] Notificacao id=%s tenant_id=%s user_id=%s subscriptions=%s sucessos=%s falhas=%s",
                notif_id,
                tenant_id,
                user_id_destino,
                envio_consolidado.get("total_subscriptions"),
                envio_consolidado.get("sucessos"),
                envio_consolidado.get("falhas"),
            )
            sucesso = str(envio_consolidado.get("status") or "").strip().lower() == "ok"
            if sucesso:
                marcar_notificacao_interna_enviada(
                    tenant_id=tenant_id,
                    notificacao_id=notif_id,
                    provider_response=envio_consolidado,
                )
                resumo["sucesso"] += 1
                continue

            tentativas_atuais = int(item.get("tentativas") or 0)
            tentativas_apos_falha = tentativas_atuais + 1
            ultimo_erro = str(envio_consolidado.get("mensagem") or "Falha no envio push.")
            retryable = bool(envio_consolidado.get("retryable"))
            if (not retryable) or tentativas_apos_falha >= _MAX_ATTEMPTS:
                marcar_notificacao_interna_erro_permanente(
                    tenant_id=tenant_id,
                    notificacao_id=notif_id,
                    erro=ultimo_erro,
                    provider_response=envio_consolidado,
                )
                resumo["falha"] += 1
                continue

            proxima_tentativa = _now_utc() + _calcular_backoff(tentativas_apos_falha)
            reagendar_notificacao_interna_com_erro(
                tenant_id=tenant_id,
                notificacao_id=notif_id,
                proxima_tentativa_em=proxima_tentativa,
                erro=ultimo_erro,
                provider_response=envio_consolidado,
            )
            resumo["falha"] += 1
        except Exception as exc:
            logger.exception("[PUSH][WORKER] Erro ao processar notificacao interna id=%s: %s", notif_id, exc)
            try:
                marcar_notificacao_interna_erro_permanente(
                    tenant_id=tenant_id,
                    notificacao_id=notif_id,
                    erro=f"Erro inesperado no worker: {exc}",
                    provider_response={"status": "erro", "mensagem": str(exc)},
                )
            except Exception:
                logger.exception("[PUSH][WORKER] Falha adicional ao marcar erro permanente id=%s", notif_id)
            resumo["falha"] += 1

    if resumo["processados"]:
        logger.info(
            "[PUSH][WORKER] Lote processado processados=%s sucesso=%s falha=%s",
            resumo["processados"],
            resumo["sucesso"],
            resumo["falha"],
        )
    return resumo
