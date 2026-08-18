from __future__ import annotations

import os
import threading
from datetime import datetime

from webapp_sales_app.config import Config
from webapp_sales_app.helpers.logger import logger
from webapp_sales_app.services.operador_push_service import processar_fila_push_interno_service

_worker_lock = threading.Lock()
_worker_thread: threading.Thread | None = None
_worker_stop_event = threading.Event()


def _is_prod_environment() -> bool:
    env_candidates = (
        os.getenv("FLASK_ENV"),
        os.getenv("APP_ENV"),
        os.getenv("ENV"),
    )
    for env_value in env_candidates:
        value = str(env_value or "").strip().lower()
        if value:
            return value == "production"
    return False


def _loop_worker() -> None:
    intervalo = max(5, int(getattr(Config, "PUSH_INTERNO_WORKER_INTERVAL_SECONDS", 20) or 20))
    batch_size = max(1, int(getattr(Config, "PUSH_INTERNO_BATCH_SIZE", 100) or 100))
    while not _worker_stop_event.is_set():
        try:
            resultado = processar_fila_push_interno_service(limite=batch_size)
            if int(resultado.get("processados") or 0) > 0:
                logger.info(
                    "[PUSH][WORKER] Ciclo concluido em %s processados=%s sucesso=%s falha=%s",
                    datetime.utcnow().isoformat(),
                    resultado.get("processados"),
                    resultado.get("sucesso"),
                    resultado.get("falha"),
                )
        except Exception as exc:
            logger.exception("[PUSH][WORKER] Falha no ciclo de push interno: %s", exc)

        if _worker_stop_event.wait(intervalo):
            break


def iniciar_worker_push_interno_operador() -> bool:
    if not _is_prod_environment():
        logger.info("[PUSH][WORKER] Desabilitado fora de production.")
        return False

    if not bool(getattr(Config, "PUSH_INTERNO_ENABLED", True)):
        logger.info("[PUSH][WORKER] Desabilitado por PUSH_INTERNO_ENABLED=false.")
        return False

    if not bool(getattr(Config, "PUSH_INTERNO_WORKER_ENABLED", True)):
        logger.info("[PUSH][WORKER] Desabilitado por PUSH_INTERNO_WORKER_ENABLED=false.")
        return False

    global _worker_thread
    with _worker_lock:
        if _worker_thread and _worker_thread.is_alive():
            logger.info("[PUSH][WORKER] Worker ja iniciado neste processo.")
            return True

        _worker_stop_event.clear()
        _worker_thread = threading.Thread(
            target=_loop_worker,
            name="operador-push-worker",
            daemon=True,
        )
        _worker_thread.start()
        logger.info("[PUSH][WORKER] Worker iniciado com sucesso.")
        return True
