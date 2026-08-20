"""
Testa a integração com o bucket R2 de comprovantes (credenciais, upload, presigned URL, download e delete).
Uso: cd count && python scripts/testar_r2_comprovantes.py
Pede o caminho de uma imagem local via input() e faz upload/download/delete de teste no bucket real.
"""

import hashlib
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from salesCount_app.config import Config
from salesCount_app.integrations import r2_storage_client

TEST_KEY_PREFIX = "entregas/_teste-manual"


def main() -> None:
    print("Config lida:")
    print(f"  R2_ACCOUNT_ID           = {Config.R2_ACCOUNT_ID!r}")
    print(f"  R2_BUCKET_COMPROVANTES  = {Config.R2_BUCKET_COMPROVANTES!r}")
    print(f"  R2_ACCESS_KEY_ID        = {Config.R2_ACCESS_KEY_ID[:4]}... (oculto)")
    print()

    caminho = input("Caminho completo da imagem local para testar upload: ").strip().strip('"')
    if not os.path.isfile(caminho):
        print(f"ERRO: arquivo não encontrado: {caminho}")
        sys.exit(1)

    file_name = os.path.basename(caminho)
    key = f"{TEST_KEY_PREFIX}/{file_name}"
    content_type = "image/jpeg" if file_name.lower().endswith((".jpg", ".jpeg")) else "application/octet-stream"

    with open(caminho, "rb") as f:
        original_bytes = f.read()
    original_hash = hashlib.sha256(original_bytes).hexdigest()
    print(f"\nArquivo lido: {len(original_bytes):,} bytes, sha256={original_hash[:16]}...")

    print(f"\n1) Upload -> key={key!r}")
    r2_storage_client.upload_object(key, original_bytes, content_type)
    print("   OK")

    print("\n2) Gerar URL assinada (TTL 5 min)")
    url = r2_storage_client.generate_presigned_url(key, ttl_seconds=300)
    print(f"   {url}")
    print("   Abra essa URL no navegador para confirmar que a imagem carrega.")

    print("\n3) Download via get_object_bytes")
    downloaded = r2_storage_client.get_object_bytes(key)
    if downloaded is None:
        print("   ERRO: objeto não encontrado logo após upload")
        sys.exit(1)
    downloaded_hash = hashlib.sha256(downloaded).hexdigest()
    print(f"   {len(downloaded):,} bytes, sha256={downloaded_hash[:16]}...")
    print("   Hash confere!" if downloaded_hash == original_hash else "   ERRO: hash diferente do original!")

    resposta = input("\n4) Apagar o objeto de teste do bucket agora? [S/n] ").strip().lower()
    if resposta in ("", "s", "sim", "y", "yes"):
        r2_storage_client.delete_object(key)
        ainda_existe = r2_storage_client.get_object_bytes(key)
        if ainda_existe is None:
            print("   Apagado e confirmado (get_object_bytes retornou None).")
        else:
            print("   ERRO: objeto ainda existe após delete_object")
    else:
        print(f"   Mantido no bucket em: {key}")

    print("\nTeste concluído.")


if __name__ == "__main__":
    main()
