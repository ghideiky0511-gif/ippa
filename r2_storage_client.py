from __future__ import annotations

import threading
import time

import boto3
from botocore.client import Config as BotoClientConfig
from botocore.exceptions import ClientError

from salesCount_app.config import Config

_NO_SUCH_KEY_CODES = {"NoSuchKey", "404"}

_client_singleton = None

_presigned_cache: dict[tuple[str, int], tuple[str, float]] = {}
_presigned_cache_lock = threading.Lock()
_PRESIGNED_CACHE_MAX_ENTRIES = 5000


def _client():
    global _client_singleton
    if _client_singleton is None:
        account_id = str(getattr(Config, "R2_ACCOUNT_ID", "") or "").strip()
        _client_singleton = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=str(getattr(Config, "R2_ACCESS_KEY_ID", "") or "").strip(),
            aws_secret_access_key=str(getattr(Config, "R2_SECRET_ACCESS_KEY", "") or "").strip(),
            region_name="auto",
            config=BotoClientConfig(signature_version="s3v4"),
        )
    return _client_singleton


def _bucket() -> str:
    return str(getattr(Config, "R2_BUCKET_COMPROVANTES", "") or "").strip()


def upload_object(key: str, data: bytes, content_type: str, cache_control: str | None = None) -> None:
    kwargs = {"Bucket": _bucket(), "Key": key, "Body": data, "ContentType": content_type}
    if cache_control:
        kwargs["CacheControl"] = cache_control
    _client().put_object(**kwargs)


def object_exists(key: str) -> bool:
    if not str(key or "").strip():
        return False
    try:
        _client().head_object(Bucket=_bucket(), Key=key)
    except ClientError as exc:
        error_code = str((exc.response or {}).get("Error", {}).get("Code") or "")
        if error_code in _NO_SUCH_KEY_CODES:
            return False
        raise
    return True


def delete_object(key: str) -> None:
    if not str(key or "").strip():
        return
    _client().delete_object(Bucket=_bucket(), Key=key)
    with _presigned_cache_lock:
        for cache_key in [k for k in _presigned_cache if k[0] == key]:
            _presigned_cache.pop(cache_key, None)


def get_object_bytes(key: str) -> bytes | None:
    if not str(key or "").strip():
        return None
    try:
        response = _client().get_object(Bucket=_bucket(), Key=key)
    except ClientError as exc:
        error_code = str((exc.response or {}).get("Error", {}).get("Code") or "")
        if error_code in _NO_SUCH_KEY_CODES:
            return None
        raise
    return response["Body"].read()


def generate_presigned_url(key: str, ttl_seconds: int) -> str:
    """Gera URL assinada, reaproveitando a mesma URL enquanto ela ainda tem
    boa parte do TTL restante. Isso permite que o navegador reutilize o
    cache HTTP da imagem (ver Cache-Control em upload_object) em vez de
    baixar de novo a cada listagem, já que o objeto é imutável."""
    ttl_seconds = int(ttl_seconds)
    cache_key = (key, ttl_seconds)
    now = time.time()
    refresh_margin = max(ttl_seconds * 0.1, 3600)

    with _presigned_cache_lock:
        cached = _presigned_cache.get(cache_key)
        if cached and cached[1] - now > refresh_margin:
            return cached[0]

    url = _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": key},
        ExpiresIn=ttl_seconds,
    )

    with _presigned_cache_lock:
        if len(_presigned_cache) >= _PRESIGNED_CACHE_MAX_ENTRIES:
            expired = [k for k, (_, expires_at) in _presigned_cache.items() if expires_at <= now]
            for k in expired:
                _presigned_cache.pop(k, None)
        _presigned_cache[cache_key] = (url, now + ttl_seconds)
    return url
