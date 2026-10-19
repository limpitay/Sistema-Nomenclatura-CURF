#!/usr/bin/env bash
# Genera el certificado autofirmado para HTTPS (certs/nomenclatura.crt + certs/nomenclatura.key).
# Mismo esquema que ad-reorg. Uso: bash scripts/certificado.sh [nombre-o-ip ...]
#   Sin argumentos usa el hostname, el FQDN y las IPv4 del servidor. Ej: bash scripts/certificado.sh nomenclatura.curf.net 192.168.14.167
# Si tienen una CA interna, mejor pedir ahí el certificado y dejarlo en certs/ con estos mismos nombres.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs

nombres=("$@")
if [ ${#nombres[@]} -eq 0 ]; then
  # IPv4 de las placas de red reales (sin las de Docker: docker0, br-*, veth*)
  # shellcheck disable=SC2207
  ips=($(ip -4 -o addr show scope global | awk '$2 !~ /^(docker|br-|veth)/ { split($4, a, "/"); print a[1] }'))
  nombres=("$(hostname)" "$(hostname -f 2>/dev/null || true)" "${ips[@]}")
fi

san=""; cn=""
for n in "${nombres[@]}"; do
  [ -z "$n" ] && continue
  if [[ $n =~ ^[0-9.]+$ || $n == *:* ]]; then t="IP:$n"; else t="DNS:$n"; fi
  [[ ",$san," == *",$t,"* ]] && continue
  san="${san:+$san,}$t"
  cn="${cn:-$n}"
done

if [ -f certs/nomenclatura.crt ]; then
  sufijo=$(date +%Y%m%d-%H%M%S)
  mv certs/nomenclatura.crt "certs/nomenclatura.crt.$sufijo.bak"
  mv certs/nomenclatura.key "certs/nomenclatura.key.$sufijo.bak" 2>/dev/null || true
  echo "El certificado anterior quedó como certs/*.$sufijo.bak"
fi

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 825 \
  -keyout certs/nomenclatura.key -out certs/nomenclatura.crt \
  -subj "/CN=$cn/O=CURF Nomenclatura" -addext "subjectAltName=$san" 2>/dev/null
chmod 600 certs/nomenclatura.key

echo "Certificado generado para: $san (vence en 825 días)"
echo "Para que los navegadores no muestren la advertencia, instalar certs/nomenclatura.crt en"
echo "'Entidades de certificación raíz de confianza' de cada PC (o por GPO)."
if [ -n "$(docker compose -f docker-compose.prod.yml ps -q frontend 2>/dev/null)" ]; then
  docker compose -f docker-compose.prod.yml restart frontend
fi
